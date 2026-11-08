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
 * whole stability axis is now unassessable ('control'). Internal score
 * computation is unchanged; only presentation moves.
 *
 * Minimum-axis contract (2026-11-09, Codex round-4,
 * docs/minimum-axis-contract-2026-11-09.md) replaces the suspension
 * round's ≥60% numeric-coverage gate: Codex accepted the hammer
 * no-total outcome but not the percentage rationale — equal weight
 * coverage need not preserve equal meaning, so no percentage can
 * establish that a remainder supports a total. The contract below
 * (totalWithheld) is per movement×view by construction: a total is
 * presented iff no axis is unassessable for a validity reason and
 * every by-design-applicable axis is assessed in some form. The
 * control-construct scope review in the same round extended the
 * 'control' suspension from hammer_curl to every profile sharing the
 * unresolved assumption (see CONTROL_SUSPENDED_TYPES in
 * extendedRecognition.ts).
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
 * suspension (2026-11-09, Codex rounds 3–4): the suspended profiles'
 * stability number is dominated by a control term read off the
 * elbow-dependent upper-arm angle, the same world channel already shown
 * to carry per-rep sign-flipping noise, so upper-arm control cannot be
 * judged reliably from this view yet and the whole stability axis is
 * withheld rather than rebranded from its speed/duration remainder. */
export const UNASSESSABLE_REASONS = ['view', 'single-side', 'no-bilateral-evidence', 'framing', 'control'] as const

/** Nominal axis weights of the set total (the weights every emit site
 * renormalizes over). Coverage of a total = the share of this nominal
 * weight carried by axes that still present a number. Since the
 * minimum-axis contract (below) this is DIAGNOSTIC METADATA ONLY — it
 * is reported in docs and tests to describe how much of the nominal
 * construct a presented total renormalizes over, and it must never
 * gate presentation again. */
export const AXIS_WEIGHTS: Record<AxisKey, number> = { depth: .35, stability: .25, trunk: .20, symmetry: .20 }
export const numericCoverageOf = (a?: AxisAssessments | null): number =>
  !a ? 1 : AXIS_KEYS.reduce((sum, k) => sum + (a[k].kind === 'numeric' ? AXIS_WEIGHTS[k] : 0), 0)
/** Unassessable reasons that mark an axis NON-APPLICABLE for the
 * movement×view by design: the view cannot evidence a bilateral
 * judgment (front-raise symmetry, 'view'), or the movement is performed
 * and measured on one side by design ('single-side'). A non-applicable
 * axis is not a gap in the set's evidence — the applicable axes are
 * assessed in other forms (front-raise depth as bands) — so these
 * reasons never withhold a total by themselves. */
export const BY_DESIGN_UNASSESSABLE_REASONS: readonly string[] = ['view', 'single-side']
/** Minimum-axis contract (2026-11-09, Codex round-4 — replaces the
 * suspension round's ≥60% coverage gate, whose rationale Codex rejected:
 * a presentation gate and a scoring weight differ in purpose, but
 * neither supplies evidence for a percentage, and equal weight coverage
 * need not preserve equal meaning). A set total is presented iff BOTH:
 *  (i) no axis is unassessable for a VALIDITY reason — the 'control'
 *      suspension (an axis whose construct failed its validity review)
 *      and the session-level 'framing' cannot-assess state (no axis
 *      could be evidenced at all) both block; and
 *  (ii) every by-design-applicable axis for the movement×view is
 *      assessed in SOME form — numeric, category, or bands. An
 *      applicable axis that went unassessed in this set (e.g. symmetry
 *      with 'no-bilateral-evidence') blocks: the set did not produce
 *      the evidence its total claims to summarize.
 * Axes unassessable BY DESIGN (BY_DESIGN_UNASSESSABLE_REASONS) are
 * non-applicable and never block. Outcomes: hammer frontal → withheld
 * (control suspension); front raise → total returns (stability+trunk
 * renormalized per step 3, depth as bands alongside); single-side
 * family → presented; degraded framing → withheld. */
export const totalWithheld = (a?: AxisAssessments | null): boolean => {
  if (!a) return false
  return AXIS_KEYS.some(k => {
    const ax = a[k]
    return ax.kind === 'unassessable' && !BY_DESIGN_UNASSESSABLE_REASONS.includes(ax.reason)
  })
}
/** Companion-tone note shown wherever a set total is withheld: brief, no
 * score language, the pause framed as waiting for more evidence — never
 * as a failure of the set. */
export const TOTAL_WITHHELD_NOTE = '这一组能评的项目还不够多，总分先暂停——等能看清的部分更多了，再一起算'

/** Scope label for a PRESENTED total whose numeric axes do not cover
 * every applicable axis (2026-11-09, Codex round-5 correction — the
 * front-raise case: its total is computed over stability + trunk only,
 * depth being per-side bands and symmetry unassessable by design). A
 * bare number invites the reader to assume it summarizes all four axes,
 * so wherever such a total is shown its scope is named: the axes it is
 * actually computed over (in the surface's own display names), and the
 * axes assessed in another form stay in that form — a band or a timing
 * category is NEVER converted into a number to feed the total, and this
 * label is where that fact is stated. Derived from the assessment map,
 * never hardcoded per movement.
 *
 * Returns null when no scope label applies:
 *  - no assessment map (legacy sets present exactly as before);
 *  - the total is withheld (TOTAL_WITHHELD_NOTE owns that state);
 *  - every applicable axis is numeric — by-design-unassessable axes
 *    ('view' / 'single-side') are non-applicable, so a total over the
 *    remaining numeric axes covers all applicable axes and keeps the
 *    current presentation. */
export const totalScopeNote = (
  a: AxisAssessments | null | undefined,
  labels: Record<AxisKey, string>,
): string | null => {
  if (!a || totalWithheld(a)) return null
  const otherForm = AXIS_KEYS.filter(k => a[k].kind === 'category' || a[k].kind === 'bands')
  if (!otherForm.length) return null
  const included = AXIS_KEYS.filter(k => a[k].kind === 'numeric').map(k => labels[k])
  if (!included.length) return null
  const others = otherForm.map(k => `${labels[k]}${a[k].kind === 'bands' ? '看档位' : '看类别'}`)
  return `总分只按 ${included.join('、')} 算；${others.join('、')}，不算进总分`
}

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
