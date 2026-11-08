import type { FormBreakdown, PoseIssue, WorkoutSession } from '../types'

export const emptyFormBreakdown = (): FormBreakdown => ({ depth: 0, stability: 0, trunk: 0, symmetry: 0 })

/** Median of a per-rep value list: the middle value for an odd count, the mean
 * of the two middle values for an even count. Used for the hammer-curl set-level
 * symmetry aggregation (2026-11-08): the elbow channel's noise is episodic and
 * sign-flipping, so a mean lets one noise-struck rep convict the whole set,
 * while the median reports the set's typical coordination. An empty list has
 * no median (0) — callers with no recorded values fall back to the mean. */
export const medianOf = (values: number[]): number => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
export const emptyCorrectionCounts = (): Record<PoseIssue, number> => ({
  out_of_frame: 0, insufficient_depth: 0, knee_instability: 0, excessive_trunk_lean: 0, asymmetry: 0, insufficient_range: 0, unstable_movement: 0, body_alignment: 0, poor_coordination: 0,
})

/** 旧版本训练记录没有视觉和对话字段，加载时补空值而不丢历史。 */
export function migrateWorkoutSession(session: WorkoutSession): WorkoutSession {
  return {
    ...session,
    formBreakdown: { ...emptyFormBreakdown(), ...(session.formBreakdown || {}) },
    correctionCounts: { ...emptyCorrectionCounts(), ...(session.correctionCounts || {}) },
    visionInsights: Array.isArray(session.visionInsights) ? session.visionInsights : [],
    conversationTurnCount: Number.isFinite(session.conversationTurnCount) ? session.conversationTurnCount : 0,
  }
}
