/**
 * 打怪声音：击中音效是本机合成的短音（不占素材、不等网络），
 * 关键节点播报走小智播报器（lib/xiaozhiAnnounce，全产品唯一的事件
 * 发声通道，老板 2026-11-13 拍板「全都用小智」）。小智不可用时播报
 * 静默降级——只剩音效和画面，绝不回退到其他音色。
 * 一个开关管全部声音，默认开，关了就彻底安静；选择记在本机。
 */
import { primeXiaozhiAnnouncer, speakAnnouncement, stopXiaozhiAnnouncer, type AnnouncePriority } from './xiaozhiAnnounce'

const SOUND_KEY = 'movemate:boss-sound'

export function loadBossSoundOn(): boolean {
  try {
    return globalThis.localStorage?.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

export function saveBossSoundOn(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(SOUND_KEY, on ? 'on' : 'off')
  } catch {
    /* 记不住就算了 */
  }
}

let ctx: AudioContext | null = null
function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = globalThis.AudioContext || (globalThis as any).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** 用户手势里调用一次，解锁后续自动播放，并预热小智播报会话 */
export function primeBossAudio(): void {
  primeXiaozhiAnnouncer()
  audio()
}

/** 关声音 / 离开战斗页时调用：释放小智播报会话（租约还回池子） */
export function releaseBossAudio(): void {
  stopXiaozhiAnnouncer()
}

function blip(freqA: number, freqB: number, at: number, dur = 0.09, gainPeak = 0.16, type: OscillatorType = 'triangle') {
  const ac = audio()
  if (!ac) return
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  const t0 = ac.currentTime + at
  osc.type = type
  osc.frequency.setValueAtTime(freqA, t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqB), t0 + dur)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

let lastHitAt = 0
/** 击中音效：每次数被服务端账本接受前先给本机反馈（方案的两层呈现）；节流防连珠炮 */
export function playHit(on: boolean): void {
  if (!on) return
  const now = performance.now()
  if (now - lastHitAt < 110) return
  lastHitAt = now
  const base = 340 + Math.random() * 60
  blip(base, base * 0.55, 0, 0.08, 0.14)
}

export type BossCueKind = 'start' | 'half' | 'stageMid' | 'low' | 'win' | 'escape'

const CUE_NOTES: Record<BossCueKind, Array<[number, number, number]>> = {
  // [起始频率, 结束频率, 延迟秒]
  start: [[392, 392, 0], [523, 523, 0.09], [659, 659, 0.18]],
  half: [[523, 494, 0], [392, 370, 0.1]],
  stageMid: [[523, 494, 0], [440, 415, 0.1]],
  low: [[330, 262, 0], [262, 196, 0.12]],
  win: [[523, 523, 0], [659, 659, 0.1], [784, 784, 0.2], [1047, 1047, 0.3]],
  escape: [[392, 330, 0], [330, 262, 0.12]],
}

export function playCue(kind: BossCueKind, on: boolean): void {
  if (!on) return
  for (const [a, b, at] of CUE_NOTES[kind]) blip(a, b, at, 0.12, 0.15, 'triangle')
}

const ANNOUNCEMENTS: Record<BossCueKind, string> = {
  start: '开打啦，一起上！',
  half: '怪兽已经半血啦，继续加油！',
  stageMid: '它喘起来了，再加把劲！',
  low: '它快撑不住啦，再加把劲！',
  win: '打赢啦！',
  escape: '时间到啦，它跑了。没关系，你练的都算数。',
}

/** 胜负是终局播报，可以顶替正在播的一句；其余播报排队靠边、忙了就丢 */
const CUE_PRIORITY: Record<BossCueKind, AnnouncePriority> = {
  start: 'normal', half: 'normal', stageMid: 'normal', low: 'normal', win: 'high', escape: 'high',
}

let announceToken = 0
/** 播报一句：走小智播报器；新播报顶掉还没出声的旧播报（远距离模式的主通道） */
export function announceText(text: string, on: boolean, priority: AnnouncePriority = 'normal'): void {
  if (!on) return
  const token = ++announceToken
  void speakAnnouncement(text, { priority, stillCurrent: () => token === announceToken })
}

/** 节点播报：提示音 + 语音 */
export function announceCue(kind: BossCueKind, on: boolean): void {
  playCue(kind, on)
  announceText(ANNOUNCEMENTS[kind], on, CUE_PRIORITY[kind])
}

/** 次数里程碑（远距离模式）：每跨一个整十喊一次现在的数 */
export function announceRepMilestone(n: number, on: boolean): void {
  announceText(`${n} 个啦，继续！`, on)
}

const FRAME_ALERT_VOICE = {
  gone: '我看不到你啦，回到画面中间来。',
  left: '往左一点。',
  right: '往右一点。',
  back: '往后一步，让我看到你全身。',
} as const

/** 出画播报（远距离模式）：方向照着追踪状态给，喊的节奏由页面节流 */
export function announceFrameAlert(kind: keyof typeof FRAME_ALERT_VOICE, on: boolean): void {
  announceText(FRAME_ALERT_VOICE[kind], on)
}
