import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FORM_CUE_MIN_GAP_MS, SAME_ISSUE_MIN_GAP_MS, VISION_FRESH_MS,
  classifyVisionFreshness, createGuidanceGateState, enqueueVisionJob, observeVision,
} from '../src/features/motion/lib/visionGuidance'
import type { VisionFrameJob } from '../src/features/motion/types'

const job = (id: string, priority: VisionFrameJob['priority']): VisionFrameJob => ({
  id, rep: 1, capturedAt: 0, image: '', question: '', trigger: 'completed_rep', issue: null, retries: 0, priority,
})

test('queue: automatic jobs keep only the latest; user jobs jump the queue and are never replaced', () => {
  let queue: VisionFrameJob[] = []
  queue = enqueueVisionJob(queue, job('a1', 'automatic'))
  queue = enqueueVisionJob(queue, job('a2', 'automatic'))
  assert.deepEqual(queue.map(item => item.id), ['a2'], '旧的自动任务被新帧替换，积压不长大')
  queue = enqueueVisionJob(queue, job('u1', 'user'))
  assert.deepEqual(queue.map(item => item.id), ['u1', 'a2'], '用户点名的插到最前')
  queue = enqueueVisionJob(queue, job('a3', 'automatic'))
  assert.deepEqual(queue.map(item => item.id), ['u1', 'a3'], '自动替换不动用户任务')
})

// 基准时刻取得足够大，避免冷却判断被「从 0 开始」干扰。
const T = 1_000_000

test('freshness: only recent captures with a small rep gap count as live', () => {
  assert.equal(classifyVisionFreshness(T, T + VISION_FRESH_MS, 5, 6), 'live')
  assert.equal(classifyVisionFreshness(T, T + VISION_FRESH_MS + 1, 5, 6), 'retrospective', '超过 25 秒只能进组间回看')
  assert.equal(classifyVisionFreshness(T, T + 1_000, 5, 9), 'retrospective', '次数跑远了，画面早不是那回事')
  assert.equal(classifyVisionFreshness(T, T + 1_000, null, 9), 'live', '没有次数锚点时只看时间')
})

test('guidance gate: one sighting is not enough — corroboration opens the mouth', () => {
  const gate = createGuidanceGateState()
  assert.equal(observeVision(gate, { issue: 'knee_instability', at: T }).type, 'none')
  const second = observeVision(gate, { issue: 'knee_instability', at: T + 2_000 })
  assert.deepEqual(second, { type: 'cue', issue: 'knee_instability' })
  assert.equal(observeVision(gate, { issue: 'knee_instability', at: T + 4_000 }).type, 'none', '已升级的问题不重复念')
})

test('guidance gate: sightings inside the last three observations corroborate', () => {
  const gate = createGuidanceGateState()
  observeVision(gate, { issue: 'asymmetry', at: T })
  observeVision(gate, { issue: null, at: T + 1_000 })
  const third = observeVision(gate, { issue: 'asymmetry', at: T + 2_000 })
  assert.equal(third.type, 'cue', '最近 3 次里出现 2 次也算佐证')
})

test('guidance gate: global 15s gap between automatic form cues', () => {
  const gate = createGuidanceGateState()
  observeVision(gate, { issue: 'knee_instability', at: T })
  assert.equal(observeVision(gate, { issue: 'knee_instability', at: T + 1_000 }).type, 'cue')
  observeVision(gate, { issue: 'asymmetry', at: T + 2_000 })
  const tooSoon = observeVision(gate, { issue: 'asymmetry', at: T + 3_000 })
  assert.equal(tooSoon.type, 'none', '离上一句动作提示不到 15 秒，先攒着佐证不开口')
  const later = observeVision(gate, { issue: 'asymmetry', at: T + 1_000 + FORM_CUE_MIN_GAP_MS })
  assert.equal(later.type, 'cue')
})

test('guidance gate: improvement is acknowledged once, re-cueing needs fresh corroboration and 30s', () => {
  const gate = createGuidanceGateState()
  observeVision(gate, { issue: 'excessive_trunk_lean', at: T })
  assert.equal(observeVision(gate, { issue: 'excessive_trunk_lean', at: T + 1_000 }).type, 'cue')
  assert.equal(observeVision(gate, { issue: null, at: T + 3_000 }).type, 'none', '缺席一次还不算改善')
  const improved = observeVision(gate, { issue: null, at: T + 5_000 })
  assert.deepEqual(improved, { type: 'improved', issue: 'excessive_trunk_lean' })
  assert.equal(observeVision(gate, { issue: null, at: T + 7_000 }).type, 'none', '改善只确认一次，不反复表功')

  observeVision(gate, { issue: 'excessive_trunk_lean', at: T + 9_000 })
  const tooSoon = observeVision(gate, { issue: 'excessive_trunk_lean', at: T + 11_000 })
  assert.equal(tooSoon.type, 'none', '同问题 30 秒内不重复开口')
  const again = observeVision(gate, { issue: 'excessive_trunk_lean', at: T + 1_000 + SAME_ISSUE_MIN_GAP_MS })
  assert.equal(again.type, 'cue')
})
