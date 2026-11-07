import { exerciseInfo } from '../motion/lib/exercises'
import { requiredXp } from '../motion/lib/rewards'
import type { WorkoutSession } from '../motion/types'

/**
 * 分享卡数据层（纯函数，无 DOM）。
 * 字段来源与降级规则以设计板为准：
 *  - 视觉定版：share-card-design-board-v2.html 的 R2 白底富层版
 *  - 字段/降级：share-card-design-board.html（v1）的字段来源表与降级规则
 * 这里只做「已有产品数据 → 卡面数据」的映射，不新造任何数据。
 */

export interface CardDateText {
  /** 2026.11.07 · 周六 */
  full: string
  /** 2026.11.07 */
  short: string
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const pad2 = (n: number) => String(n).padStart(2, '0')

export function formatCardDate(input: Date | string | number): CardDateText {
  const date = input instanceof Date ? input : new Date(input)
  const short = `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`
  return { full: `${short} · ${WEEKDAYS[date.getDay()]}`, short }
}

/* ---------------- 卡 A · 训练完成卡 ---------------- */

export type CardDuration =
  | { kind: 'minutes'; minutes: number }
  | { kind: 'hours'; hours: number; minutes: number }

/** 板上降级规则：时长两段式（1 小时 32 分），不溢出。本实现 ≥60 分钟即两段式。 */
export function durationParts(totalSeconds: number): CardDuration {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60))
  if (minutes < 60) return { kind: 'minutes', minutes }
  return { kind: 'hours', hours: Math.floor(minutes / 60), minutes: minutes % 60 }
}

export interface WorkoutCardData {
  date: CardDateText
  duration: CardDuration
  exerciseCount: number
  totalReps: number
  totalSets: number
  /** 仅统计可评分的摄像头组；无可评分组时为 null（降级：3 格布局） */
  avgScore: number | null
  streakDays: number
}

/**
 * 数据来自 PlanWorkout 的 row（服务端 workout-session 视图）：
 * 时长 = session.effectiveSeconds（完成页同口径）；组数/次数只计已完成组；
 * 平均分按板上字段定义取「各已评分组得分的平均值」。
 * 导入历史（无 session）没有可信时长，不出卡 → 返回 null。
 */
export function buildWorkoutCardData(row: any, streakDays: number): WorkoutCardData | null {
  if (!row || !row.session) return null
  const sets: any[] = Array.isArray(row.sets) ? row.sets : []
  const completed = sets.filter((s) => s.status === 'completed')
  const exerciseIds = new Set(completed.map((s) => s.exercise?.id).filter(Boolean))
  // 板上字段定义：平均分 = 各已评分组得分的平均值（组得分 = 该组 total/count）。
  // 与完成页按次加权的「训练识别均分」口径不同，以板为准（差异已记入实现文档）。
  const scoredSets = completed.filter((s) => (s.score?.count || 0) > 0)
  const avgScore =
    scoredSets.length > 0
      ? Math.round(scoredSets.reduce((sum, s) => sum + (s.score.total || 0) / s.score.count, 0) / scoredSets.length)
      : null
  return {
    date: formatCardDate(row.session.startTime || row.createdAt || new Date()),
    duration: durationParts(row.session.effectiveSeconds || 0),
    exerciseCount: exerciseIds.size,
    totalReps: completed.reduce((sum, s) => sum + (s.reps || 0), 0),
    totalSets: completed.length,
    avgScore,
    streakDays: Math.max(0, streakDays || 0),
  }
}

/* ---------------- 卡 B · 单组高光卡 ---------------- */

export interface SetCardAxis {
  label: string
  value: number
}

export interface SetCardData {
  date: CardDateText
  nameZh: string
  nameEn: string
  scored: boolean
  score: number | null
  /** 板上固定四轴：幅度 / 稳定性 / 躯干 / 对称（FormBreakdown 语义） */
  axes: SetCardAxis[] | null
  reps: number
  unit: string
  /** 计划内组序（第 N 组）；自由单次结算为 null，不显示该 chip */
  setIndex: number | null
  personalBest: boolean
}

const AXIS_LABELS = ['幅度', '稳定性', '躯干', '对称'] as const
const AXIS_KEYS = ['depth', 'stability', 'trunk', 'symmetry'] as const

function axesFrom(breakdown: { depth: number; stability: number; trunk: number; symmetry: number }): SetCardAxis[] {
  return AXIS_KEYS.map((key, i) => ({ label: AXIS_LABELS[i], value: Math.round(breakdown[key] || 0) }))
}

/** gym 动作英文名：目录 name 字段（核心动作是类型 id，下划线转空格后大写）。 */
export function gymExerciseEn(name: unknown): string {
  return String(name || '').replace(/[_-]+/g, ' ').trim().toUpperCase()
}

/** 计划训练的一组（row.sets[i]）。score 为 ScoreAccumulator 原始累计值，在此折算均分。 */
export function buildGymSetCard(set: any, index: number, dateInput: Date | string | number): SetCardData {
  const count = set?.score?.count || 0
  const scored = count > 0
  const breakdown = scored
    ? {
        depth: (set.score.depth || 0) / count,
        stability: (set.score.stability || 0) / count,
        trunk: (set.score.trunk || 0) / count,
        symmetry: (set.score.symmetry || 0) / count,
      }
    : null
  return {
    date: formatCardDate(dateInput),
    nameZh: set?.exercise?.nameZh || '训练',
    nameEn: gymExerciseEn(set?.exercise?.name),
    scored,
    score: scored ? Math.round((set.score.total || 0) / count) : null,
    axes: breakdown ? axesFrom(breakdown) : null,
    reps: set?.reps || 0,
    unit: '次',
    setIndex: index + 1,
    // 计划侧没有「历史最佳组分」数据源（previous/personalBests 只有次数与重量），
    // 无法判定刷新纪录时不显示该 chip（chip 本就是「仅当刷新时出现」的条件元素）。
    personalBest: false,
  }
}

/** 摄像头自由训练的单次结算（motion Summary 的 WorkoutSession）。 */
export function buildMotionSetCard(result: WorkoutSession, history: WorkoutSession[]): SetCardData {
  const info = exerciseInfo(result.exerciseType)
  const count = (result as any).scoreAccumulator?.count ?? 0
  const scored = count > 0 || result.formScore > 0
  const previousBest = history
    .filter((s) => s.id !== result.id && s.exerciseType === result.exerciseType && s.source !== 'demo')
    .reduce((best, s) => {
      const c = (s as any).scoreAccumulator?.count ?? 0
      return c > 0 || s.formScore > 0 ? Math.max(best, s.formScore || 0) : best
    }, 0)
  return {
    date: formatCardDate(result.startTime || new Date()),
    nameZh: info.name,
    nameEn: info.english,
    scored,
    score: scored ? Math.round(result.formScore || 0) : null,
    axes: scored ? axesFrom(result.formBreakdown) : null,
    reps: result.reps || 0,
    unit: info.unit,
    setIndex: null,
    // 「个人最佳」chip：与该动作历史最佳组分比较，仅当刷新时出现。
    personalBest: scored && result.reps > 0 && previousBest > 0 && (result.formScore || 0) > previousBest,
  }
}

/* ---------------- 卡 C · 里程碑卡 ---------------- */

export interface CardLineSegment {
  t: string
  b?: boolean
}

export interface MilestoneCardData {
  kind: 'streak' | 'level' | 'record'
  date: CardDateText
  /** 例：里程碑 MILESTONE / 等级提升 LEVEL UP / 个人纪录 NEW RECORD / 第一步 FIRST STEP */
  pill: string
  num: string
  unit: string
  sub: string
  line1: CardLineSegment[]
  line2: CardLineSegment[]
  /** 右下角落款，如 STREAK · 30 DAYS */
  foot: string
  /** 进度环填充比例 0..1 */
  fraction: number
}

export const STREAK_MILESTONES = [7, 14, 30, 50, 100, 150, 200, 365, 500, 730, 1000]

export function streakMilestone(streakDays: number): { milestone: number; next: number | null } | null {
  if (!streakDays || streakDays < STREAK_MILESTONES[0]) return null
  let milestone = STREAK_MILESTONES[0]
  let next: number | null = null
  for (const m of STREAK_MILESTONES) {
    if (m <= streakDays) milestone = m
    else {
      next = m
      break
    }
  }
  return { milestone, next }
}

const localDayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const DAY_MS = 86_400_000

/** 与 rewards.calculateStreakDays 同口径的锚点：今天已训练则锚今天，否则锚昨天。 */
export function streakStartDate(history: { startTime?: string | null }[], streakDays: number, now = new Date()): Date {
  const trained = new Set(
    history.filter((s) => s.startTime).map((s) => localDayStart(new Date(s.startTime as string))),
  )
  let anchor = localDayStart(now)
  if (!trained.has(anchor)) anchor -= DAY_MS
  return new Date(anchor - (Math.max(1, streakDays) - 1) * DAY_MS)
}

export function buildStreakCard(
  history: { startTime?: string | null }[],
  streakDays: number,
  now = new Date(),
): MilestoneCardData | null {
  const info = streakMilestone(streakDays)
  if (!info) return null
  const start = streakStartDate(history, streakDays, now)
  return {
    kind: 'streak',
    date: formatCardDate(now),
    pill: '里程碑 MILESTONE',
    num: String(info.milestone),
    unit: '天',
    sub: '连续打卡',
    line1: [
      { t: '从 ', },
      { t: `${start.getMonth() + 1} 月 ${start.getDate()} 日`, b: true },
      { t: ' 到今天，一天没断。' },
    ],
    line2: info.next
      ? [{ t: '下一个小目标：' }, { t: `第 ${info.next} 天`, b: true }, { t: '。' }]
      : [{ t: '继续保持，下一站很快见。' }],
    foot: `STREAK · ${info.milestone} DAYS`,
    fraction: info.next ? info.milestone / info.next : 1,
  }
}

/**
 * 等级卡用 motion 训练等级（与 Summary/Profile 同一 XP 体系）。
 * 产品里没有训练等级称号体系（组局积分称号属于另一套积分，不混用），
 * 环内副标题用「训练等级」——与板上示意称号的差异已记入实现文档。
 */
export function buildLevelCard(input: { level: number; xp: number; date: Date | string | number }): MilestoneCardData {
  const level = Math.max(1, Math.floor(input.level || 1))
  const needed = requiredXp(level)
  const into = Math.min(Math.max(0, input.xp || 0), needed)
  const remaining = Math.max(0, needed - into)
  return {
    kind: 'level',
    date: formatCardDate(input.date),
    pill: level === 2 ? '第一步 FIRST STEP' : '等级提升 LEVEL UP',
    num: `Lv.${level}`,
    unit: '',
    sub: '训练等级',
    line1: [{ t: '经验值已经攒满这一级。' }],
    line2: [{ t: '距 ' }, { t: `Lv.${level + 1}`, b: true }, { t: ' 还差 ' }, { t: `${remaining}`, b: true }, { t: ' 点经验。' }],
    foot: `LEVEL · ${level}`,
    fraction: needed > 0 ? into / needed : 0,
  }
}

export interface RecordPr {
  exerciseId: string
  nameZh: string
  nameEn: string
  kind: 'weight' | 'reps'
  value: number
  /** 此前历史最佳（其他训练）；0 表示此前无纪录 */
  previous: number
}

/**
 * 个人纪录判定与 PlanWorkout 页内「本组超过历史最佳」提示同口径：
 * personalBests 由服务端按「其他训练」算出（非热身组），本场已完成组
 * 重量更高 → 重量纪录；同重量次数更多 → 次数纪录。优先重量纪录。
 */
export function detectRecordPr(row: any): RecordPr | null {
  if (!row || !Array.isArray(row.sets)) return null
  const bests: Record<string, { loadKg: number; reps: number }> = row.personalBests || {}
  let weightPr: RecordPr | null = null
  let repsPr: RecordPr | null = null
  for (const s of row.sets) {
    if (s.status !== 'completed' || s.kind === 'warmup') continue
    const id = s.exercise?.id
    if (!id) continue
    const best = bests[id] || { loadKg: 0, reps: 0 }
    const nameZh = s.exercise?.nameZh || '训练'
    const nameEn = gymExerciseEn(s.exercise?.name)
    if ((s.loadKg || 0) > (best.loadKg || 0)) {
      if (!weightPr || s.loadKg > weightPr.value) {
        weightPr = { exerciseId: id, nameZh, nameEn, kind: 'weight', value: s.loadKg, previous: best.loadKg || 0 }
      }
    } else if ((s.loadKg || 0) > 0 && s.loadKg >= (best.loadKg || 0) && (s.reps || 0) > (best.reps || 0)) {
      if (!repsPr || s.reps > repsPr.value) {
        repsPr = { exerciseId: id, nameZh, nameEn, kind: 'reps', value: s.reps, previous: best.reps || 0 }
      }
    }
  }
  return weightPr || repsPr
}

const trimNum = (n: number) => {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(Math.round(r)) : String(r)
}

export function buildRecordCard(row: any): MilestoneCardData | null {
  const pr = detectRecordPr(row)
  if (!pr) return null
  const unit = pr.kind === 'weight' ? 'kg' : '次'
  const first = pr.previous <= 0
  const delta = Math.round((pr.value - pr.previous) * 10) / 10
  return {
    kind: 'record',
    date: formatCardDate(row.session?.startTime || row.createdAt || new Date()),
    pill: first ? '第一步 FIRST STEP' : '个人纪录 NEW RECORD',
    num: trimNum(pr.value),
    unit,
    sub: pr.nameZh,
    line1: first
      ? [{ t: '第一次留下纪录。' }]
      : [{ t: '比上次纪录多了 ' }, { t: `${trimNum(delta)} ${unit}`, b: true }, { t: '。' }],
    line2: first
      ? [{ t: '继续保持，下一站很快见。' }]
      : [{ t: '原纪录停在 ' }, { t: `${trimNum(pr.previous)} ${unit}`, b: true }, { t: '。' }],
    foot: pr.nameEn ? `PR · ${pr.nameEn}` : 'PR',
    fraction: first ? 1 : Math.min(1, pr.previous / pr.value),
  }
}
