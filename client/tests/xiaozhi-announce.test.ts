import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createXiaozhiAnnouncer,
  type AnnouncerEnv,
  type AnnouncerPlayback,
  type AnnouncerSocket,
  type XiaozhiAnnouncer,
} from '../src/features/motion/lib/xiaozhiAnnounce.ts'

/* 假时钟：手动推进，定时器按到期顺序触发 */
class FakeClock {
  t = 0
  private seq = 0
  private timers = new Map<number, { at: number; fn: () => void; interval?: number }>()
  now = () => this.t
  setTimeout = (fn: () => void, ms: number) => {
    const id = ++this.seq
    this.timers.set(id, { at: this.t + ms, fn })
    return id
  }
  setInterval = (fn: () => void, ms: number) => {
    const id = ++this.seq
    this.timers.set(id, { at: this.t + ms, fn, interval: ms })
    return id
  }
  clearTimeout = (handle: unknown) => { this.timers.delete(handle as number) }
  clearInterval = (handle: unknown) => { this.timers.delete(handle as number) }
  advance(ms: number) {
    const end = this.t + ms
    for (;;) {
      let earliest: [number, { at: number; fn: () => void; interval?: number }] | null = null
      for (const entry of this.timers) {
        if (entry[1].at <= end && (!earliest || entry[1].at < earliest[1].at)) earliest = entry
      }
      if (!earliest) break
      const [id, timer] = earliest
      this.t = timer.at
      if (timer.interval) timer.at = this.t + timer.interval
      else this.timers.delete(id)
      timer.fn()
    }
    this.t = end
  }
}

class FakeSocket implements AnnouncerSocket {
  readyState = 1
  sent: string[] = []
  onmessage: AnnouncerSocket['onmessage'] = null
  onclose: AnnouncerSocket['onclose'] = null
  onerror: AnnouncerSocket['onerror'] = null
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = 3 }
  emit(data: unknown) { this.onmessage?.({ data }) }
  emitJson(value: unknown) { this.emit(JSON.stringify(value)) }
  serverClose(code: number) { this.readyState = 3; this.onclose?.({ code }) }
  deviceCalls(): string[] {
    return this.sent
      .map(raw => { try { return JSON.parse(raw) } catch { return null } })
      .filter(message => message?.type === 'listen' && message?.state === 'detect')
      .map(message => String(message.text))
  }
  aborts(): number {
    return this.sent.filter(raw => raw.includes('"abort"')).length
  }
}

class FakePlayback implements AnnouncerPlayback {
  decoded: ArrayBuffer[] = []
  clears = 0
  configured: number[] = []
  unlocks = 0
  private drainCb: (() => void) | null = null
  unlock() { this.unlocks += 1; return Promise.resolve() }
  configure(sampleRate: number) { this.configured.push(sampleRate) }
  decode(packet: ArrayBuffer) { this.decoded.push(packet) }
  clear() { this.clears += 1 }
  dispose() { return Promise.resolve() }
  setOnDrain(cb: (() => void) | null) { this.drainCb = cb }
  drain() { this.drainCb?.() }
}

interface Harness {
  announcer: XiaozhiAnnouncer
  clock: FakeClock
  socket: FakeSocket
  playback: FakePlayback
  released: Array<string | null>
  bootstrapCalls: () => number
}

function makeHarness(bootstrapResult: { leaseId: string | null } | null = { leaseId: 'lease-1' }): Harness {
  const clock = new FakeClock()
  const socket = new FakeSocket()
  const playback = new FakePlayback()
  const released: Array<string | null> = []
  let calls = 0
  const env: AnnouncerEnv = {
    bootstrap: async () => { calls += 1; return bootstrapResult },
    release: id => { released.push(id) },
    openSocket: () => socket,
    createPlayback: () => playback,
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
  }
  return { announcer: createXiaozhiAnnouncer(env), clock, socket, playback, released, bootstrapCalls: () => calls }
}

const flushMicro = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve() }
async function elapse(h: Harness, ms: number) {
  for (let done = 0; done < ms; done += 10) {
    h.clock.advance(10)
    await flushMicro()
  }
}

/** prime 并走完握手，进入 ready */
async function primeReady(h: Harness) {
  h.announcer.prime()
  await flushMicro()
  h.socket.emitJson({ bridge: 'ready' })
  h.socket.emitJson({ type: 'hello', session_id: 's1', audio_params: { sample_rate: 24_000 } })
  await elapse(h, 200)
  assert.equal(h.announcer.state(), 'ready')
}

const packet = (byte: number) => new Uint8Array([byte]).buffer

test('逐字播报：验真前音频只进缓冲，sentence_start 对上原文才开门播放', async () => {
  const h = makeHarness()
  await primeReady(h)
  assert.equal(h.playback.unlocks >= 1, true, 'prime 应在手势里解锁播放管线')

  let beforePlay = 0
  const spoken = h.announcer.speak('它喘起来了，再加把劲！', { onBeforePlay: () => { beforePlay += 1 } })
  await flushMicro()
  assert.deepEqual(h.socket.deviceCalls(), ['[device_call]它喘起来了，再加把劲！'])

  h.socket.emitJson({ type: 'tts', state: 'start' })
  h.socket.emit(packet(1)) // 验真前到达的包只许缓冲
  assert.equal(h.playback.decoded.length, 0)
  h.socket.emitJson({ type: 'tts', state: 'sentence_start', text: '它喘起来了，再加把劲！' })
  assert.equal(beforePlay, 1)
  assert.equal(h.playback.decoded.length, 1, '验真后缓冲包应 flush 进解码')
  h.socket.emit(packet(2))
  assert.equal(h.playback.decoded.length, 2)

  let resolved: boolean | null = null
  void spoken.then(value => { resolved = value })
  h.socket.emitJson({ type: 'tts', state: 'stop' })
  await flushMicro()
  assert.equal(resolved, null, 'tts stop 后还要等本地播完（drain）才算完成')
  h.playback.drain()
  await flushMicro()
  assert.equal(resolved, true)
  const stats = h.announcer.latencyStats()
  assert.equal(stats.spoken, 1)
  assert.notEqual(stats.samples[0].sentenceStartMs, null)
  assert.notEqual(stats.samples[0].firstPacketMs, null)
})

test('TTS 分句：逐段累积仍是原文前缀就算验真通过', async () => {
  const h = makeHarness()
  await primeReady(h)
  const spoken = h.announcer.speak('时间到啦，它跑了。没关系，你练的都算数。')
  await flushMicro()
  h.socket.emitJson({ type: 'tts', state: 'start' })
  h.socket.emitJson({ type: 'tts', state: 'sentence_start', text: '时间到啦，它跑了。' })
  h.socket.emit(packet(1))
  h.socket.emitJson({ type: 'tts', state: 'sentence_start', text: '没关系，你练的都算数。' })
  h.socket.emit(packet(2))
  h.socket.emitJson({ type: 'tts', state: 'stop' })
  h.playback.drain()
  assert.equal(await spoken, true)
  assert.equal(h.playback.decoded.length, 2)
  assert.equal(h.announcer.state(), 'ready')
})

test('语义不一致：音频绝不出门，abort 后 1 次即熔断本页播报', async () => {
  const h = makeHarness()
  await primeReady(h)
  const spoken = h.announcer.speak('打赢啦！')
  await flushMicro()
  h.socket.emitJson({ type: 'tts', state: 'start' })
  h.socket.emit(packet(9))
  // 云端走了 LLM 路：回的根本不是这句
  h.socket.emitJson({ type: 'tts', state: 'sentence_start', text: '好的，接下来我们聊聊今天的训练吧' })
  assert.equal(await spoken, false)
  assert.equal(h.playback.decoded.length, 0, '没验真的音频一个包都不许播')
  assert.equal(h.socket.aborts() >= 1, true)
  assert.equal(h.announcer.state(), 'broken')
  assert.deepEqual(h.released, ['lease-1'], '熔断要把租约还回池子')
  // 熔断后后续播报直接作废，不再发任何东西
  const sentBefore = h.socket.sent.length
  assert.equal(await h.announcer.speak('它喘起来了，再加把劲！'), false)
  assert.equal(h.socket.sent.length, sentBefore)
})

test('无待播报时云端自发开口：关门、打断、熔断', async () => {
  const h = makeHarness()
  await primeReady(h)
  h.socket.emitJson({ type: 'tts', state: 'sentence_start', text: '你好呀，今天想练点什么？' })
  assert.equal(h.playback.decoded.length, 0)
  assert.equal(h.socket.aborts() >= 1, true)
  assert.equal(h.announcer.state(), 'broken')
})

test('确认超时：3 秒没等到验真就作废；连续两次拆掉会话', async () => {
  const h = makeHarness()
  await primeReady(h)
  const first = h.announcer.speak('10 个啦，继续！')
  await flushMicro()
  await elapse(h, 3_100)
  assert.equal(await first, false)
  assert.equal(h.socket.aborts() >= 1, true)
  assert.equal(h.announcer.state(), 'ready', '一次超时只是传输失败，会话留着')

  const second = h.announcer.speak('20 个啦，继续！')
  await flushMicro()
  await elapse(h, 3_100)
  assert.equal(await second, false)
  assert.equal(h.announcer.state(), 'down', '连续两次超时应拆会话，等下次需求再重建')
  assert.deepEqual(h.released, ['lease-1'])
})

test('忙时普通播报丢弃，高优先顶替要等旧流收尾才发', async () => {
  const h = makeHarness()
  await primeReady(h)
  const first = h.announcer.speak('它喘起来了，再加把劲！')
  await flushMicro()
  h.socket.emitJson({ type: 'tts', state: 'start' })
  h.socket.emitJson({ type: 'tts', state: 'sentence_start', text: '它喘起来了，再加把劲！' })

  // 正在播：普通优先直接丢，不发第二个 device_call
  assert.equal(await h.announcer.speak('10 个啦，继续！'), false)
  assert.equal(h.socket.deviceCalls().length, 1)

  // 高优先顶替：先打断旧的，等旧的 stop 回来才发新的
  const win = h.announcer.speak('打赢啦！', { priority: 'high' })
  await flushMicro()
  assert.equal(await first, false, '被顶替的播报按未播完结算')
  assert.equal(h.socket.deviceCalls().length, 1, '旧流没收尾前不许发新的，防帧串话')
  h.socket.emitJson({ type: 'tts', state: 'stop' })
  await flushMicro()
  assert.equal(h.socket.deviceCalls().length, 2)
  assert.equal(h.socket.deviceCalls()[1], '[device_call]打赢啦！')
  h.socket.emitJson({ type: 'tts', state: 'start' })
  h.socket.emitJson({ type: 'tts', state: 'sentence_start', text: '打赢啦！' })
  h.socket.emitJson({ type: 'tts', state: 'stop' })
  h.playback.drain()
  assert.equal(await win, true)
})

test('池子忙/未开通：bootstrap 失败后播报静默降级，单飞不重试风暴', async () => {
  const h = makeHarness(null)
  h.announcer.prime()
  await elapse(h, 300)
  assert.equal(h.announcer.state(), 'down')
  assert.equal(await h.announcer.speak('开打啦，一起上！'), false)
  assert.equal(await h.announcer.speak('打赢啦！', { priority: 'high' }), false)
  assert.equal(h.bootstrapCalls(), 1, '退避期内不许反复敲池子')
  assert.equal(h.socket.sent.length, 0)
})

test('过期的播报（stillCurrent 已失效）绝不发送', async () => {
  const h = makeHarness()
  await primeReady(h)
  const sentBefore = h.socket.sent.length
  assert.equal(await h.announcer.speak('往左一点。', { stillCurrent: () => false }), false)
  assert.equal(h.socket.sent.length, sentBefore)
})

test('桥接闲置关断（4001）后：本次播报不等重连，后台重建供后续使用', async () => {
  const h = makeHarness()
  await primeReady(h)
  h.socket.serverClose(4001)
  assert.equal(h.announcer.state(), 'down')

  // 会话已死：这一句立刻作废（不排队等重连），但触发后台重建
  assert.equal(await h.announcer.speak('它快撑不住啦，再加把劲！'), false)
  await flushMicro()
  assert.equal(h.bootstrapCalls(), 2)
  h.socket.readyState = 1
  h.socket.emitJson({ bridge: 'ready' })
  h.socket.emitJson({ type: 'hello', session_id: 's2', audio_params: { sample_rate: 24_000 } })
  await elapse(h, 200)
  assert.equal(h.announcer.state(), 'ready')

  const spoken = h.announcer.speak('它快撑不住啦，再加把劲！')
  await flushMicro()
  h.socket.emitJson({ type: 'tts', state: 'start' })
  h.socket.emitJson({ type: 'tts', state: 'sentence_start', text: '它快撑不住啦，再加把劲！' })
  h.socket.emitJson({ type: 'tts', state: 'stop' })
  h.playback.drain()
  assert.equal(await spoken, true)
})

test('stop：打断当前播报并释放租约', async () => {
  const h = makeHarness()
  await primeReady(h)
  const spoken = h.announcer.speak('开打啦，一起上！')
  await flushMicro()
  h.announcer.stop()
  assert.equal(await spoken, false)
  assert.deepEqual(h.released, ['lease-1'])
  assert.equal(h.announcer.state(), 'off')
})
