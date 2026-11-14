// 里程碑陪伴（Edward 2026-11-14 批准的默认计数播报方式）：
// 不是每个数都出声，只在关键节点让小智说一句——第一个、每 5 个、过半、
// 还剩 3 个、达成目标、破单组纪录。事实全部来自本地权威计数，文本在本地
// 拼好（字幕与事实行）；要不要出声、什么时候出声由 speechAdmission 按
// 优先级矩阵决定，出声时走对话通道由小智用自己的话说（prompt 是用户
// 视角的真实状态汇报，数字来自本地，不让 LLM 自己维护计数器）。

export type MilestoneKind = 'first' | 'every5' | 'halfway' | 'remaining3' | 'target' | 'personalBest'

export interface MilestoneEvent {
  kind: MilestoneKind
  reps: number
  targetReps: number
  /** 本地事实行：直接上屏的字幕/状态行，数字准确。 */
  text: string
  /** 对话通道的触发句：第一人称、陈述的都是本地测到的真事。 */
  prompt: string
}

/**
 * 「每次都出声数」总开关——Phase 1 不做（Edward 选了关键节点默认）。
 * 将来要开，先过真机延迟验收（本地完成 → 可听见 p95 ≤ 500ms，
 * 且迟到的数字直接作废、不排队补播），再把这里改成运行时可选项。
 */
export const EVERY_REP_VOICED = false

/**
 * 第 reps 次刚完成时的里程碑（reps 是完成后的总数）。同一 reps 命中多个
 * 节点时只返回一个（优先级：目标达成 > 单组纪录 > 还剩 3 个 > 过半 >
 * 每 5 个 > 第一个），不连发。没有命中返回 null。
 * 超过目标后的额外次数不再报里程碑（单组纪录除外）。
 */
export function milestoneForRep(reps: number, targetReps: number, unit: string, personalBest = 0): MilestoneEvent | null {
  if (reps <= 0) return null
  const target = targetReps > 0 ? targetReps : 0
  if (target > 0 && reps === target) {
    return { kind: 'target', reps, targetReps: target, text: `${reps} ${unit}，目标完成了`, prompt: `我做到第 ${reps} 个了，目标完成` }
  }
  if (target > 0 && reps > target && !(personalBest > 0 && reps === personalBest + 1)) return null
  if (personalBest > 0 && reps === personalBest + 1) {
    return { kind: 'personalBest', reps, targetReps: target, text: `${reps} ${unit}，这是你单组最多的一次`, prompt: `我这组做到 ${reps} 个了，是我单组最多的一次` }
  }
  if (target > 3 && reps === target - 3) {
    return { kind: 'remaining3', reps, targetReps: target, text: `还剩 3 ${unit}，陪你一起`, prompt: `我还剩 3 个了` }
  }
  if (target > 1 && reps === Math.floor(target / 2)) {
    return { kind: 'halfway', reps, targetReps: target, text: `${reps} ${unit}，一半啦`, prompt: `我做到第 ${reps} 个了，过半了` }
  }
  if (reps % 5 === 0) {
    return { kind: 'every5', reps, targetReps: target, text: `${reps} ${unit}了`, prompt: `我做到第 ${reps} 个了` }
  }
  if (reps === 1) {
    return { kind: 'first', reps, targetReps: target, text: `第一${unit}，开始了`, prompt: `第一个完成了，陪我继续` }
  }
  return null
}
