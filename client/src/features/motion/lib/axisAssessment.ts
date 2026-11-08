/**
 * Step-3 scoring contract (2026-11-08, Muse×Codex converged accuracy plan,
 * step 3 — see docs/scoring-contract-step3-2026-11-08.md).
 *
 * The Phase-0 evidence showed the pose channel cannot support every number
 * the app used to print: frontal bilateral symmetry was read off two elbow
 * channels that disagree by 15–35° on visibly symmetric arms, front-raise
 * depth came from a raised-angle channel with a systematic low bias, and
 * single-side movements emitted a "symmetry" number computed from joints
 * that say nothing about bilateral symmetry. The contract: an axis either
 * earns a number, reports a category, or declares itself unassessable —
 * and an axis without a number NEVER silently averages into a total.
 * Totals renormalize over the numeric axes only. Counting is untouched.
 *
 * Axis-validity suspension (2026-11-09, Codex round-3 consultation,
 * docs/axis-validity-suspension-2026-11-09.md): step 3's renormalization
 * concentrated the hammer total onto the stability axis, whose control
 * term reads the same noisy elbow channel — so for the hammer family the
 * whole stability axis is now unassessable ('control'), and a minimum-
 * coverage rule (below) decides whether a set total may be presented at
 * all. Internal score computation is unchanged; only presentation moves.
 */

export type AxisKey = 'depth' | 'stability' | 'trunk' | 'symmetry'
export const AXIS_KEYS: AxisKey[] = ['depth', 'stability', 'trunk', 'symmetry']

/** Bilateral peak-timing categories (hammer-curl family). Derived from the
 * same peak-timing evidence the retired numeric formula consumed — the two
 * sides' confirmed peak midpoints — never from instantaneous elbow gaps. */
export type SyncCategory = 'sync' | 'slight' | 'alternating'
export const SYNC_CATEGORY_LABELS: Record<SyncCategory, string> = {
  sync: '同步',
  slight: '略有错峰',
  alternating: '明显交替',
}
/** Category edges, in peak-midpoint offset ms. 同步 ends at the tracker's own
 * merge tolerance (peaks closer than this are one synchronized effort);
 * 略有错峰 ends at PEAK_PAIR_WINDOW_MS — the system's own bound for "the
 * same bilateral effort" since round 3. Beyond it the sides did not peak
 * together in any sense the pipeline recognizes: 明显交替. */
export const SYNC_MAX_MS = 150
export const SLIGHT_MAX_MS = 800
export const syncCategoryForOffset = (offsetMs: number): SyncCategory =>
  offsetMs <= SYNC_MAX_MS ? 'sync' : offsetMs <= SLIGHT_MAX_MS ? 'slight' : 'alternating'

/** Front-raise depth bands, judged per side from that side's confirmed peak
 * raised angle (the value round 4's peak-evidence rule latched). The design
 * band is 65–115° with 90° the nominal shoulder line; the band edges grant
 * the same ±10° neighbourhood the peak-evidence rule uses (a peak the
 * evidence accepted at 80–115° reached shoulder height; >115° is the
 * overshoot the counter already revokes, so scored output cannot contain
 * it today — the band exists so the vocabulary is complete and honest). */
export type DepthBand = 'below' | 'shoulder' | 'over'
export const DEPTH_BAND_LABELS: Record<DepthBand, string> = {
  below: '未到肩高',
  shoulder: '到达肩高',
  over: '过顶',
}
export const frontRaiseBandFor = (raisedDeg: number): DepthBand =>
  raisedDeg < 80 ? 'below' : raisedDeg <= 115 ? 'shoulder' : 'over'

/** Per-side tallies of scored reps per band, as recorded in the accumulator. */
export type DepthBandCounts = {
  left?: Partial<Record<DepthBand, number>>
  right?: Partial<Record<DepthBand, number>>
}
/** The set-level band for one side: the modal band of its scored reps.
 * Ties resolve toward 到达肩高 first (the design target), then 未到肩高,
 * then 过顶 — a tie never inflates the report. */
export function modalBand(counts?: Partial<Record<DepthBand, number>>): DepthBand | undefined {
  if (!counts) return undefined
  const preference: DepthBand[] = ['shoulder', 'below', 'over']
  let best: DepthBand | undefined
  let bestCount = 0
  for (const band of preference) {
    const n = counts[band] || 0
    if (n > bestCount) { best = band; bestCount = n }
  }
  return bestCount > 0 ? best : undefined
}

export type AxisAssessment =
  | { kind: 'numeric' }
  | { kind: 'unassessable'; reason: string }
  | { kind: 'category'; category: SyncCategory }
  | { kind: 'bands'; left?: DepthBand; right?: DepthBand }

export type AxisAssessments = Record<AxisKey, AxisAssessment>

export const NUMERIC_AXIS: AxisAssessment = { kind: 'numeric' }
export const allNumericAssessments = (): AxisAssessments => ({
  depth: { kind: 'numeric' },
  stability: { kind: 'numeric' },
  trunk: { kind: 'numeric' },
  symmetry: { kind: 'numeric' },
})

/** Reasons an axis can be unassessable (server whitelist mirrors this list):
 * view — the camera view cannot evidence the axis (front-raise symmetry,
 * side-view bilateral judgments); single-side — the movement is performed
 * and measured on one side by design; no-bilateral-evidence — a bilateral
 * axis whose set produced no bilateral evidence (e.g. pure single-arm
 * hammer sets); framing — degraded framing, the cannot-assess session
 * state (no axis could be evidenced at all); control — the axis-validity
 * suspension (2026-11-09, Codex round-3): the hammer family's stability
 * number is dominated by a control term read off the elbow-dependent
 * upper-arm angle, the same world channel already shown to carry per-rep
 * sign-flipping noise, so upper-arm control cannot be judged reliably
 * from this view yet and the whole stability axis is withheld rather
 * than rebranded from its speed/duration remainder. */
export const UNASSESSABLE_REASONS = ['view', 'single-side', 'no-bilateral-evidence', 'framing', 'control'] as const

/** Nominal axis weights of the set total (the weights every emit site
 * renormalizes over). Coverage of a total = the share of this nominal
 * weight carried by axes that still present a number. */
export const AXIS_WEIGHTS: Record<AxisKey, number> = { depth: .35, stability: .25, trunk: .20, symmetry: .20 }
/** Minimum-coverage rule (2026-11-09, Codex round-3 amendment: an axis
 * being numeric does not establish the remaining total is meaningful, so
 * renormalization alone no longer presents a total). A set's total is
 * presented only when its numeric axes cover at least this share of the
 * nominal weight; below it the total is withheld and the assessable axes
 * present alone. Hammer frontal after the control suspension covers
 * depth + trunk = .55 → withheld, as decided; front raise covers
 * stability + trunk = .45 → withheld; the single-side family covers
 * .80 → still presented. */
export const MIN_TOTAL_COVERAGE = .6
export const numericCoverageOf = (a?: AxisAssessments | null): number =>
  !a ? 1 : AXIS_KEYS.reduce((sum, k) => sum + (a[k].kind === 'numeric' ? AXIS_WEIGHTS[k] : 0), 0)
export const totalWithheld = (a?: AxisAssessments | null): boolean =>
  numericCoverageOf(a) < MIN_TOTAL_COVERAGE - 1e-9
/** Companion-tone note shown wherever a set total is withheld: brief, no
 * score language, the pause framed as waiting for more evidence — never
 * as a failure of the set. */
export const TOTAL_WITHHELD_NOTE = '这一组能评的项目还不够多，总分先暂停——等能看清的部分更多了，再一起算'

/** Axes that carry a number under an assessment map (absent map = all). */
export const numericAxesOf = (a?: AxisAssessments | null): AxisKey[] =>
  AXIS_KEYS.filter(k => !a || a[k].kind === 'numeric')

/**
 * Rebuild the assessment map for a stored score accumulator when the map
 * itself was not stored (defensive restore path). Only evidence-based
 * derivations are made: recorded peak-timing offsets imply the timing
 * category; recorded front-raise band tallies imply per-side bands (and
 * the front-raise symmetry rule). A stored map always wins.
 */
export function assessmentFromScore(score: any): AxisAssessments | undefined {
  if (score?.axisAssessment && typeof score.axisAssessment === 'object') {
    const stored = score.axisAssessment
    const ok = AXIS_KEYS.every(k => stored[k] && typeof stored[k] === 'object' && typeof stored[k].kind === 'string')
    if (ok) return stored as AxisAssessments
  }
  const offsets = score?.symmetryOffsetsMs
  const bands = score?.depthBandCounts
  if (Array.isArray(offsets) && offsets.length) {
    const sorted = [...offsets].sort((a: number, b: number) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    const out = allNumericAssessments()
    out.symmetry = { kind: 'category', category: syncCategoryForOffset(median) }
    // Recorded peak-timing offsets exist only for hammer-family sets, and
    // those sets' stability was computed by the suspended control channel
    // (see UNASSESSABLE_REASONS 'control') — the same evidence-based
    // derivation as the category above, extended to the suspended axis.
    out.stability = { kind: 'unassessable', reason: 'control' }
    return out
  }
  if (bands && (bands.left || bands.right)) {
    const left = modalBand(bands.left)
    const right = modalBand(bands.right)
    if (left || right) {
      const out = allNumericAssessments()
      out.depth = { kind: 'bands', ...(left ? { left } : {}), ...(right ? { right } : {}) }
      out.symmetry = { kind: 'unassessable', reason: 'view' }
      return out
    }
  }
  return undefined
}

/** Display text for a non-numeric axis (share cards, compact rows). */
export function axisStateText(a: AxisAssessment): string | null {
  if (a.kind === 'category') return SYNC_CATEGORY_LABELS[a.category]
  if (a.kind === 'bands') {
    const parts: string[] = []
    if (a.left) parts.push(`左 ${DEPTH_BAND_LABELS[a.left]}`)
    if (a.right) parts.push(`右 ${DEPTH_BAND_LABELS[a.right]}`)
    return parts.join(' · ') || null
  }
  if (a.kind === 'unassessable') return a.reason === 'control' ? '暂时评不了' : '这个角度评不了'
  return null
}
