# Step 3 · Conservative scoring contract (assessability matrix) — 2026-11-08

Step 3 of the converged Muse×Codex accuracy plan
(`~/workspace/movemate-research/codex-consult-accuracy-r2-out.txt`), built on
the Phase-0 suite, labels and audit
(`~/workspace/movemate-research/accuracy-phase0/`).

**What changed is scoring, never counting.** All 56 camera-linked movements
stay countable; every tracker gate, threshold and cycle rule is untouched.
What stops is the printing of numbers the current view cannot support: an
axis either earns a number, reports a category, or declares itself
unassessable — and an axis without a number never silently averages into a
total. Totals renormalize over the numeric axes only, and every surface
(Summary, plan rest reveal, share cards, restored sets) renders the state
instead of a fabricated number.

## The matrix as implemented

Axis states live in `client/src/features/motion/lib/axisAssessment.ts`
(`numeric | category | bands | unassessable{reason}`), are computed by the
extended tracker per set (`assessments()` in `extendedRecognition.ts`), ride
the session/plan sync inside the metrics / score objects, and are validated
server-side (`cleanAxisAssessment` in `motion.service.ts`, `axisStateSchema`
in the gym zod schema).

| Cell | Movement × view | Depth | Stability | Trunk | Symmetry |
|---|---|---|---|---|---|
| 1 | Frontal bilateral arm — **hammer_curl** | numeric | numeric | numeric | **CATEGORICAL** 同步 / 略有错峰 / 明显交替 from peak-timing offsets; leaves the total (÷0.80) |
| 2 | **front_raise**, frontal | **per-side BANDS** 未到肩高 / 到达肩高 / 过顶； leaves the total | numeric | numeric | **cannot assess** (`view`); total ÷0.45 |
| 3 | Single-side by design — romanian_deadlift, glute_bridge, barbell_deadlift, lying_leg_raise | numeric | numeric | numeric | **cannot assess** (`single-side`); leaves the total (÷0.80) |
| 4 | Degraded framing, any extended-tracker movement | **cannot assess** (`framing`) — all four axes when the session ends in the state with 0 scored reps; counting already paused by the gates; diagnostics stage `cannot_assess`; copy `这个角度评不了——<reframe cue>` |
| 5 | Everything else | unchanged | unchanged | unchanged | unchanged |

### Cell 1 — hammer-curl symmetry category

Derived from the same peak-timing evidence the retired numeric formula
consumed, reusing the round-3 machinery: a merged pair contributes the
offset between its two peak midpoints; a single with a peer peak inside
`PEAK_PAIR_WINDOW_MS` contributes that offset; a single with neither
contributes its distance to the other side's most recent confirmed peak
(the alternating case — see Deviations). A rep whose other side has never
peaked records nothing. Per-rep offsets accumulate in
`scoreAccumulator.symmetryOffsetsMs`; the set presentation is the category
of their **median** (the median philosophy of the previous round, kept):
≤150 ms 同步 (the tracker's own merge tolerance), ≤800 ms 略有错峰 (the
pairing window), beyond 明显交替. `poor_coordination` is no longer derived
from this axis — 明显交替 is a legitimate style the prep copy explicitly
allows, described, not penalized.

### Cell 2 — front-raise bands

Per scored rep, each participating side's confirmed peak raised angle
(the value round 4's peak-evidence rule latched) is banded: <80° 未到肩高，
80–115° 到达肩高， >115° 过顶. Tallies accumulate in
`scoreAccumulator.depthBandCounts`; the set presentation is each side's
modal band (ties resolve toward 到达肩高， then 未到肩高 — never upward).
The 80° edge is the nominal 90° shoulder line minus the 10° neighbourhood
the peak-evidence rule already uses. 过顶 is unreachable in scored output
today — the counter revokes overshoots before they can score — and stays
in the vocabulary so the band set is complete and honest. Symmetry is
unassessable frontally (labels: only timing and projected height are
observable; the right channel's episodic over-read is a channel
diagnostic, not a performance fact).

### Cell 3 — where "symmetry" was never a symmetry judgment

The codebase carries no explicit view signal, so the cell is mapped by
movement design (the derivation the brief asked to be documented):

- **Single-side by design** (`needed()` locks one tracking side;
  calibration judges that side alone): romanian_deadlift, glute_bridge,
  barbell_deadlift, lying_leg_raise → symmetry unassessable. Their old
  channel compared both knees or a support-point drift — not a bilateral
  judgment — and the prescribed views are side views where the far side
  is occluded by design.
- **Bilateral movements with diagonal prescribed views** (bench_press,
  incline_bench_press, seated_curl, seated_lateral_raise,
  seated_triceps_extension, lying_triceps_extension, reverse_fly,
  triceps_kickback, upright_row, bench_dip, seated press family in the
  plan tracker): both sides are inside the tracker's required-joint gates
  for every counted frame — a frame where the far side is not evidenced
  does not score at all — so their bilateral symmetry stays numeric.
- **Support-discipline fourth axes are not symmetry judgments** and keep
  their numbers: one_arm_row （支撑稳定 = support-elbow drift),
  mountain_climber （左右协调 = partner-leg extension at the peak),
  split_squat （后脚稳定 = rear-ankle drift), standing_leg_curl (support-leg
  discipline). Their definitions are single-side stillness, observable
  from the prescribed views.

### Cell 4 — the cannot-assess session state

In the extended tracker, an unmeasurable stretch (gate loss via
`softInterrupt`, or a `暂时无法…` cannot-confirm form rejection) lasting
≥ **3000 ms** enters the state: diagnostics stage `cannot_assess`, the
companion line becomes `这个角度评不了——<movement-family reframe cue>`
(one cue, from `framingCopyFor`), counting remains paused by the gates
themselves, and a session that ends in the state with zero scored reps
presents all four axes as unassessable (`framing`). The first measurable
frame exits the state. Wrong-pose rejections that name a visible posture
（俯身/站姿不计入…) never trip it — the system is seeing the user clearly
there — and keep their specific copy indefinitely. The 3000 ms threshold
sits above every transient in the suite (freeze grace 2000 ms, gate
bursts ≈800 ms) and far below the degraded clips, which never measure.

Core-4 and plan trackers: counting already pauses under their interrupts
and unscored sets already present as unassessed in Summary; the named
state was implemented where the suite's degraded clips live (extended
tracker). See Deviations.

## Consumer audit (the hammer-median round's failure class)

Every consumer of the four axes was audited and, where needed, taught the
states end-to-end:

| Consumer | Handling |
|---|---|
| Live trackers (extended) | Emit the map on every metrics surface (`updateAverage`, `interrupt`, emits); totals renormalized at the emit sites |
| Adaptive wrapper | The unscored-rep rebuild now also restores `axisAssessment` from the pre-rep snapshot (was: would have kept the unscored rep's map) |
| Workout page | Capsule treats `cannot_assess` as unclear （我有点看不清）; diagnostics details label the stage 这个角度评不了 |
| Summary | Non-numeric axes render state text （同步 / 左 未到肩高 · 右 … / 这个角度评不了）, never 0; a note under the axes states 总分只按能评的项目算； `buildSetReveal` compares only axes numeric in both sets (`numericAxes`) — a category can no longer masquerade as a regression |
| Plan rest reveal (PlanWorkout) | Same treatment via `assessmentFromScore`; the set's map is forwarded inside the score payload |
| Client restore (`restoredSetMetrics`) | Returns the map: stored map wins; otherwise rebuilt from recorded offsets / band tallies; pre-contract sets get no invented map and keep their numbers |
| Share cards (`cardData`/`cardSvg`) | Non-numeric axes render as text with an empty bar; the card never prints a fabricated 0 for them |
| Server standalone (`motion.service cleanMetrics`) | Top-level + accumulator `axisAssessment` strictly validated & stored; `symmetryOffsetsMs` (0–10000 ms, ≤ count) and `depthBandCounts` (≤ count per band) validated & stored verbatim; partial updates without the fields keep the stored state |
| Server plan (`gym/service` zod) | Same three fields added to the score schema (unknown-key stripping would otherwise have eaten them); the existing sum checks are unaffected (renormalized sums stay ≤ count×100) |
| Session migration / stored sessions | `formBreakdown` stays numeric-shaped (placeholder 0 for non-numeric axes); the map travels as its own field, so old records load unchanged |

## Replay verification (Phase-0 suite, L2 protocol, Full landmarks)

Same harness as Phase 0 (production tracker + TimeFilter, visibility
clamped, nulls skipped), baseline `60a1513` vs this change; full JSON in
`~/workspace/movemate-research/accuracy-phase0/step3-replay/`. The L2 layer
is the mechanism-evidence layer (Phase 0 established the L1 wrapper
collapses on this footage for reasons unrelated to scoring). FR-B / FR-D /
SETUP-91 have manifest entries but no extracted landmarks in Phase 0, so
no replay was possible for them; cell 4 is fixture-proven instead (below).

**Counting is identical on every clip — same reps at the same timestamps.**

| Clip | Reps base → step 3 | Total base → step 3 | Suppressed | Retained |
|---|---|---|---|---|
| FR-A front raise | 3 → 3 | 64 → 60 | depth number (84), symmetry number (38), poor_coordination ×2 | stability 51, trunk 72; unstable_movement ×3, body_alignment ×2 |
| FR-C front raise | 6 → 6 | 74 → 68 | depth number (93), symmetry number (55), poor_coordination ×3 | stability 48, trunk 92; unstable_movement ×4 |
| HC-A hammer | 16 → 16 | 71 → 70 | symmetry number (median 74), poor_coordination ×8 | depth 100, stability 15, trunk 86; unstable_movement ×16 |
| HC-B hammer (held out) | 1 → 1 | 72 → 80 | symmetry number (41), poor_coordination ×1 | depth 99, stability 45, trunk 91 |

Per-clip step-3 presentations: FR-A depth bands 左 到达肩高 （肩高 1 / 未到 1)
· 右 未到肩高， symmetry cannot assess. FR-C bands 左 未到肩高 · 右 到达肩高.
HC-A symmetry category 明显交替 (see the fallback note below). HC-B's single
surviving rep carried no bilateral evidence → symmetry cannot assess
(`no-bilateral-evidence`) instead of the baseline's printed 41.

Axis coverage after the contract: FR-A/FR-C — 2 of 4 axes numeric, 1
categorical, 1 suppressed. HC-A — 3 numeric, 1 categorical. HC-B — 3
numeric, 1 suppressed. No clip enters `cannot_assess` under the L2
protocol (it feeds only measurable frames by construction).

## Findings flagged, not acted on

1. **Hammer totals are now stability-dominated on degraded footage.**
   HC-A's stability reads 15 (labels judge the performance "adequate")
   while depth/trunk read 100/86; with symmetry's 0.20 weight redistributed,
   the renormalized total (70) is pulled by the stability channel's read
   noise more than the old total (71) was. The matrix instructed: document,
   do not reweight. **Reweighting or re-anchoring the stability axis is a
   separate decision for Edward/Codex** — the data point is: on HC-A the
   stability channel's 15 costs the set ≈26 points of total under the
   renormalized weights (0.25/0.80 × 85), up from ≈21 points under the old
   four-axis weights — renormalization concentrates whatever noise the
   retained axes carry.
2. **The alternating fallback reaches across reps on fragmented streams.**
   HC-A's offsets include cross-rep distances (up to 14.1 s) because the
   offline L2 stream fragments bilateral efforts (Phase 0: merge rate
   6/18); the median (1629 ms) therefore reads 明显交替 for a set the
   labels call synchronous-bilateral. The fallback never fabricates — the
   peak existed; the distance is a fact — but on a fragmented stream
   "nearest other-side peak" stops meaning "this effort's partner".
   Capping the fallback at 2500 ms would read 略有错峰 instead (median
   450 ms). On device-grade streams (the fixtures) the pair/peer paths
   dominate and categories read correctly. **Whether to cap is a contract
   refinement decision, flagged here rather than silently thresholded** —
   the plan froze new thresholds, and this one deserves the same review
   as the others.
3. **First-rep flush race (alternating sets):** the first alternating rep
   emits on the +600 ms pending flush, before the partner's first peak
   locks, so it records no offset; later reps record against the previous
   partner peak. Set categories are unaffected in the fixtures.

## Deviations and interpretations

1. **Cell 1 scoped to hammer_curl.** It is the only movement with
   peak-timing evidence and label coverage. The plan tracker's frontal arm
   profiles (biceps_curl, lateral_raise, shoulder_press, bent_over_row)
   compute symmetry from a peak-frame instantaneous read — the mandated
   derivation (peak timing) does not exist there; they keep numeric
   symmetry this step. Extending categories there needs per-side peak
   plumbing in `PlanExerciseTracker` — flagged as a follow-up, not done
   silently.
2. **Cell 3 mapped by movement design** (no explicit view signal exists
   in the codebase) — derivation documented in the cell-3 section above.
3. **Cell 4 state implemented in the extended tracker** (all suite
   movements + 40+ movements). Core-4 and plan trackers already pause
   counting under interrupt and present unscored sets as unassessed; the
   named stage/copy was not duplicated there this step.
4. **Hammer offset fallback** (nearest other-side confirmed peak,
   unbounded) goes beyond the old formula's evidence — it is what makes
   明显交替 emittable at all; quantified in Finding 2.
5. **Front-raise band edge** at 80° (nominal 90° − the 10° evidence
   neighbourhood); 过顶 unreachable in scored output today by design of
   the round-4 revocation.
6. **Historical sets are not recomputed.** Pre-contract hammer sets keep
   their median numeric symmetry (the `symmetryValues` path is untouched);
   the category applies to sets recorded after this ships — the same rule
   as the median round.
7. **Stability weighting unchanged** (Finding 1) per the matrix's
   explicit instruction.

## Verification

- Client `test:repository`: **473/473** (466 baseline + 7 new step-3
  fixtures in `client/tests/scoring-contract.test.ts`; 8 existing fixtures
  rewritten to the new contract — same choreography, same rep counts,
  assertions moved from numbers to offsets/categories/bands). Client tsc
  clean.
- Server: **129/129** (127 + 2 new end-to-end fixtures: standalone +
  plan-set round-trips and malformed-state rejections) + build clean.
- Cloudflare: **34/34** + typecheck clean.
- Replay: counting identical on all 4 replayable clips (above).
- New fixtures cover: categorical symmetry emission （同步/略有错峰/明显交替）,
  cannot-assess axes excluded from totals (hammer, front raise,
  romanian deadlift renormalizations), the degraded-framing session state
  (entry at 3 s, exit on a measurable frame, short bursts unaffected),
  restore/card/reveal consumers, and server round-trips.

Deploy: production `dongban.xyz` Version `467ba0b5-8521-4017-91d0-5dc9757ed23b`, preview
`preview.dongban.xyz` Version `c2af4539-af33-45c7-a695-59cd052c3bcf`
(main `9ffec27`, CI run 42491445264 green; live bundles verified to contain
the new copy). No bcrypt fallback was needed in the deploy worktree.
