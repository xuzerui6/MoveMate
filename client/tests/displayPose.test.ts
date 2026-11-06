import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DisplayPoseFilter,
  extrapolateDisplayPoints,
  DISPLAY_EXTRAPOLATION_CAP_MS,
  type DisplayPoint,
} from '../src/features/motion/lib/displayPose'

const landmark = (x: number, y: number, visibility = 0.9) => ({ x, y, z: 0, visibility })
const point = (x: number, y: number, visibility = 0.9): DisplayPoint => ({ x, y, visibility })

test('display filter snaps to the first sample with zero velocity', () => {
  const filter = new DisplayPoseFilter()
  const out = filter.update([landmark(0.3, 0.4)], 1000)
  assert.deepEqual(out.points, [{ x: 0.3, y: 0.4, visibility: 0.9 }])
  assert.deepEqual(out.velocities, [[0, 0]])
})

test('display filter attenuates per-frame jitter around a still pose', () => {
  const filter = new DisplayPoseFilter()
  let out = filter.update([landmark(0.5, 0.5)], 0)
  // Alternate ±0.01 around the true point at the 15 FPS publish rate.
  for (let i = 1; i <= 40; i++) {
    out = filter.update([landmark(0.5 + (i % 2 ? 0.01 : -0.01), 0.5)], i * (1000 / 15))
  }
  assert.ok(Math.abs(out.points[0].x - 0.5) < 0.0075, `smoothed x=${out.points[0].x} should sit well inside the ±0.01 raw jitter`)
  assert.equal(out.points[0].y, 0.5)
})

test('display filter tracks a step without overshoot', () => {
  const filter = new DisplayPoseFilter()
  filter.update([landmark(0.3, 0.5)], 0)
  let previous = 0.3
  let out = filter.update([landmark(0.6, 0.5)], 50)
  for (let i = 2; i <= 12; i++) {
    out = filter.update([landmark(0.6, 0.5)], i * 50)
    assert.ok(out.points[0].x >= previous - 1e-9 && out.points[0].x <= 0.6, `step response must approach monotonically, got ${out.points[0].x}`)
    previous = out.points[0].x
  }
  assert.ok(Math.abs(out.points[0].x - 0.6) < 0.02, `should settle on the step, got ${out.points[0].x}`)
})

test('display filter estimates velocity of a constantly moving point', () => {
  const filter = new DisplayPoseFilter()
  let out = filter.update([landmark(0.1, 0.5)], 0)
  // 0.05 units per 100 ms sample = 0.5 units/second.
  for (let i = 1; i <= 12; i++) out = filter.update([landmark(0.1 + i * 0.05, 0.5)], i * 100)
  assert.ok(Math.abs(out.velocities[0][0] - 0.5) < 0.08, `velocity x=${out.velocities[0][0]} should be ≈0.5`)
  assert.ok(Math.abs(out.velocities[0][1]) < 0.02, `velocity y=${out.velocities[0][1]} should be ≈0`)
})

test('display filter clamps absurd velocities and survives a teleport', () => {
  const filter = new DisplayPoseFilter()
  filter.update([landmark(0.1, 0.1)], 0)
  const out = filter.update([landmark(0.95, 0.95)], 16)
  assert.ok(Math.abs(out.velocities[0][0]) <= 2.5 && Math.abs(out.velocities[0][1]) <= 2.5)
  assert.ok(Number.isFinite(out.points[0].x) && Number.isFinite(out.points[0].y))
})

test('display filter restarts after a long gap instead of gliding from stale state', () => {
  const filter = new DisplayPoseFilter()
  filter.update([landmark(0.2, 0.2)], 0)
  filter.update([landmark(0.22, 0.2)], 66)
  const out = filter.update([landmark(0.8, 0.7)], 66 + 600)
  assert.deepEqual(out.points, [{ x: 0.8, y: 0.7, visibility: 0.9 }])
  assert.deepEqual(out.velocities, [[0, 0]])
})

test('display filter keeps finite output for non-finite input points', () => {
  const filter = new DisplayPoseFilter()
  filter.update([landmark(0.4, 0.4)], 0)
  const out = filter.update([{ x: Number.NaN, y: 0.45, z: 0, visibility: 0.9 }], 66)
  assert.ok(Number.isFinite(out.points[0].x) && Number.isFinite(out.points[0].y))
  assert.equal(out.points[0].x, 0.4)
})

test('extrapolation pushes a point along its velocity by the measured age', () => {
  const points = [point(0.5, 0.5)]
  const out = extrapolateDisplayPoints(points, [[0.5, 0]], 40)
  assert.ok(Math.abs(out[0].x - 0.52) < 1e-9, `x=${out[0].x} should be 0.5 + 0.5*0.04`)
  assert.equal(out[0].y, 0.5)
})

test('extrapolation horizon is clamped to the cap for older frames', () => {
  const points = [point(0.5, 0.5)]
  const capped = extrapolateDisplayPoints(points, [[0.5, 0]], 200)
  const atCap = extrapolateDisplayPoints(points, [[0.5, 0]], DISPLAY_EXTRAPOLATION_CAP_MS)
  assert.deepEqual(capped, atCap)
  assert.ok(Math.abs(capped[0].x - (0.5 + 0.5 * DISPLAY_EXTRAPOLATION_CAP_MS / 1000)) < 1e-9)
})

test('extrapolation refuses stale, non-positive and non-finite ages', () => {
  const points = [point(0.5, 0.5)]
  for (const age of [251, 1000, 0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(extrapolateDisplayPoints(points, [[1, 1]], age), points, `age ${age} must not extrapolate`)
  }
})

test('extrapolation never pushes low-visibility points', () => {
  const points = [point(0.5, 0.5, 0.3), point(0.5, 0.5, 0.9)]
  const out = extrapolateDisplayPoints(points, [[1, 0], [1, 0]], 80)
  assert.equal(out[0].x, 0.5)
  assert.ok(out[1].x > 0.5)
})

test('extrapolation displacement is hard-capped even at maximum velocity', () => {
  const points = [point(0.5, 0.5)]
  const out = extrapolateDisplayPoints(points, [[2.5, 0]], DISPLAY_EXTRAPOLATION_CAP_MS)
  assert.ok(Math.abs(out[0].x - 0.5 - 0.12) < 1e-9, `shift=${out[0].x - 0.5} should be capped at 0.12`)
  const diagonal = extrapolateDisplayPoints(points, [[2.5, 2.5]], DISPLAY_EXTRAPOLATION_CAP_MS)
  assert.ok(Math.hypot(diagonal[0].x - 0.5, diagonal[0].y - 0.5) <= 0.12 + 1e-9)
})
