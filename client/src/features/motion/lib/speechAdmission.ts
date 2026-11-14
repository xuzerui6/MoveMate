// 主动发言的优先级准入（Muse×Codex 定版的优先级矩阵，Phase 1 落地部分）。
//
// 矩阵（数字越小越优先）：
//   0 用户停/静音/打断 —— 不是事件，由 UI 直接执行，不进这里
//   1 持续出画 / 追踪丢失 —— tracking
//   2 用户主动发起的对话（含点名看动作）—— 不是事件，是通道状态
//   3 正在播的小智回复 —— 不是事件，是通道状态（短句说完，不被常规事件打断）
//   4 新鲜的重复动作问题 / 有佐证的视觉指导 —— formCue
//   5 计数里程碑 —— milestone
//   6 主动鼓励 —— encouragement
//
// 准入只决定「现在说 / 先攒着 / 算了」：
// - 通道空闲（idle）或对话窗开着且安静（listening）时，事件可以直接说。
// - 通道忙（thinking=用户刚说完在等回复，speaking=小智正在说）时，只攒
//   一个最要紧的，且有保鲜期；过期直接作废，绝不补播旧数字、旧纠正。
//   tracking 例外：在播的是自动内容时可以打断它先说；在播的是用户问来的
//   回复时不抢，先攒着、到空隙再说。
// - encouragement 最弱：忙时直接丢弃，忙完也不补。
// - 通道离线（offline：断线/fallback）时一律不投递（字幕照常走本地）。
//
// 纯逻辑、无 IO，可单测。

export type ProactiveKind = 'tracking' | 'formCue' | 'milestone' | 'encouragement'

export const SPEECH_RANK: Record<ProactiveKind, number> = {
  tracking: 1,
  formCue: 4,
  milestone: 5,
  encouragement: 6,
}

/** 通道相位：idle=会话在但没人说话；listening=对话窗开着且安静；thinking=用户刚说完在等回复；speaking=小智正在说；offline=语音不可用。 */
export type ChannelPhase = 'idle' | 'listening' | 'thinking' | 'speaking' | 'offline'

export interface SpeechEvent {
  kind: ProactiveKind
  /** 本地事实行（字幕先行，数字/措辞以本地为准） */
  text: string
  /** 对话通道触发句（第一人称真实状态汇报） */
  prompt: string
}

export interface PendingSpeech extends SpeechEvent {
  createdAt: number
  expiresAt: number
}

export type Admission =
  | { action: 'now'; interrupt: boolean }
  | { action: 'hold'; pending: PendingSpeech }
  | { action: 'drop' }

/** 各类事件攒着时的保鲜期：过期作废，不补播。 */
const HOLD_TTL_MS: Record<ProactiveKind, number> = {
  tracking: 6_000,
  formCue: 5_000,
  milestone: 5_000,
  encouragement: 0,
}

export function admitSpeech(
  event: SpeechEvent,
  channel: ChannelPhase,
  now: number,
  current: PendingSpeech | null,
  /** speaking 相位时，正在播的是不是自动投递的内容（而非用户问来的回复） */
  playingAuto = false,
): Admission {
  if (channel === 'offline') return { action: 'drop' }
  const busy = channel === 'thinking' || channel === 'speaking'
  if (!busy) return { action: 'now', interrupt: false }
  if (event.kind === 'tracking' && channel === 'speaking' && playingAuto) {
    return { action: 'now', interrupt: true }
  }
  if (event.kind === 'encouragement') return { action: 'drop' }
  // 忙时只攒一个：新事件比攒着的更要紧（rank 更小）或同级（更新鲜），才替换。
  if (current && SPEECH_RANK[event.kind] > SPEECH_RANK[current.kind]) return { action: 'drop' }
  return {
    action: 'hold',
    pending: { ...event, createdAt: now, expiresAt: now + HOLD_TTL_MS[event.kind] },
  }
}

/** 攒着的事件是否已过期（过期就丢，不补播）。 */
export function pendingSpeechExpired(pending: PendingSpeech | null, now: number): boolean {
  return !pending || now >= pending.expiresAt
}
