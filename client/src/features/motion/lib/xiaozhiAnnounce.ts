/**
 * 小智事件播报器 —— 全产品唯一的「事件发声」通道。
 *
 * 老板 2026-11-13 拍板「全都用小智」：凡是应用事件触发的语音播报（打怪
 * 节点、出画提醒、整组报数一类），只许走小智官方音色，不再用神经 TTS
 * 或浏览器合成。陪练对话本来就走小智，不归这里管；这里只管「事件 →
 * 一句预先定好的话」。
 *
 * 怎么让小智主动开口：小智协议没有「推送文本 TTS」的消息，云端只讲它
 * 自己 LLM 的回复。但 listen detect 带 `[device_call]` 前缀的文本会被
 * 服务端逐字送进 TTS（设备来电通道，开源服务端 listenMessageHandler
 * 实证）。生产上游是 tenclass 商业云、是否同样 honor 无法本地证实，
 * 所以本模块按「乐观发送 + 逐句验真 + 失败熔断」设计：
 *
 * - 播放门（fail-closed）：下行 Opus 包先进缓冲，只有当 tts
 *   sentence_start 的文本与播报原文对得上（按句累积、去标点比对前缀）
 *   才开门解码播放；对不上一律丢弃并 abort。
 * - 语义不一致（云端走了 LLM 路）1 次即熔断本页播报；无待播报时云端
 *   自发开口同样关门 + 熔断——共享智能体不许自说自话。
 * - 确认超时（3s 没等到对得上的 sentence_start）只算传输失败：本次
 *   播报作废（音效/视觉已经覆盖当下），连续 2 次才拆会话重连。
 * - 池子忙 / 未开通 / 连接失败：播报静默降级为「只有音效和视觉」，
 *   绝不回退到任何非小智音色（这是音色同一性决策，不是可用性兜底）。
 *
 * 会话拓扑：页面级单例，用户手势里 prime() 时按陪练同款bootstrap
 * （/ai/__status → /api/xiaozhi/device 租约 → /api/xiaozhi/socket）
 * 建一条只播不录的会话（不开麦克风、MCP 只回空工具表），整场持有；
 * stop() 时释放租约。桥接层 120 秒无活动会关连接——不造假活动保活，
 * 会话死了就死了：下一次播报不等重连、直接作废，后台单飞重建供后续
 * 播报用（已在重建中的最多等 1200ms，且等完还要复检播报没过期）。
 *
 * 唯一开关：XIAOZHI_ANNOUNCE_ROUTE。置 'off' 时播报器恒不可用，
 * 所有事件只剩音效与视觉。
 */
import { XiaozhiAudio } from './xiaozhiAudio'
import { abortMessage, deviceCallMessage, helloMessage, mcpError, mcpResult } from './xiaozhiProtocol'

export const XIAOZHI_ANNOUNCE_ROUTE: 'xiaozhi' | 'off' = 'xiaozhi'

const CONFIRM_TIMEOUT_MS = 3_000
const BOOT_WAIT_MS = 1_200
const DRAIN_WAIT_MS = 600
const DRAIN_FALLBACK_MS = 1_200
const PLAY_WATCHDOG_MS = 15_000
const HANDSHAKE_TIMEOUT_MS = 20_000
const HEARTBEAT_MS = 15_000
const PONG_WATCHDOG_MS = 45_000
const MAX_BUFFERED_PACKETS = 60
const BOOT_BACKOFF_MS = [0, 2_000, 8_000, 30_000]
const OPEN = 1

export type AnnouncePriority = 'normal' | 'high'
export type AnnouncerState = 'off' | 'booting' | 'ready' | 'down' | 'broken'

export interface SpeakOptions {
  priority?: AnnouncePriority
  /** 发送前（含等待重连后）复检：返回 false 表示这句已经过期，绝不发送 */
  stillCurrent?: () => boolean
  /** 从 speak 调用起的最大可接受年龄，超了直接作废（方向类播报尤其要紧） */
  maxAgeMs?: number
  /** 播放门打开、声音即将出声时回调（给识别互斥编排用） */
  onBeforePlay?: () => void
}

export interface AnnounceLatencySample {
  ok: boolean
  sentenceStartMs: number | null
  firstPacketMs: number | null
  totalMs: number | null
}

export interface AnnouncerSocket {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number }) => void) | null
  onerror: (() => void) | null
}

export interface AnnouncerPlayback {
  unlock(): Promise<void>
  configure(sampleRate: number): void
  decode(packet: ArrayBuffer): void
  clear(): void
  dispose(): Promise<void>
  setOnDrain(cb: (() => void) | null): void
}

export interface AnnouncerEnv {
  /** 拿租约：成功返回 leaseId（个人模式可为 null）；不可用返回 null */
  bootstrap(clientId: string): Promise<{ leaseId: string | null } | null>
  release(leaseId: string | null): void
  openSocket(): AnnouncerSocket
  createPlayback(): AnnouncerPlayback
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  setInterval(fn: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

interface Pending {
  text: string
  heard: string
  dispatchedAt: number
  stage: 'awaiting' | 'playing'
  gateOpen: boolean
  buffered: ArrayBuffer[]
  sentenceStartMs: number | null
  firstPacketMs: number | null
  stopSeen: boolean
  onBeforePlay?: () => void
  resolve: (ok: boolean) => void
  confirmTimer: unknown
  playTimer: unknown
  drainTimer: unknown
}

const normalize = (value: string): string => value.replace(/[\s，。！？；：、,.!?;:「」『』"']/g, '')

export interface XiaozhiAnnouncer {
  prime(): void
  stop(): void
  speak(text: string, opts?: SpeakOptions): Promise<boolean>
  cancel(): void
  state(): AnnouncerState
  latencyStats(): { samples: AnnounceLatencySample[]; spoken: number; dropped: number }
}

export function createXiaozhiAnnouncer(env: AnnouncerEnv): XiaozhiAnnouncer {
  const clientId = (() => {
    try { return crypto.randomUUID() } catch { return `announcer-${Math.random().toString(36).slice(2)}` }
  })()
  let state: AnnouncerState = 'off'
  let socket: AnnouncerSocket | null = null
  let playback: AnnouncerPlayback | null = null
  let sessionId = ''
  let leaseId: string | null = null
  let pending: Pending | null = null
  let bootPromise: Promise<boolean> | null = null
  let bootAttempts = 0
  let lastBootFailAt = 0
  let transportStrikes = 0
  let broken = false
  let heartbeatTimer: unknown = null
  let handshakeTimer: unknown = null
  let lastPong = 0
  let drainBarrier: { resolve: () => void; timer: unknown } | null = null
  const samples: AnnounceLatencySample[] = []
  let spoken = 0
  let dropped = 0

  const now = () => env.now()
  const currentState = (): AnnouncerState => state

  function getPlayback(): AnnouncerPlayback {
    playback ||= env.createPlayback()
    playback.setOnDrain(() => {
      if (pending?.stopSeen) finishPending(true)
    })
    return playback
  }

  function sendJson(message: unknown): boolean {
    if (!socket || socket.readyState !== OPEN) return false
    try { socket.send(JSON.stringify(message)); return true } catch { return false }
  }

  function record(sample: AnnounceLatencySample) {
    samples.push(sample)
    if (samples.length > 20) samples.shift()
    if (sample.ok) spoken += 1
    else dropped += 1
  }

  function clearPendingTimers(item: Pending) {
    env.clearTimeout(item.confirmTimer)
    env.clearTimeout(item.playTimer)
    env.clearTimeout(item.drainTimer)
  }

  /** 结束当前播报（结算一次样本并 resolve）。gate 随之关闭。 */
  function finishPending(ok: boolean) {
    const item = pending
    if (!item) return
    pending = null
    clearPendingTimers(item)
    record({
      ok,
      sentenceStartMs: item.sentenceStartMs,
      firstPacketMs: item.firstPacketMs,
      totalMs: now() - item.dispatchedAt,
    })
    item.resolve(ok)
  }

  function failPending(ok = false) {
    if (!pending) return
    playback?.clear()
    finishPending(ok)
  }

  function releaseDrainBarrier() {
    if (!drainBarrier) return
    env.clearTimeout(drainBarrier.timer)
    const barrier = drainBarrier
    drainBarrier = null
    barrier.resolve()
  }

  /** 熔断：本页后续播报全部作废，直到下一次 prime（每场最多探一次）。 */
  function breakCircuit() {
    broken = true
    state = 'broken'
    failPending(false)
    releaseDrainBarrier()
    teardownSocket()
    if (leaseId) env.release(leaseId)
    leaseId = null
  }

  function teardownSocket() {
    env.clearTimeout(handshakeTimer)
    if (heartbeatTimer !== null) env.clearInterval(heartbeatTimer)
    heartbeatTimer = null
    const current = socket
    socket = null
    sessionId = ''
    if (current) {
      current.onmessage = null
      current.onclose = null
      current.onerror = null
      try { current.close(1000, 'announcer closed') } catch { /* already closed */ }
    }
  }

  function onSocketDown() {
    env.clearTimeout(handshakeTimer)
    if (heartbeatTimer !== null) env.clearInterval(heartbeatTimer)
    heartbeatTimer = null
    socket = null
    sessionId = ''
    failPending(false)
    releaseDrainBarrier()
    if (!broken) state = 'down'
  }

  function handleTts(message: { state?: string; text?: string }) {
    if (message.state === 'start') {
      if (!pending) {
        // 没有待播报还开口 = 云端自发说话：关门、打断、熔断
        sendJson(abortMessage('unsolicited_speech', sessionId || undefined))
        breakCircuit()
      }
      return
    }
    if (message.state === 'sentence_start') {
      const text = typeof message.text === 'string' ? message.text : ''
      if (!pending) {
        sendJson(abortMessage('unsolicited_speech', sessionId || undefined))
        breakCircuit()
        return
      }
      // TTS 会按标点把一句话切成几段逐段下发，累积起来必须仍是原文前缀
      const heard = pending.heard + text
      if (!normalize(pending.text).startsWith(normalize(heard))) {
        // 语义不一致：云端没走逐字通道（多半进了 LLM），1 次即熔断
        sendJson(abortMessage('announce_mismatch', sessionId || undefined))
        breakCircuit()
        return
      }
      pending.heard = heard
      if (pending.stage === 'awaiting') {
        pending.stage = 'playing'
        pending.gateOpen = true
        pending.sentenceStartMs = now() - pending.dispatchedAt
        env.clearTimeout(pending.confirmTimer)
        const buffered = pending.buffered.splice(0)
        const player = getPlayback()
        for (const packet of buffered) player.decode(packet)
        pending.onBeforePlay?.()
        pending.playTimer = env.setTimeout(() => {
          // 播报迟迟不结束：看门狗拆掉，别把后续播报永久堵死
          sendJson(abortMessage('announce_watchdog', sessionId || undefined))
          failPending(false)
        }, PLAY_WATCHDOG_MS)
      }
      return
    }
    if (message.state === 'stop') {
      if (drainBarrier) {
        releaseDrainBarrier()
        return
      }
      if (!pending) return
      if (pending.stage === 'awaiting') {
        // 还没验过任何一句就停了：这次没说成，按传输失败计
        transportStrikes += 1
        failPending(false)
        if (transportStrikes >= 2) {
          teardownSocket()
          if (leaseId) env.release(leaseId)
          leaseId = null
          state = 'down'
        }
        return
      }
      pending.stopSeen = true
      // 等本地把已排队的音频真正播完再算完成；等不到 drain 就用兜底计时
      pending.drainTimer = env.setTimeout(() => finishPending(true), DRAIN_FALLBACK_MS)
    }
  }

  function handleMessage(data: unknown) {
    if (data instanceof ArrayBuffer) {
      if (!pending) return // 无待播报时的音频一律丢弃（播放门关着）
      if (pending.firstPacketMs === null) pending.firstPacketMs = now() - pending.dispatchedAt
      if (pending.gateOpen) getPlayback().decode(data)
      else if (pending.buffered.length < MAX_BUFFERED_PACKETS) pending.buffered.push(data)
      return
    }
    let message: any
    try { message = JSON.parse(String(data)) } catch { return }
    if (message.bridge === 'pong') { lastPong = now(); return }
    if (message.bridge === 'ready') { sendJson(helloMessage()); return }
    if (message.bridge === 'error') { onSocketDown(); return }
    if (message.type === 'hello') {
      env.clearTimeout(handshakeTimer)
      sessionId = typeof message.session_id === 'string' ? message.session_id : ''
      const sampleRate = Number(message.audio_params?.sample_rate) || 24_000
      getPlayback().configure(sampleRate)
      transportStrikes = 0
      bootAttempts = 0
      state = 'ready'
      return
    }
    if (message.type === 'tts') return handleTts(message)
    if (message.type === 'mcp' && message.payload) {
      const payload = message.payload as { id?: string | number; method?: string }
      if (payload.id === undefined || !payload.method) return
      if (payload.method === 'initialize') {
        sendJson(mcpResult(payload.id, {
          protocolVersion: '2024-11-05', capabilities: { tools: {} },
          serverInfo: { name: 'movemate-announcer', version: '1.0.0' },
        }, sessionId || undefined))
      } else if (payload.method === 'tools/list') {
        sendJson(mcpResult(payload.id, { tools: [] }, sessionId || undefined))
      } else if (payload.method === 'tools/call') {
        sendJson(mcpError(payload.id, '播报通道不提供工具', sessionId || undefined))
      }
      return
    }
    // stt（[device_call] 的回显）/ llm 等一律忽略：播报器不进对话态
  }

  function startBoot(): Promise<boolean> {
    if (bootPromise) return bootPromise
    if (state === 'ready' && socket) return Promise.resolve(true)
    state = 'booting'
    bootPromise = (async () => {
      try {
        const boot = await env.bootstrap(clientId)
        if (!boot) {
          bootAttempts += 1
          lastBootFailAt = now()
          if (!broken) state = 'down'
          return false
        }
        leaseId = boot.leaseId
        const ws = env.openSocket()
        socket = ws
        lastPong = now()
        ws.onmessage = event => handleMessage(event.data)
        ws.onclose = () => { if (socket === ws) onSocketDown() }
        ws.onerror = () => { /* onclose 随后会到 */ }
        handshakeTimer = env.setTimeout(() => {
          if (state === 'booting') {
            teardownSocket()
            if (leaseId) env.release(leaseId)
            leaseId = null
            bootAttempts += 1
            lastBootFailAt = now()
            state = 'down'
          }
        }, HANDSHAKE_TIMEOUT_MS)
        heartbeatTimer = env.setInterval(() => {
          if (!socket || socket.readyState !== OPEN) return
          if (now() - lastPong > PONG_WATCHDOG_MS) {
            const current = socket
            onSocketDown()
            try { current?.close(4000, 'heartbeat timed out') } catch { /* ignore */ }
            return
          }
          try { socket.send(JSON.stringify({ bridge: 'ping' })) } catch { /* onclose 会处理 */ }
        }, HEARTBEAT_MS)
        // 等 hello 落地（或连接死掉）再结算这次 bootstrap
        const deadline = now() + HANDSHAKE_TIMEOUT_MS
        while (state === 'booting' && socket === ws && now() < deadline) {
          await new Promise<void>(resolve => env.setTimeout(() => resolve(), 50))
        }
        return currentState() === 'ready'
      } catch {
        bootAttempts += 1
        lastBootFailAt = now()
        if (!broken) state = 'down'
        return false
      } finally {
        bootPromise = null
      }
    })()
    return bootPromise
  }

  function backoffAllows(): boolean {
    if (!bootAttempts) return true
    const wait = BOOT_BACKOFF_MS[Math.min(bootAttempts, BOOT_BACKOFF_MS.length - 1)]
    return now() - lastBootFailAt >= wait
  }

  /** 确保会话可用：在建中的最多等 BOOT_WAIT_MS；已死的只在后台重建、本次不等 */
  async function ensureReady(startedAt: number, opts: SpeakOptions): Promise<boolean> {
    if (state === 'ready' && socket) return true
    if (broken || XIAOZHI_ANNOUNCE_ROUTE === 'off') return false
    const wasBooting = state === 'booting' || !!bootPromise
    if (!wasBooting && !backoffAllows()) return false
    const boot = startBoot()
    if (!wasBooting) return false
    const timeout = new Promise<boolean>(resolve => env.setTimeout(() => resolve(false), BOOT_WAIT_MS))
    const ok = await Promise.race([boot, timeout])
    if (!ok || state !== 'ready') return false
    if (opts.stillCurrent && !opts.stillCurrent()) return false
    if (opts.maxAgeMs && now() - startedAt > opts.maxAgeMs) return false
    return true
  }

  /** 高优先顶替：打断当前播报，等旧音频流收尾（stop 或超时）再发新的，防 v1 无 id 的帧串话 */
  async function preemptCurrent(): Promise<void> {
    if (!pending) return
    failPending(false)
    playback?.clear()
    sendJson(abortMessage('announce_preempt', sessionId || undefined))
    await new Promise<void>(resolve => {
      const timer = env.setTimeout(() => releaseDrainBarrier(), DRAIN_WAIT_MS)
      drainBarrier = { resolve, timer }
    })
  }

  function dispatch(text: string, opts: SpeakOptions): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      const item: Pending = {
        text, heard: '', dispatchedAt: now(), stage: 'awaiting', gateOpen: false,
        buffered: [], sentenceStartMs: null, firstPacketMs: null, stopSeen: false,
        onBeforePlay: opts.onBeforePlay, resolve,
        confirmTimer: null, playTimer: null, drainTimer: null,
      }
      pending = item
      item.confirmTimer = env.setTimeout(() => {
        if (pending !== item) return
        // 3 秒没等到对得上的 sentence_start：本次作废，按传输失败计
        sendJson(abortMessage('announce_timeout', sessionId || undefined))
        transportStrikes += 1
        failPending(false)
        if (transportStrikes >= 2) {
          teardownSocket()
          if (leaseId) env.release(leaseId)
          leaseId = null
          state = 'down'
        }
      }, CONFIRM_TIMEOUT_MS)
      if (!sendJson(deviceCallMessage(text, sessionId || undefined))) {
        failPending(false)
        onSocketDown()
      }
    })
  }

  async function speak(text: string, opts: SpeakOptions = {}): Promise<boolean> {
    const startedAt = now()
    try {
      if (!text || XIAOZHI_ANNOUNCE_ROUTE === 'off' || broken) return false
      if (opts.stillCurrent && !opts.stillCurrent()) return false
      if (!await ensureReady(startedAt, opts)) { dropped += 1; return false }
      if (opts.stillCurrent && !opts.stillCurrent()) { dropped += 1; return false }
      if (opts.maxAgeMs && now() - startedAt > opts.maxAgeMs) { dropped += 1; return false }
      if (pending) {
        if (opts.priority !== 'high') { dropped += 1; return false }
        await preemptCurrent()
        if (opts.stillCurrent && !opts.stillCurrent()) { dropped += 1; return false }
        if (state !== 'ready' || !socket) { dropped += 1; return false }
      }
      return await dispatch(text, opts)
    } catch {
      return false
    }
  }

  function prime() {
    if (XIAOZHI_ANNOUNCE_ROUTE === 'off') return
    broken = false
    transportStrikes = 0
    bootAttempts = 0
    // 必须在用户手势的调用栈里同步解锁播放管线，别等 bootstrap 回来
    try { void getPlayback().unlock().catch(() => undefined) } catch { /* 不支持就算了 */ }
    void startBoot()
  }

  function stop() {
    if (socket) sendJson(abortMessage('announcer_stop', sessionId || undefined))
    failPending(false)
    releaseDrainBarrier()
    teardownSocket()
    if (leaseId) env.release(leaseId)
    leaseId = null
    playback?.clear()
    state = 'off'
  }

  function cancel() {
    // 静音/打断用：只停当前这一句，会话留着
    if (!pending) { playback?.clear(); return }
    sendJson(abortMessage('announce_cancel', sessionId || undefined))
    failPending(false)
  }

  return {
    prime, stop, speak, cancel,
    state: () => state,
    latencyStats: () => ({ samples: [...samples], spoken, dropped }),
  }
}

/* ------------------------------------------------------------------ */
/* 浏览器环境（真实 bootstrap / 套接字 / 播放）与页面级单例             */
/* ------------------------------------------------------------------ */

function createBrowserEnv(): AnnouncerEnv {
  return {
    async bootstrap() {
      const token = (() => { try { return localStorage.getItem('token') } catch { return null } })()
      if (!token) return null
      try {
        const statusResponse = await fetch('/ai/__status', { headers: { Authorization: 'Bearer ' + token } })
        if (!statusResponse.ok) return null
        const status = await statusResponse.json() as { xiaozhiEnabled?: boolean }
        if (!status.xiaozhiEnabled) return null
        const response = await fetch('/api/xiaozhi/device', {
          method: 'POST', credentials: 'include',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: browserClientId() }),
        })
        if (!response.ok) return null
        const body = await response.json() as { status?: string; leaseId?: string }
        // activating 不在这里处理：激活是陪练面的用户流程，播报直接降级
        if (body.status !== 'ready') return null
        return { leaseId: body.leaseId || null }
      } catch {
        return null
      }
    },
    release(leaseId) {
      if (!leaseId) return
      const token = (() => { try { return localStorage.getItem('token') } catch { return null } })()
      void fetch('/api/xiaozhi/release', {
        method: 'POST', credentials: 'include', keepalive: true,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaseId }),
      }).catch(() => undefined)
    },
    openSocket() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${location.host}/api/xiaozhi/socket`)
      ws.binaryType = 'arraybuffer'
      return ws as unknown as AnnouncerSocket
    },
    createPlayback() {
      let drainCb: (() => void) | null = null
      const audio = new XiaozhiAudio(() => undefined, () => drainCb?.())
      return {
        unlock: () => audio.ensurePlaybackReady(),
        configure: (sampleRate: number) => audio.configureDecoder(sampleRate),
        decode: (packet: ArrayBuffer) => audio.decode(packet),
        clear: () => audio.clearPlayback(),
        dispose: () => audio.dispose(),
        setOnDrain: (cb: (() => void) | null) => { drainCb = cb },
      }
    },
    now: () => performance.now(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: handle => window.clearTimeout(handle as number),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: handle => window.clearInterval(handle as number),
  }
}

let browserClientIdCache = ''
function browserClientId(): string {
  if (!browserClientIdCache) {
    try { browserClientIdCache = crypto.randomUUID() } catch { browserClientIdCache = `announcer-${Math.random().toString(36).slice(2)}` }
  }
  return browserClientIdCache
}

let shared: XiaozhiAnnouncer | null = null
function sharedAnnouncer(): XiaozhiAnnouncer | null {
  if (typeof window === 'undefined') return null
  shared ||= createXiaozhiAnnouncer(createBrowserEnv())
  return shared
}

let pageHideBound = false
function bindPageHide() {
  if (pageHideBound || typeof window === 'undefined') return
  pageHideBound = true
  window.addEventListener('pagehide', () => shared?.stop())
}

/** 用户手势里调用：解锁播放 + 预热播报会话（单飞、失败静默降级） */
export function primeXiaozhiAnnouncer(): void {
  bindPageHide()
  sharedAnnouncer()?.prime()
}

/** 关声音 / 离开页面时调用：打断当前播报、关连接、释放租约 */
export function stopXiaozhiAnnouncer(): void {
  shared?.stop()
}

/** 打断当前这一句播报（静音、打断按钮用），会话保留 */
export function cancelAnnouncement(): void {
  shared?.cancel()
}

/**
 * 让小智逐字播报一句事件文案。返回 true 表示已验真并播完；
 * false 表示被丢弃/降级（池子忙、会话不可用、过期、被顶替）——
 * 调用方保持音效与视觉即可，绝不要回退到其他音色。
 */
export function speakAnnouncement(text: string, opts: SpeakOptions = {}): Promise<boolean> {
  const announcer = sharedAnnouncer()
  if (!announcer) return Promise.resolve(false)
  bindPageHide()
  return announcer.speak(text, opts)
}

/** 给 useCoachVoice 的生命周期型播报：onBeforePlay 在声音将出声时触发，Promise 恒 resolve */
export function speakWithLifecycle(
  text: string,
  hooks: { stillCurrent?: () => boolean; onBeforePlay?: () => void } = {},
): Promise<boolean> {
  return speakAnnouncement(text, { stillCurrent: hooks.stillCurrent, onBeforePlay: hooks.onBeforePlay })
}

export function getXiaozhiAnnouncerState(): AnnouncerState {
  return shared ? shared.state() : 'off'
}

export function getAnnounceLatencyStats(): { samples: AnnounceLatencySample[]; spoken: number; dropped: number } {
  return shared ? shared.latencyStats() : { samples: [], spoken: 0, dropped: 0 }
}
