/**
 * 组队打怪前端纯逻辑：血量状态、画面布局（一键互换）、快照版本守卫、
 * 队友公开视图（隐私裁剪）、延迟采样。都不依赖 React，方便单测。
 *
 * 隐私红线：快照里只有本人条目带 my_damage；广播快照谁的伤害都不带。
 * 任何要渲染「别人」的地方都必须先过 publicParticipantView，把伤害类
 * 字段挡在组件之外——组件拿不到，就渲染不出来。
 */

export type BossHpState = 'full' | 'mid' | 'low'

/** 血量三档（boss-a-states.md 规范）：>60% 满血图、30%–60% 中血图、<30% 低血图 */
export function hpStateKey(hp: number, maxHp: number): BossHpState {
  if (!maxHp || maxHp <= 0) return 'full'
  const frac = hp / maxHp
  if (frac > 0.6) return 'full'
  if (frac >= 0.3) return 'mid'
  return 'low'
}

export const HP_STATE_NAME: Record<BossHpState, string> = {
  full: '精神抖擞',
  mid: '有点喘了',
  low: '快撑不住了',
}

// ---------------------------------------------------------------------------
// 布局一键互换（老板拍板方案 E）
// self = 看自己（摄像头大、怪兽横条）；boss = 看怪兽（怪兽大、摄像头小窗）
// 默认：集结/组间停在 self 方便取景；开打自动切 boss；手动换过就整场听用户的。
// ---------------------------------------------------------------------------

export type FightLayoutMode = 'self' | 'boss'
export interface FightLayoutState {
  mode: FightLayoutMode
  /** 用户手动换过布局后置 true，自动切换从此不再插手 */
  touched: boolean
}

export const INITIAL_LAYOUT: FightLayoutState = { mode: 'self', touched: false }

export type FightLayoutEvent =
  | { type: 'fight-started' }
  | { type: 'back-to-gathering' }
  | { type: 'swap' }

export function nextLayout(state: FightLayoutState, event: FightLayoutEvent): FightLayoutState {
  switch (event.type) {
    case 'swap':
      return { mode: state.mode === 'self' ? 'boss' : 'self', touched: true }
    case 'fight-started':
      return state.touched ? state : { mode: 'boss', touched: false }
    case 'back-to-gathering':
      return state.touched ? state : { mode: 'self', touched: false }
  }
}

// ---------------------------------------------------------------------------
// 快照与版本守卫
// ---------------------------------------------------------------------------

export interface BossParticipant {
  user_id: number
  nickname: string
  ready: boolean
  status: string // joined / left
  has_session: boolean
  avatar: {
    gender: string
    outfit: string
    outfit_rarity: string
    highest_rarity: string
    highest_rarity_name: string
    level: number
  } | null
  /** 只有本人条目才有这个字段（服务端保证）；别人的条目永远没有 */
  my_damage?: number
}

export interface BossFightSnapshot {
  id: string
  game_id: number
  boss_id: string
  boss_name: string
  movement: string
  status: 'gathering' | 'fighting' | 'won' | 'escaped' | 'aborted'
  max_hp: number
  hp: number
  version: number
  duration_sec: number
  created_by: number
  created_at: string
  started_at: string | null
  ends_at: string | null
  ended_at: string | null
  server_ts: number
  participants: BossParticipant[]
  my_reward: { item_id: string; status: string } | null
}

/**
 * 版本守卫：同一场打怪只接受版本号更大的快照（服务端每次变更都 +1）；
 * 换了一场（id 不同）直接接受。旧快照迟到也不会把界面打回去。
 */
export function acceptSnapshot(
  prev: BossFightSnapshot | null,
  next: BossFightSnapshot,
): BossFightSnapshot {
  if (!prev) return next
  if (prev.id !== next.id) return next
  return next.version > prev.version ? next : prev
}

// ---------------------------------------------------------------------------
// 队友公开视图：渲染别人时只准用这个形状——没有伤害、没有计数细节。
// ---------------------------------------------------------------------------

export interface PublicParticipantView {
  user_id: number
  nickname: string
  avatar: BossParticipant['avatar']
  ready: boolean
  status: string
  has_session: boolean
}

export function publicParticipantView(p: BossParticipant): PublicParticipantView {
  return {
    user_id: p.user_id,
    nickname: p.nickname,
    avatar: p.avatar,
    ready: p.ready,
    status: p.status,
    has_session: p.has_session,
  }
}

/**
 * 队友状态说法（方案写死，全产品只有这些）：
 * 集结时：「已准备 / 还没准备」；开打后：「在练 / 暂时休息」。
 * 不出现跟丢、掉线、拖后腿类字眼。
 */
export function teammateStatusLabel(p: PublicParticipantView, phase: 'gathering' | 'fighting'): string {
  if (phase === 'gathering') {
    if (p.status === 'left') return '已离开'
    return p.ready ? '已准备' : '还没准备'
  }
  if (p.status !== 'joined') return '暂时休息'
  return p.has_session ? '在练' : '暂时休息'
}

// ---------------------------------------------------------------------------
// 倒计时（按服务端时钟推算，避免本机时钟不准）
// ---------------------------------------------------------------------------

/** 用快照到达时刻校准服务端时间，返回当前服务端毫秒时间戳的估计 */
export function estimateServerNow(serverTs: number, receivedAtMs: number, nowMs: number): number {
  return serverTs + Math.max(0, nowMs - receivedAtMs)
}

export function remainingSeconds(endsAtIso: string | null, serverNowMs: number): number {
  if (!endsAtIso) return 0
  return Math.max(0, Math.ceil((Date.parse(endsAtIso) - serverNowMs) / 1000))
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// 端到端延迟采样（给上线前 P95 验收用；只存本机，不上任何用户界面）
// 口径：本机发出计数上报的时刻 → 收到带新版本号的广播快照的时刻，
// 含网络往返与服务端处理，是近似值，验收时配合服务端的 processing_ms 一起看。
// ---------------------------------------------------------------------------

export const LATENCY_STORAGE_KEY = 'movemate:boss-fight-latency-v1'
const LATENCY_CAP = 300

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function readLatencySamples(storage: StorageLike | null = defaultStorage()): number[] {
  if (!storage) return []
  try {
    const raw = storage.getItem(LATENCY_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? parsed.filter((v): v is number => typeof v === 'number' && v >= 0) : []
  } catch {
    return []
  }
}

export function recordLatencySample(ms: number, storage: StorageLike | null = defaultStorage()): void {
  if (!storage || !Number.isFinite(ms) || ms < 0) return
  try {
    const samples = readLatencySamples(storage)
    samples.push(Math.round(ms))
    storage.setItem(LATENCY_STORAGE_KEY, JSON.stringify(samples.slice(-LATENCY_CAP)))
    if (samples.length % 20 === 0) {
      // 调试出口：控制台能看到阶段性汇总，不做用户可见面板
      console.debug('[boss-fight] latency samples', latencySummary(storage))
    }
  } catch {
    /* 存不下就算了，采样只是验收辅助 */
  }
}


/**
 * 血量估算：镜像服务端 computeMaxHp（avatar-shared 的 MOVEMENT_TUNING +
 * boss-fight.service 的公式），只用于集结/发起页给个大约数；真正血量以
 * 开打时服务端按当时人数算出的为准。服务端调参时这里要跟着改。
 */
const BASE_REPS_PER_MIN: Record<string, number> = {
  squat: 20,
  push_up: 15,
  jumping_jack: 40,
  high_knees: 60,
}
export function estimateMaxHp(movement: string, teamSize: number, durationSec: number): number {
  const base = BASE_REPS_PER_MIN[movement] || 20
  const contributors = Math.max(1, teamSize - 1)
  return Math.max(10, Math.round(base * (durationSec / 60) * contributors * 0.8))
}

export function latencySummary(storage: StorageLike | null = defaultStorage()): {
  count: number
  p50: number | null
  p95: number | null
  max: number | null
} {
  const values = [...readLatencySamples(storage)].sort((a, b) => a - b)
  if (!values.length) return { count: 0, p50: null, p95: null, max: null }
  const pick = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))]
  return { count: values.length, p50: pick(0.5), p95: pick(0.95), max: values[values.length - 1] }
}

// ---------------------------------------------------------------------------
// 远距离模式（老板 2026-11-13 拍板）：产品主要面向手机端，拍全身时人离手机
// 好几米，屏幕上的字看不清。开打后界面只留大信号（怪兽与血量状态、血条、
// 大倒计时、自己的大次数），反馈主通道改成语音：次数里程碑、怪兽血量阶段、
// 出画方向。这里只放纯判定，播报与闪烁边框在页面/声音层。
// ---------------------------------------------------------------------------

/** 怪兽血量阶段一往下掉，要播报哪一句（和换图同一档位：60% / 30% 两条线） */
export type BossStageAnnouncement = 'mid' | 'low'
export function hpStageAnnouncement(prev: BossHpState, next: BossHpState): BossStageAnnouncement | null {
  if (prev === next) return null
  if (next === 'low') return 'low'
  if (next === 'mid' && prev === 'full') return 'mid'
  return null
}

/** 本场次数跨过一个新的整十里程碑时返回那个数，否则 null */
export function crossedRepMilestone(prev: number, next: number, step = 10): number | null {
  if (next <= prev) return null
  const before = Math.floor(prev / step)
  const after = Math.floor(next / step)
  return after > before && after > 0 ? after * step : null
}

/**
 * 出画判定（原始关键点坐标，前置摄像头）：页面预览是镜像显示的
 * （PoseCanvas 对视频做了 scale(-1,1)），所以显示横坐标 = 1 - 原始 x。
 * 返回的方向是「站在手机前的人自己的左右」：画面里的人像挤到右边，
 * 本人往左挪一步就回中间。
 * - gone：躯干关键点基本看不见（人不在画面里）
 * - back：髋在、但脚踝/膝盖掉出画面下沿或完全看不见（站太近，往后一步）
 * - left / right：人像明显偏到一侧
 * 追踪给不出更细的信息时宁可只报 gone/back，不瞎报左右。
 */
export type FrameAlert = 'gone' | 'left' | 'right' | 'back'

const TORSO_POINTS = [0, 11, 12, 23, 24] // 头、肩、髋
const HIP_POINTS = [23, 24]
const LOWER_POINTS = [25, 26, 27, 28] // 膝、踝

export function deriveFrameAlert(
  points: Array<{ x: number; y: number; visibility?: number }> | null | undefined,
): FrameAlert | null {
  if (!points || points.length < 29) return 'gone'
  const seen = (i: number, minVis = 0.5) => {
    const p = points[i]
    return Boolean(p) && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= minVis
  }
  const torsoSeen = TORSO_POINTS.filter((i) => seen(i))
  if (torsoSeen.length < 2) return 'gone'
  // 脚掉出下沿：下肢关键点 y>1 是追踪器给的直接出画信号；或者髋看得见、
  // 膝踝却一个都看不见（多半是下半身在画面外）。
  const lowerOutBottom = LOWER_POINTS.some((i) => points[i] && Number.isFinite(points[i].y) && points[i].y > 1)
  const hipsSeen = HIP_POINTS.some((i) => seen(i))
  const anyLowerSeen = LOWER_POINTS.some((i) => seen(i, 0.25))
  if (lowerOutBottom || (hipsSeen && !anyLowerSeen)) return 'back'
  const cx = torsoSeen.reduce((sum, i) => sum + Math.min(1, Math.max(0, points[i].x)), 0) / torsoSeen.length
  // 显示横坐标 = 1 - 原始 x：原始重心偏小 = 人像挤在显示画面右侧 → 本人往左
  if (cx <= 0.34) return 'left'
  if (cx >= 0.66) return 'right'
  return null
}

/** 出画时屏幕上的大字（远处也能一眼看清） */
export const FRAME_ALERT_WORD: Record<FrameAlert, string> = {
  gone: '回到画面中间',
  left: '往左一点',
  right: '往右一点',
  back: '往后一步',
}

