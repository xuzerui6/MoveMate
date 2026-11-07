import type { FormBreakdown } from '../types'

/**
 * 陪伴文案（识别页设计 v2 定版，Edward 2026-11-07 批准，热度「适中」）。
 *
 * 北极星（Edward 原话）：「动伴做出来的意义就是想要一个聊天式的运动陪伴给予鼓励
 * 和提供情绪价值的同时，还可以以适当的提示用户姿势是否正确」——鼓励与情绪价值
 * 第一，姿势提示适度、一次一句、商量语气。
 *
 * 红线：
 * - 鼓励不许空夸：每句夸奖必须挂在一个真实测到的事实上（幅度到了、比上组稳、
 *   第几个、连续天数）；测不到就不夸，只陪伴。
 * - 退步不许打击：任何文案不得出现「下降、变差、失败、丢弃、无效」。
 * - 不假装看清：看不清就说看不清，先安抚（数到的都在），后指引。
 *
 * 这里只放纯文案与纯函数（可单测）；引擎与页面从这里取词，不再各自造词。
 */

/** 文案表 1 · 进入准备 */
export const COPY_PREPARE = '先把手机放稳，站到能看见你的地方——我等你'
/** 文案表 2 · 站位引导 */
export const COPY_FRAMING = '往后退一点点，让我从头看到脚'
/** 文案表 3 · 等待起始姿势 */
export const COPY_WAIT_START = '站好，胳膊自然放下，陪我停两秒'
/** 文案表 3 · 伸臂类动作的等待起始姿势 */
export const COPY_WAIT_START_PLANK = '保持伸臂支撑，陪我停两秒'
/** 文案表 4 · 校准被打断（进度保留，不清零的话术面） */
export const COPY_CALIBRATION_PAUSED = '刚才那下不算，我们慢慢来——进度我帮你留着呢'
/** 文案表 5 · 校准完成 */
export const COPY_CALIBRATED = '找到你啦，我们开始'
/** 文案表 6 · 做到位 · 峰值（弯举类） */
export const COPY_PEAK_CURL = '漂亮，就是这个高度——慢慢放下来'
/** 文案表 7 · 完成一次 */
export const COPY_REP_DONE = '好，一个。节奏就这样'
/** 文案表 10 · 提示 · 上臂借力 */
export const COPY_HINT_UPPER_ARM = '上臂贴紧一点点，你会更省力'
/** 文案表 11 · 提示 · 幅度不足 */
export const COPY_HINT_RANGE = '再往上带一点点，你可以的'
/** 文案表 12 · 提示 · 速度太快 */
export const COPY_HINT_TEMPO = '不赶时间，慢一点，肌肉更买账'
/** 文案表 13 · 出画 */
export const COPY_OUT_OF_FRAME = '咦，你去哪啦？回到画面里，我接着陪你'
/** 文案表 14 · 看不清 / 冻结 */
export const COPY_UNCLEAR = '我有点看不清——别担心，数到的都在，先停一下'
/** 文案表 15 · 半程未完成 */
export const COPY_HALF_REP = '这个不算，也不扣分，调整一下再来'
/** 文案表 16 · 依据不可靠 */
export const COPY_BASIS_UNSTABLE = '光线有点欺负人，我们等它稳一稳'
/** 文案表 17 · 组完成 · 进步 */
export const COPY_SET_BETTER = '这一组比上一组稳——你的进步，我都记着呢'
/** 文案表 18 · 组完成 · 退步 */
export const COPY_SET_WORSE = '这组有点累了吧？没关系，好状态还在，下一组我们慢一点'
/** 文案表 19 · 训练完成（后半句的对比断言没有数据支撑时不用，见揭晓逻辑） */
export const COPY_WORKOUT_DONE = '今天陪你练完啦'

/** 还没看到人（无帧 / 人体不完整）时的陪伴句，与文案表 2 同调。 */
export const COPY_NOT_SEEN = '我还没看到你——站到画面里，让我从头看到脚'

/** 红线词表：陪伴文案与引擎反馈中禁止出现的打击性措辞。 */
export const BANNED_COPY_WORDS = ['下降', '变差', '失败', '丢弃', '无效', '冻结', '已丢弃'] as const

export type AxisKey = 'depth' | 'stability' | 'trunk' | 'symmetry'

/** 通用四轴名（与设计稿组间揭晓一致）；具体动作的轴名由调用方传入覆盖。 */
export const AXIS_LABELS: Record<AxisKey, string> = { depth: '幅度', stability: '稳定性', trunk: '躯干', symmetry: '对称性' }

/** 每条轴对应的「下一组小目标」：只给一个、给好处不给压力。 */
export const AXIS_GOALS: Record<AxisKey, string> = {
  depth: '放下来的时候再慢一点点，慢放最长肌肉',
  stability: '节奏再稳一点，慢一点，肌肉更买账',
  trunk: '核心收住一点，上身稳住就好',
  symmetry: '左右一起发力，重心放回中间',
}

const AXES: AxisKey[] = ['depth', 'stability', 'trunk', 'symmetry']

export interface SetReveal {
  /** 先报进步的一句（退步时是接住情绪的一句；无对比数据时是事实句）。 */
  progressLine: string
  /** 下一组小目标（就一个）。 */
  goalLine: string
  /** 与上一组相比进步最大的轴（无对比数据时为 null）。 */
  improvedAxis: AxisKey | null
}

/**
 * 组间揭晓的第一句与小目标（设计顺序：先报进步 → 四轴 → 一个小目标）。
 * current/previous 都是真实评分数据；previous 为 null（第一组 / 上一组未评分）时
 * 只陈述本组事实，不虚构对比。退步时先接住情绪，目标自动改小（取退步最大轴的反向目标）。
 */
export function buildSetReveal(
  current: FormBreakdown,
  previous: FormBreakdown | null,
  opts: { reps: number; unit: string; scored: boolean; axisLabels?: Record<AxisKey, string> },
): SetReveal {
  const labels = opts.axisLabels || AXIS_LABELS
  const weakest = AXES.reduce((a, b) => (current[a] <= current[b] ? a : b))
  const goalLine = `下一组小目标（就一个）：${AXIS_GOALS[weakest]}`
  if (!opts.scored) {
    return { progressLine: `这一组完成 ${opts.reps} ${opts.unit}——刚才没看清，就先不评分了`, goalLine, improvedAxis: null }
  }
  if (!previous) {
    return { progressLine: `这一组完成 ${opts.reps} ${opts.unit}，记下啦`, goalLine, improvedAxis: null }
  }
  const deltas = AXES.map(axis => ({ axis, delta: current[axis] - previous[axis] }))
  const best = deltas.reduce((a, b) => (b.delta > a.delta ? b : a))
  const worst = deltas.reduce((a, b) => (b.delta < a.delta ? b : a))
  const totalNow = AXES.reduce((sum, axis) => sum + current[axis], 0)
  const totalPrev = AXES.reduce((sum, axis) => sum + previous[axis], 0)
  if (best.delta >= 5) {
    return {
      progressLine: `先说进步：${labels[best.axis]}比上一组好了一截（${previous[best.axis]} → ${current[best.axis]}）——你的进步，我都记着呢`,
      goalLine,
      improvedAxis: best.axis,
    }
  }
  if (totalNow < totalPrev - 4 || worst.delta <= -8) {
    return {
      progressLine: COPY_SET_WORSE,
      goalLine: `下一组小目标（就一个）：${AXIS_GOALS[worst.axis]}——小一点的目标，稳稳拿下`,
      improvedAxis: null,
    }
  }
  return { progressLine: `这一组和上一组一样稳，节奏保持得很好`, goalLine, improvedAxis: null }
}

/**
 * 组中里程碑一句话（事件驱动，页面在次数变化时调用）。
 * 只挂真实事实：半程点、最后一个、目标达成。半程句不声称「节奏稳」——
 * 那需要节奏数据，没有就不说（红线：不空夸）。
 */
export function milestoneLine(reps: number, targetReps: number): string | null {
  if (targetReps <= 1 || reps <= 0 || reps > targetReps) return null
  if (reps === targetReps) return null // 目标达成由完成态文案负责
  if (reps === targetReps - 1) return '最后一个，陪你一起——起！'
  if (reps === Math.floor(targetReps / 2)) return '一半啦，保持住'
  return null
}

/** 完成一次时的陪伴句（文案表 7，带真实计数）。 */
export function repDoneLine(reps: number, unit: string): string {
  return `好，第 ${reps} ${unit}。节奏就这样`
}

/** 训练完成时的事实句：连续天数是真实数据（>1 天时才提）。 */
export function workoutDoneLine(streakDays: number): string {
  return streakDays > 1 ? `${COPY_WORKOUT_DONE}——连续运动第 ${streakDays} 天，我都记着呢` : COPY_WORKOUT_DONE
}
