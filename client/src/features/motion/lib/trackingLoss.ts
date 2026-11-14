// 训练页自己的追踪丢失纪律（与打怪页同口径：持续 900ms 才算真丢，
// 丢着的时候最多 6 秒喊一次）。
//
// 「看得见人」只认最原始的信号：这一帧的关键点里，核心关节（左右肩、
// 左右髋）有没有至少一个被检测到。它与校准、与指标引擎的 stage 完全
// 脱钩——那两样编码的是「取景/校准达标了没有」，不是「人在不在」：
// 宿舍里练上肢动作时下半身在画面外，校准永远完不成、stage 还会因为
// 校准重置跳成 tracking_lost，可人明明站在画面中间（2026-11-14 真机：
// 骨架点就画在他肩膀手臂上，大信号却喊看不到你）。
//
// 这里只管两件事：单帧存在性判定（纯函数）与丢失计时/喊话节流。
// 首次看见人之前是准备阶段（seenOnce 之前不算丢），不许喊。

export const TRACKING_SUSTAIN_MS = 900
export const TRACKING_REPEAT_MS = 6_000
/** 核心关节的可见度门槛：低于这个数视为该关节不在画面里 */
export const PRESENCE_VISIBILITY_MIN = 0.5
/** MediaPipe 33 点里的核心关节：左肩、右肩、左髋、右髋 */
const CORE_JOINT_INDICES = [11, 12, 23, 24] as const

export interface PresencePoint {
  x: number
  y: number
  visibility?: number
}

/**
 * 一帧是否看见人：核心关节任一达标即可。
 * visibility 存在时按门槛判；缺失时（个别管线不给这个字段）退回坐标
 * 是否落在画面内——检测器整帧返回 33 个坐标合理的点，本身就是检到了人。
 * 下半身出画（髋/膝/踝全不可见）不影响判定：肩在，人就在。
 */
export function frameSeesPerson(landmarks: readonly PresencePoint[] | null | undefined): boolean {
  if (!landmarks || landmarks.length <= CORE_JOINT_INDICES[CORE_JOINT_INDICES.length - 1]) return false
  return CORE_JOINT_INDICES.some(index => {
    const point = landmarks[index]
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false
    if (typeof point.visibility === 'number') return Number.isFinite(point.visibility) && point.visibility >= PRESENCE_VISIBILITY_MIN
    return point.x >= -0.05 && point.x <= 1.05 && point.y >= -0.05 && point.y <= 1.05
  })
}

export interface TrackingLossState {
  /** 本次训练里是否已经看见过人（没看见过 = 还在准备阶段，不算丢） */
  seenOnce: boolean
  /** 最近一次看见人的时刻（采样时刻） */
  lastSeenAt: number
  /** 上一次出声提醒的时刻 */
  lastCueAt: number
}

export const createTrackingLossState = (): TrackingLossState => ({ seenOnce: false, lastSeenAt: 0, lastCueAt: 0 })

export interface TrackingSample {
  /** 是否已持续看不见满 900ms（页面据此显示大信号） */
  active: boolean
  /** 本次采样是否应该出声提醒（900ms 触发 + 6 秒节流） */
  cue: boolean
}

/** 喂一个存在性采样。seenNow=true 表示这一采样帧看见了人。 */
export function pushPresenceSample(state: TrackingLossState, seenNow: boolean, now: number): TrackingSample {
  if (seenNow) {
    state.seenOnce = true
    state.lastSeenAt = now
    return { active: false, cue: false }
  }
  if (!state.seenOnce) return { active: false, cue: false }
  const active = now - state.lastSeenAt >= TRACKING_SUSTAIN_MS
  // lastCueAt 为 0 表示还没喊过（真实时间戳不会是 0），第一声不受 6 秒节流。
  if (active && (state.lastCueAt === 0 || now - state.lastCueAt >= TRACKING_REPEAT_MS)) {
    state.lastCueAt = now
    return { active: true, cue: true }
  }
  return { active, cue: false }
}

/** 暂停/结束/恢复时重置：不把上一段的丢失计时带进下一段。 */
export function resetTrackingLoss(state: TrackingLossState): void {
  state.seenOnce = false
  state.lastSeenAt = 0
  state.lastCueAt = 0
}
