import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createTrackingLossState, frameSeesPerson, pushPresenceSample, resetTrackingLoss,
  PRESENCE_VISIBILITY_MIN, TRACKING_REPEAT_MS, TRACKING_SUSTAIN_MS,
  type PresencePoint,
} from '../src/features/motion/lib/trackingLoss'

// 2026-11-14 真机事故：Edward 站在画面正中练锤式弯举，骨架点就画在
// 肩膀手臂上，新大信号却喊「看不到你啦」。根因是旧接线把「看得见人」
// 喂成了 calibrated && stage!=='tracking_lost'——两者编码的都是校准/
// 取景达标与否：宿舍里下半身出画，校准永远完不成，引擎还会在校准
// 重置时把 stage 打成 tracking_lost。修复：存在性只认原始关键点里
// 核心关节（肩/髋）有没有被检测到，与校准彻底脱钩。

/** 造一帧 33 点：默认全部不可见，再按表点亮指定关节。 */
const frame = (lit: Record<number, number>): PresencePoint[] => {
  const points: PresencePoint[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }))
  for (const [index, visibility] of Object.entries(lit)) points[Number(index)] = { x: 0.5, y: 0.5, visibility }
  return points
}
/** 锤式弯举在宿舍里的典型帧：肩、肘、腕都看得清，下半身（髋以下）全在画外。 */
const upperBodyOnly = () => frame({ 11: 0.96, 12: 0.95, 13: 0.9, 14: 0.9, 15: 0.85, 16: 0.85 })
/** 每 300ms 喂一帧（与页面采样间隔一致），返回全程每次采样的结果。 */
const feed = (state: ReturnType<typeof createTrackingLossState>, frames: (PresencePoint[] | null)[], startAt: number) =>
  frames.map((f, i) => pushPresenceSample(state, frameSeesPerson(f), startAt + i * 300))

test('frameSeesPerson: 核心关节任一达标即算看见人', () => {
  assert.equal(frameSeesPerson(null), false)
  assert.equal(frameSeesPerson(undefined), false)
  assert.equal(frameSeesPerson([]), false)
  assert.equal(frameSeesPerson(frame({})), false, '核心关节全不可见 = 没看见人')
  assert.equal(frameSeesPerson(frame({ 11: PRESENCE_VISIBILITY_MIN })), true, '单侧肩达标即可')
  assert.equal(frameSeesPerson(frame({ 23: 0.9, 24: 0.88 })), true, '只有髋也算（低机位全身动作）')
  assert.equal(frameSeesPerson(frame({ 15: 0.99, 16: 0.99, 27: 0.99 })), false, '只有手腕/脚踝不算——躯干不在画面里')
  assert.equal(frameSeesPerson(upperBodyOnly()), true, '下半身全出画，肩在就是人在')
  // visibility 缺失时退回坐标判定（个别管线不给这个字段）
  const noVis: PresencePoint[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5 }))
  assert.equal(frameSeesPerson(noVis), true)
  const offScreen: PresencePoint[] = Array.from({ length: 33 }, () => ({ x: 3, y: 3 }))
  assert.equal(frameSeesPerson(offScreen), false)
})

test('回归 a：肩臂稳定追踪、下半身不出画、校准永不完成 → 大信号永不触发', () => {
  const state = createTrackingLossState()
  // 30 秒、每 300ms 一帧，全程只有上半身——正是真机事故的帧形态。
  const samples = feed(state, Array.from({ length: 100 }, upperBodyOnly), 1_000)
  assert.ok(samples.every(s => !s.active && !s.cue), '人在画面里，大信号一次都不许亮')
  assert.equal(state.seenOnce, true)
})

test('回归 b：真的没人时 900ms 后触发，人回来立刻解除，喊话 6 秒节流', () => {
  const state = createTrackingLossState()
  feed(state, [upperBodyOnly(), upperBodyOnly()], 1_000) // 1000、1300 看见人
  const lastSeen = 1_300
  assert.equal(pushPresenceSample(state, false, lastSeen + TRACKING_SUSTAIN_MS - 1).active, false)
  const first = pushPresenceSample(state, false, lastSeen + TRACKING_SUSTAIN_MS)
  assert.deepEqual(first, { active: true, cue: true })
  assert.equal(pushPresenceSample(state, false, lastSeen + TRACKING_SUSTAIN_MS + 300).cue, false, '6 秒内不重复喊')
  assert.equal(pushPresenceSample(state, false, lastSeen + TRACKING_SUSTAIN_MS + TRACKING_REPEAT_MS).cue, true)
  assert.deepEqual(pushPresenceSample(state, true, lastSeen + 9_000), { active: false, cue: false }, '人回来立刻解除')
  resetTrackingLoss(state)
  assert.deepEqual(state, { seenOnce: false, lastSeenAt: 0, lastCueAt: 0 })
})

test('回归 c：短暂丢帧（间隔 <900ms）反复抖动 → 永不触发', () => {
  const state = createTrackingLossState()
  const frames: (PresencePoint[] | null)[] = [upperBodyOnly()]
  // 30 秒里交替出现 300ms、600ms 的空帧段，中间始终有真人帧
  for (let i = 0; i < 33; i++) frames.push(null, upperBodyOnly(), null, null, upperBodyOnly())
  const samples = feed(state, frames, 1_000)
  assert.ok(samples.every(s => !s.active && !s.cue), '抖动不是离开，不许喊')
})

test('准备阶段：还没看见过人时，空帧多久都不算丢', () => {
  const state = createTrackingLossState()
  const samples = feed(state, Array.from({ length: 40 }, () => null), 1_000)
  assert.ok(samples.every(s => !s.active && !s.cue), '用户还在摆手机/走进画面，不许喊看不到')
})

test('接线护栏：Workout 的大信号只吃关键点存在性，不再接校准/stage（source guard）', () => {
  const workout = readFileSync(new URL('../src/features/motion/pages/Workout.tsx', import.meta.url), 'utf8')
  assert.match(workout, /frameSeesPerson\(landmarksRef\.current\)/, '采样必须喂原始关键点的存在性')
  assert.ok(!workout.includes('trackingVisibleRef'), '旧的校准/stage 可见性接线必须移除')
  const css = readFileSync(new URL('../src/training.css', import.meta.url), 'utf8')
  const banner = css.match(/\.training-hud-lost\{([^}]*)\}/)
  assert.ok(banner, '.training-hud-lost rule exists')
  assert.match(banner[1], /top:\s*44%/, '大信号居画面上中部，不压底部引导卡')
  assert.ok(!/bottom:\s*110px/.test(banner[1]), '旧的 bottom:110px 定位（压住取景引导文字）必须移除')
})
