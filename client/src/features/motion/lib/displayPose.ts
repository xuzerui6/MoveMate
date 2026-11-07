import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

/**
 * Display-only pose smoothing + short-horizon extrapolation.
 *
 * The skeleton overlay used to draw the newest raw inference landmarks exactly
 * when a result was published: at the main-thread 15 FPS submit cap the drawn
 * pose is 80–160 ms old, so fast joints (wrists at a curl peak, ~0.8–1.2 m/s)
 * trail the real limb by 8–12 cm, and unfiltered Lite jitter makes even a
 * still pose shimmer. This module fixes the *picture* only:
 *
 *  - a light One-Euro filter (min cutoff 6 Hz + speed term) removes jitter
 *    while staying responsive — far lighter than the evaluator's 1.5 Hz
 *    measurement filter in poseProtocol.ts;
 *  - each point is then pushed forward along its estimated velocity by the
 *    measured pipeline age (now − capturedAt), clamped to an 80 ms horizon,
 *    so most of the remaining trail is cancelled without overshoot risk.
 *
 * Nothing here feeds the evaluator: trackers keep consuming the raw frames
 * exactly as before. Every failure mode degrades to "draw the smoothed (or
 * raw) point where it is" — stale frames, absurd velocities, non-finite
 * values and low-visibility points are never extrapolated.
 */
export type DisplayPoint = { x: number; y: number; visibility: number }
export type DisplayVelocity = readonly [number, number]

/** Never extrapolate further than this into the future. */
export const DISPLAY_EXTRAPOLATION_CAP_MS = 80
/** A frame older than this is treated as lost, not extrapolated. */
export const DISPLAY_STALE_MS = 250
/** Points the model barely sees are drawn where measured, never pushed. */
export const DISPLAY_MIN_VISIBILITY = 0.5
/** Longer sample gaps restart the filter instead of gliding from stale state. */
const GAP_RESET_MS = 500
/** Per-axis speed sanity clamp, in normalized-frame units per second. */
const MAX_SPEED = 2.5
/** Hard cap on extrapolation displacement, in normalized-frame units. */
const MAX_SHIFT = 0.12
/** One-Euro parameters: light by design (the measurement filter uses 1.5 Hz). */
const MIN_CUTOFF = 6
const SPEED_COEFFICIENT = 3
const DERIVATIVE_CUTOFF = 1

const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt))
const finite = (value: number | undefined, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const clampSpeed = (value: number) => Math.min(MAX_SPEED, Math.max(-MAX_SPEED, value))

export class DisplayPoseFilter {
  private points: { x: number; y: number }[] | null = null
  private rawPoints: { x: number; y: number }[] | null = null
  private derivatives: [number, number][] = []
  private at = 0

  reset() {
    this.points = null
    this.rawPoints = null
    this.derivatives = []
    this.at = 0
  }

  /**
   * Feed one inference sample: the raw landmarks and the time they describe
   * (the frame's capturedAt when known, arrival time otherwise). Returns the
   * smoothed display points and each point's estimated velocity (units/s).
   */
  update(raw: NormalizedLandmark[], now: number): { points: DisplayPoint[]; velocities: DisplayVelocity[] } {
    if (!raw.length || !(now > this.at) || now - this.at > GAP_RESET_MS || !this.points || this.points.length !== raw.length) {
      this.points = raw.map(p => ({ x: finite(p.x, 0), y: finite(p.y, 0) }))
      this.rawPoints = this.points.map(p => ({ ...p }))
      this.derivatives = raw.map(() => [0, 0] as [number, number])
      this.at = now
      return {
        points: this.points.map((p, i) => ({ ...p, visibility: finite(raw[i].visibility, 1) })),
        velocities: this.derivatives.map(d => [...d] as [number, number]),
      }
    }
    const dt = Math.max(0.001, (now - this.at) / 1000)
    this.at = now
    const derivativeAlpha = alpha(DERIVATIVE_CUTOFF, dt)
    const points = raw.map((p, i) => {
      const previous = this.points![i]
      const rawPrevious = this.rawPoints![i]
      const derivative = this.derivatives[i]
      const next = { x: previous.x, y: previous.y }
      ;(['x', 'y'] as const).forEach((axis, k) => {
        const value = finite(p[axis], previous[axis])
        // Differentiate against the previous *raw* sample: differentiating
        // against the smoothed point inflates the estimate by 1/alpha in
        // steady motion (≈+20% here), which would overshoot extrapolation.
        const d = derivative[k] + derivativeAlpha * ((value - rawPrevious[axis]) / dt - derivative[k])
        derivative[k] = d
        next[axis] = previous[axis] + alpha(MIN_CUTOFF + SPEED_COEFFICIENT * Math.abs(d), dt) * (value - previous[axis])
        rawPrevious[axis] = value
      })
      this.points![i] = next
      return { ...next, visibility: finite(p.visibility, 1) }
    })
    return {
      points,
      velocities: this.derivatives.map(d => [clampSpeed(d[0]), clampSpeed(d[1])] as [number, number]),
    }
  }
}

/**
 * V4-B skeleton grading (recognition page v2, display only): a segment is only
 * as honest as its weaker endpoint. Both endpoints clearly seen (≥ 0.5) draw a
 * solid brand-green line; a half-seen segment (0.3–0.5) draws amber dashed —
 * the skeleton itself says "not sure here"; below 0.3 nothing is drawn rather
 * than pretending to track. Primary joints (shoulders/elbows/wrists — the
 * working chain) draw filled with a white ring so they stay readable in
 * bright light; hips/knees/ankles draw as smaller secondary points.
 */
export type SegmentGrade = 'solid' | 'uncertain' | 'hidden'
export function segmentGrade(visibilityA: number, visibilityB: number): SegmentGrade {
  const weaker = Math.min(visibilityA, visibilityB)
  if (weaker >= 0.5) return 'solid'
  if (weaker >= 0.3) return 'uncertain'
  return 'hidden'
}
export const PRIMARY_JOINTS: readonly number[] = [11, 12, 13, 14, 15, 16]
export function jointTier(index: number): 'primary' | 'secondary' {
  return PRIMARY_JOINTS.includes(index) ? 'primary' : 'secondary'
}
/** A joint below this visibility is not drawn at all — no ghost points. */
export const JOINT_MIN_VISIBILITY = 0.3

/**
 * Push display points forward along their velocity by the measured pipeline
 * age. The horizon is clamped to `capMs`; a stale age (frame effectively
 * lost), a non-positive/non-finite age, an absurd velocity or a
 * low-visibility point all leave the point exactly where it was measured.
 */
export function extrapolateDisplayPoints(
  points: DisplayPoint[],
  velocities: readonly DisplayVelocity[],
  ageMs: number,
  capMs: number = DISPLAY_EXTRAPOLATION_CAP_MS,
): DisplayPoint[] {
  if (!Number.isFinite(ageMs) || ageMs <= 0 || ageMs > DISPLAY_STALE_MS) return points
  const horizon = Math.min(ageMs, Math.max(0, capMs)) / 1000
  if (horizon <= 0) return points
  return points.map((point, i) => {
    const velocity = velocities[i]
    if (!velocity || point.visibility < DISPLAY_MIN_VISIBILITY) return point
    let dx = velocity[0] * horizon, dy = velocity[1] * horizon
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return point
    const magnitude = Math.hypot(dx, dy)
    if (magnitude > MAX_SHIFT) { dx *= MAX_SHIFT / magnitude; dy *= MAX_SHIFT / magnitude }
    return { ...point, x: point.x + dx, y: point.y + dy }
  })
}
