import type { PoseIssue, VisionFrameJob } from '../types'

/**
 * 视觉任务排队纪律：自动复核只留最新一帧——排队中的旧自动任务被新帧
 * 直接替换（在飞的不动，由并发上限兜底），积压永远长不大；用户点名
 * 看的任务插到最前、永不被替换。纯函数，返回新队列。
 */
export function enqueueVisionJob(queue: VisionFrameJob[], job: VisionFrameJob): VisionFrameJob[] {
  if (job.priority === 'automatic') {
    return [...queue.filter(item => item.priority !== 'automatic'), job]
  }
  return [job, ...queue]
}

// 视觉指导的新鲜度与开口纪律。
//
// 云端视觉看的是关键帧照片，结果回来时画面可能早就变了。拿旧画面当
// 实时指导是最伤信任的错：用户已经站好了，你还在念「往后退一点」。
// 所以每条结果都带真实的拍照时刻（capturedAt，而不是旧代码的结果到达
// 时刻），先分新鲜度：
// - live：够新（25 秒内、且次数没跑远），可以作实时指导候选；
// - retrospective：旧了，只能进组间总结（明确是「刚才那一组」的回看），
//   绝不冒充实时指导。
//
// 开口纪律（Codex 定版）：
// - 同一个问题要在最近的观察里被看到至少 2 次（有佐证）才升级开口；
// - 任意自动动作提示之间至少隔 15 秒，同一个问题至少隔 30 秒；
// - 问题消失（连续 2 次观察没再出现）后，确认一次改善，然后闭嘴，
//   不反复表功；重新出现要重新攒够佐证才再开口。
// 观察结论只是定性描述（看得见的现象），不许变成分数或全面评估——
// 被暂停评估的动作维持「无法评估」口径。看不清就如实说看不清。
//
// 纯逻辑、无 IO，可单测。

export const VISION_FRESH_MS = 25_000
/** 次数跑远了也算旧：哪怕时间够新，隔了太多下，画面早不是那回事。 */
export const VISION_FRESH_MAX_REP_GAP = 3
export const FORM_CUE_MIN_GAP_MS = 15_000
export const SAME_ISSUE_MIN_GAP_MS = 30_000
/** 升级开口需要的佐证次数（最近 CORROBORATION_WINDOW 次观察内） */
export const CORROBORATION_NEEDED = 2
export const CORROBORATION_WINDOW = 3
/** 问题连续没出现这么多次，算改善 */
export const IMPROVEMENT_ABSENT_COUNT = 2

export type VisionFreshness = 'live' | 'retrospective'

export function classifyVisionFreshness(capturedAt: number, now: number, insightRep: number | null, currentReps: number): VisionFreshness {
  if (now - capturedAt > VISION_FRESH_MS) return 'retrospective'
  if (insightRep !== null && currentReps - insightRep > VISION_FRESH_MAX_REP_GAP) return 'retrospective'
  return 'live'
}

export interface GuidanceObservation {
  issue: PoseIssue | null
  at: number
}

export interface GuidanceGateState {
  /** 最近的自动观察（新的在后），只留最近 8 条 */
  recent: GuidanceObservation[]
  /** 上一次任意自动动作提示的时刻 */
  lastCueAt: number
  /** 每个问题上一次开口的时刻 */
  lastCueByIssue: Partial<Record<PoseIssue, number>>
  /** 已升级、还没确认改善的问题 */
  escalated: Partial<Record<PoseIssue, boolean>>
}

export const createGuidanceGateState = (): GuidanceGateState => ({
  recent: [],
  lastCueAt: 0,
  lastCueByIssue: {},
  escalated: {},
})

export type GuidanceDecision =
  | { type: 'cue'; issue: PoseIssue }
  | { type: 'improved'; issue: PoseIssue }
  | { type: 'none' }

/**
 * 喂入一条自动视觉观察（issue 是拍照那一刻本地检测到的问题；云端结论
 * 只作参考不作判据——本地问题是结构化数据，云端散文不是），返回这次
 * 是否应该开口。用户点名看的观察不走这里（用户问了就答，不受冷却限制）。
 */
export function observeVision(state: GuidanceGateState, observation: GuidanceObservation): GuidanceDecision {
  state.recent = [...state.recent, observation].slice(-8)
  const { issue, at } = observation

  // 改善确认：已升级的问题在「干净」的观察里连续缺席够次数 → 确认一次，
  // 然后解除升级。注意：主要问题换成了别的问题不算改善证据——那一帧只是
  // 先报了别的问题，不能证明这个毛病没了；只有 issue 为空的观察才算数。
  for (const tracked of Object.keys(state.escalated) as PoseIssue[]) {
    if (!state.escalated[tracked] || tracked === issue) continue
    const tail = state.recent.slice(-IMPROVEMENT_ABSENT_COUNT)
    if (tail.length >= IMPROVEMENT_ABSENT_COUNT && tail.every(item => item.issue === null)) {
      state.escalated[tracked] = false
      return { type: 'improved', issue: tracked }
    }
  }

  if (!issue || state.escalated[issue]) return { type: 'none' }
  const window = state.recent.slice(-CORROBORATION_WINDOW)
  const seen = window.filter(item => item.issue === issue).length
  if (seen < CORROBORATION_NEEDED) return { type: 'none' }
  if (at - state.lastCueAt < FORM_CUE_MIN_GAP_MS) return { type: 'none' }
  if (at - (state.lastCueByIssue[issue] || 0) < SAME_ISSUE_MIN_GAP_MS) return { type: 'none' }
  state.escalated[issue] = true
  state.lastCueAt = at
  state.lastCueByIssue[issue] = at
  return { type: 'cue', issue }
}
