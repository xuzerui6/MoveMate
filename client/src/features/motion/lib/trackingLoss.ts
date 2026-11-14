// 训练页自己的追踪丢失纪律（与打怪页同口径：持续 900ms 才算真丢，
// 丢着的时候最多 6 秒喊一次）。
//
// 训练页之前没有这条语音路径：逐帧提示被 pickCue 的 demo 开关压着，
// 人走出画面只能靠屏幕上的小字——而训练时用户离手机几米远，根本看不见。
// 这里只管计时与节流：什么算「看得见」由页面按校准状态喂进来
// （首次校准成功之前不算丢，那是准备阶段，不许喊）。
//
// 纯逻辑、无 IO，可单测。

export const TRACKING_SUSTAIN_MS = 900
export const TRACKING_REPEAT_MS = 6_000

export interface TrackingLossState {
  /** 本轮丢失从何时开始；null = 当前看得见 */
  lostSince: number | null
  /** 上一次出声提醒的时刻 */
  lastCueAt: number
}

export const createTrackingLossState = (): TrackingLossState => ({ lostSince: null, lastCueAt: 0 })

export interface TrackingSample {
  /** 是否已持续丢失满 900ms（页面据此显示大信号） */
  active: boolean
  /** 本次采样是否应该出声提醒（900ms 触发 + 6 秒节流） */
  cue: boolean
}

/** 喂一个可见性采样。visible=true 表示当前能稳定看到人。 */
export function pushTrackingSample(state: TrackingLossState, visible: boolean, now: number): TrackingSample {
  if (visible) {
    state.lostSince = null
    return { active: false, cue: false }
  }
  if (state.lostSince === null) {
    state.lostSince = now
    return { active: false, cue: false }
  }
  const active = now - state.lostSince >= TRACKING_SUSTAIN_MS
  // lastCueAt 为 0 表示还没喊过（真实时间戳不会是 0），第一声不受 6 秒节流。
  if (active && (state.lastCueAt === 0 || now - state.lastCueAt >= TRACKING_REPEAT_MS)) {
    state.lastCueAt = now
    return { active: true, cue: true }
  }
  return { active, cue: false }
}

/** 暂停/结束/恢复时重置：不把上一段的丢失计时带进下一段。 */
export function resetTrackingLoss(state: TrackingLossState): void {
  state.lostSince = null
  state.lastCueAt = 0
}
