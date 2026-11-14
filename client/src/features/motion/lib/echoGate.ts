// 播放排空门（回声门）：小智开口说话时，麦克风上行必须关着。
//
// 服务端发来「说完了」不等于本地扬声器已经放完——音频是提前排进本地
// 播放队列的，服务端停发后队列里还可能压着一截声音。如果这时立刻恢复
// 上行，它会把自己的尾音录回去，变成自问自答（Codex 评审指出的现行缺陷：
// 旧代码在 server stop 时立即 setSending(true)，且播放结束回调是空函数）。
//
// 纪律：server stop → 等本地播放真正排空 → 再多等一小段声学尾巴 → 才放行。
// 排空后若又有迟到音频包被排进队列（requeue），排空时间作废、重新等。
// 纯逻辑、无 IO，可单测；教练 hook 负责按真实音频状态喂事件。

/** 排空后再等的声学尾巴（设计区间 250–400ms，取中值）。 */
export const ACOUSTIC_TAIL_MS = 300

export type EchoGatePhase = 'open' | 'gated' | 'draining'

export interface EchoGateState {
  phase: EchoGatePhase
  /** 服务端说完的时刻（draining 起点） */
  stopAt: number
  /** 本地确认排空的时刻；0 = 还没排空 */
  drainedAt: number
}

export const createEchoGate = (): EchoGateState => ({ phase: 'open', stopAt: 0, drainedAt: 0 })

/** 服务端开始播报：关上行。 */
export function echoGateTtsStart(state: EchoGateState): void {
  state.phase = 'gated'
  state.stopAt = 0
  state.drainedAt = 0
}

/** 服务端播报结束：进入等排空阶段（还没有放行）。 */
export function echoGateTtsStop(state: EchoGateState, now: number): void {
  if (state.phase !== 'gated') return
  state.phase = 'draining'
  state.stopAt = now
  state.drainedAt = 0
}

/** 本地播放已排空（没有待播音频、播放时钟已过最后一段的结尾）。 */
export function echoGateDrained(state: EchoGateState, now: number): void {
  if (state.phase === 'draining' && state.drainedAt === 0) state.drainedAt = now
}

/** 排空之后又有迟到音频被排进队列：排空作废，重新等。 */
export function echoGateRequeued(state: EchoGateState): void {
  if (state.phase === 'draining') state.drainedAt = 0
}

/** 是否可以恢复上行：已排空且声学尾巴已过。 */
export function echoGateShouldResume(state: EchoGateState, now: number): boolean {
  return state.phase === 'draining' && state.drainedAt > 0 && now - state.drainedAt >= ACOUSTIC_TAIL_MS
}

/** 已恢复上行。 */
export function echoGateResumed(state: EchoGateState): void {
  state.phase = 'open'
  state.stopAt = 0
  state.drainedAt = 0
}

/** 用户打断（播放已被清空）或连接重置：立即回到开放态。 */
export function echoGateReset(state: EchoGateState): void {
  state.phase = 'open'
  state.stopAt = 0
  state.drainedAt = 0
}
