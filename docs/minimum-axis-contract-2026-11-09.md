# Minimum-axis contract + control-construct scope review — 2026-11-09

Round 5 of the Muse×Codex accuracy program. Authority: the Codex
round-4 consultation
(`~/workspace/movemate-research/codex-consult-stability-r2-out.txt`),
on top of step 3 (`docs/scoring-contract-step3-2026-11-08.md`) and the
axis-validity suspension
(`docs/axis-validity-suspension-2026-11-09.md`). Three workstreams:

- **A.** The ≥60% numeric-coverage gate is replaced by a **minimum-axis
  contract** (Codex: "the hammer no-total outcome is correct; the 60%
  rationale is not sufficient — do not replace it with another
  percentage").
- **B.** The **control-construct scope review** Codex demanded
  ("plumbing convenience is not a validity boundary"): every profile
  whose stability axis or control-type feedback derives from an
  upper-arm angle against a reference is inventoried and classified by
  mechanism. Two more profiles share hammer's unresolved assumption
  and are suspended in this round.
- **C.** **Suspended constructs stop correcting**: the suspension
  round withheld the axes and totals but left the suspended term's
  corrective outputs live (its Deviation 3, flagged). Codex's
  ship-first agreement assumed they stop. They now stop.

**Counting, internal score computation and XP are untouched** —
replay-verified below, and pinned by fixtures asserting the
pre-existing internal values.

## Workstream A — the minimum-axis contract

Implemented in `axisAssessment.ts` (`totalWithheld`). A set total is
presented iff **both**:

1. **No axis is unassessable for a validity reason** — the `control`
   suspension, and the session-level `framing` cannot-assess state
   (which blocked before and still blocks); and
2. **Every by-design-applicable axis for that movement×view is
   assessed in some form** — numeric, category, or bands. An
   applicable axis that went unassessed in this set (e.g. symmetry
   with `no-bilateral-evidence`) blocks: the set did not produce the
   evidence its total claims to summarize.

Axes unassessable **by design** for the view (`view`, `single-side`)
are non-applicable and never block. Numeric coverage
(`numericCoverageOf`, `AXIS_WEIGHTS`) remains exported as **diagnostic
metadata only** — it describes how much of the nominal weight a
presented total renormalizes over; it no longer gates anything, in
either direction (a .45-coverage total is presented; a .75-coverage
total with a suspended axis is withheld — both pinned by fixtures).

### Outcomes (verified by fixtures + replay, not forced)

| Movement / family | Before (≥60% gate) | Now (minimum-axis contract) |
|---|---|---|
| hammer_curl (frontal) | withheld (.55) | **withheld** — clause (i), the `control` suspension |
| front_raise (frontal) | withheld (.45) | **total RETURNS** — stability + trunk numeric (renormalized ÷.45 per step 3), depth as per-side bands alongside; its only unassessable axis is by design (`view`). Per-rep `· 本次 X 分` prints return with it. Sets recorded during the suspension window present their totals again at render: their stored maps are unchanged and their numbers were never recomputed — the withholding was a presentation gate, and the gate is what changed |
| Single-side family (romanian_deadlift, glute_bridge, barbell_deadlift, lying_leg_raise) | presented (.80) | **presented** — unchanged |
| seated_curl, triceps_kickback | presented (1.00) | **withheld** — newly suspended in workstream B, clause (i). Live and resumed sets; sets recorded before this round carry stored all-numeric maps and keep their presentation (historical sets are not recomputed) |
| Degraded framing, 0 scored reps | no total existed | withheld — unchanged |
| Everything else | presented | presented — unchanged |

Every newly withheld total, by movement: **seated_curl**,
**triceps_kickback** (hammer_curl's withholding predates this round).

## Workstream B — control-construct scope review

### The construction under review

The suspended term (extended tracker, `measure()` → the stability
breakdown's control component) is:

```
controlPenalty = max(0, max(angle(elbow, shoulder, hip)) − 15°) × 1.5
```

- **Intended stationary posture**: the upper arm hangs pinned to the
  torso while the elbow flexes (a curl-type movement); the term grades
  how far the upper arm's excursion from the torso line exceeds a
  fixed 15° tolerance.
- **Reference construction**: *not* the calibration baseline — the
  reference is the **concurrent shoulder→hip torso line** on the same
  frame; the calibration baseline feeds the trunk axis (tilt shift)
  and form gates elsewhere. (This corrects the looser "latched
  baseline" phrasing the review was commissioned under; the mechanism
  facts below are stated as the code actually reads.)
- **Coordinate system**: `angle()` runs on world landmarks whenever
  `validWorld` (finite, torso span 0.04–1.5), else on the
  aspect-corrected 2D points. The channel is therefore the
  elbow-dependent world channel regardless of the prescribed view —
  a diagonal prescription does not change which channel grades.
- **Visibility handling**: the frame's confidence (min visibility
  over required joints) gates whether a frame *scores* (≥0.7);
  visibility does not calibrate the angle's accuracy (Codex round-3:
  a visible elbow can still carry erroneous inferred depth).
- **User-facing corrections it generated**: the stability axis number,
  the per-rep and live `unstable_movement` issue, and (hammer) the
  live upper-arm hint — the outputs workstream C now suppresses.

**SAME unresolved assumption** = the term grades an upper-arm
deviation on this construction, with no profile-specific validation.
**DISTINGUISHED** = a mechanism fact breaks the failure chain
(different joint/construct, a defined hold with an absolute target, a
gate-bounded input band, a different channel, or no such term).

### Per-profile verdicts

Extended tracker (generic path unless a dedicated updater is named):

| Profile | Control-type term | Verdict — deciding mechanism fact |
|---|---|---|
| `hammer_curl` | excursion formula above → stability + live hint | **SAME — suspended (round 3/4, already)**. The indicted construction itself |
| `seated_curl` | **identical formula** → stability | **SAME — SUSPEND (this round)**. Identical formula, identical channel selection, identical tolerance, no validation. The seated/diagonal prescription changes the pose, not the channel: world landmarks grade whenever valid, from any view |
| `triceps_kickback` | **identical formula** → stability | **SAME — SUSPEND (this round)**. This *reverses* the suspension round's provisional exclusion. Its distinguishing claim was that the upper-arm pin is gate-verified (start ≤55°, peak ≤45°) — but the control term samples the **whole excursion** (per-frame, max/sustained over all moving frames) while the gates bound only the start/peak instants; mid-excursion frames are ungated, so the failure chain is not broken. Identical formula/channel/tolerance, no validation |
| `seated_lateral_raise` | `max(0, 165° − min(elbow))` | **DISTINGUISHED — keep.** Elbow-*extension* shortfall: a different construct (the movement's own primary joint, not upper-arm deviation). Its whole input band is bounded by counting gates requiring elbows ≥140° at start **and** peak |
| `reverse_fly` | `max(0, 165° − min(elbow))` | **DISTINGUISHED — keep.** Same elbow-extension construct, gate-bounded (≥140° at start and peak); world landmarks are required outright |
| `front_raise` | per-side `max(0, 170° − elbow) × 1.5` in the dedicated updater (measure()'s aggregate value is unused there) | **DISTINGUISHED — keep.** Elbow-extension shortfall per side; the peak-evidence rule already requires elbow ≥140° for a rep to qualify. Stability stays numeric |
| `lying_triceps_extension` | `max(|upperArm − 90°|)` | **DISTINGUISHED — keep.** Deviation from a **defined hold position** (upper arm perpendicular to the torso, an absolute prescribed target), supine in-plane geometry; form gates reject upper-arm angles outside 60–120° outright, bounding the term's band |
| `seated_triceps_extension` | `max(0, 170° − min(upperArm))` | **DISTINGUISHED — keep.** Defined-hold shortfall (upper arms stay overhead); a form rejection at `min(upper) < 140°` bounds the term's entire input band to [140°, 180°], so the penalty cannot exceed 30 |
| `bench_press`, `incline_bench_press` | none (`controlPenalty ≡ 0`; stability is speed/duration only) | **Construction absent — keep** |
| `barbell_deadlift` (+ `dumbbell_deadlift` alias) | none | **Absent — keep** |
| `romanian_deadlift` (+ `barbell_good_morning`) | none | **Absent — keep** (symmetry already unassessable, single-side) |
| `glute_bridge` | none | **Absent — keep** |
| `lying_leg_raise` | none | **Absent — keep** |
| `upright_row` | none | **Absent — keep** |
| `bench_dip` | none | **Absent — keep** |
| `one_arm_row` | stability control ≡ 0; fourth axis = support-elbow drift `cap(100 − |peakOther − otherBase| × 1.5)` | **DISTINGUISHED — keep.** A different joint (the support arm's *elbow flexion*, not an upper-arm angle) and a different reference discipline: `otherBase` is the support arm's own resting angle, **refreshed on every idle frame** (the calibrated rest pose is only a fallback), and the judged arm is stationary and weight-bearing throughout the judged window by construction |
| `mountain_climber` | stability control ≡ 0; fourth axis = partner-leg hip extension at the peak | **DISTINGUISHED — keep.** No arm construct at all (hip channel, plank view) |
| `split_squat` | stability control ≡ 0; fourth axis = rear-ankle drift / torso × 200 | **DISTINGUISHED — keep.** A **positional drift** on the 2D image-plane points — no angle, no elbow, no world channel |
| `standing_leg_curl` | stability control ≡ 0; fourth axis = support-leg discipline (`max(0, 165° − supportKnee) × 3` + support-ankle drift/torso × 120) | **DISTINGUISHED — keep.** Support-leg stillness on the knee channel + 2D ankle drift against the calibration baseline, side view — not an upper-arm judgment |

Other trackers (reviewed in full):

| Tracker / profiles | Finding |
|---|---|
| `PlanExerciseTracker` — `biceps_curl` (+ `barbell_curl`, `reverse_barbell_curl`), `lateral_raise`, `shoulder_press` (+ `neutral_seated_press`, `dumbbell_standing_press`, `barbell_military_press`), `bent_over_row` (+ `barbell_row`), `reverse_lunge`, `calf_raise` (+ `dumbbell_calf_raise`), `seated_calf_raise` | **Construction absent.** This tracker has no control term at all: its stability is `100 − speed penalty (max angular velocity of the primary angle) − duration penalty`. A different construct by design — keep. (Its frontal arm profiles' numeric *symmetry* remains step 3's Deviation 1 — a peak-plumbing question, not this construct; untouched here) |
| Core `ExerciseTracker` — squat family (+ `goblet_squat`, `barbell_back_squat`, `barbell_front_squat` routings), push-up, sit-up, lunge | **Construction absent.** Stability constructs are positional (ankle-height difference, support-point offsets, elbow–wrist alignment ratios) on 2D points. Keep |

Newly suspended in this round: **`seated_curl`,
`triceps_kickback`** — stability unassessable (`control`) via
`CONTROL_SUSPENDED_TYPES` in `assessmentsFor()`, flowing through
workstream A's contract (their totals withhold) and workstream C.
The server reason whitelist already contains `control` on both sync
paths (suspension round), so no server change was needed; the
130-test server suite pins the round-trip unchanged.

## Workstream C — suspended constructs stop correcting

Rule: for every (movement in `CONTROL_SUSPENDED_TYPES`, suspended
axis), the corrective outputs derived from the suspended term are
suppressed. The per-rep issue uses a **counterfactual attribution**:
`unstable_movement` stands only when the speed/duration evidence
produces the shortfall on its own (`stabilityWithoutControl(speed,
duration) < 70` while the full breakdown is also < 70) — a shortfall
the suspended term manufactured is not corrected; a shortfall the
never-suspended evidence earns still is.

Suppressed, by site:

1. `updateHammerCurl` — the **live upper-arm hint**
   (measure()'s `上臂贴紧一点点，你会更省力`, gated by the sustained-
   deviation hysteresis) never surfaces for hammer_curl. The
   hysteresis machinery (`upperArmHintVisible`) remains in the code,
   uncalled, for the record.
2. `updateHammerCurl` — the **live poseFeedback issue** from
   `controlPenalty > 30` no longer raises `unstable_movement`
   (the posture-derived `body_alignment` branch stands).
3. Generic-path live issue — the `controlPenalty > 30` branch is
   suppressed for the suspended types only; non-suspended types keep
   it exactly (pinned by the seated-lateral-raise fixture: its
   extension-term penalty ≈58 still raises the live correction).
4. `emitHammerRep` — the per-rep `unstable_movement` issue is
   counterfactual-gated (above).
5. Generic-path emit — the per-rep `unstable_movement` issue is
   counterfactual-gated for the suspended types; unchanged otherwise.
6. Generic-path emit — the **per-rep aggregate print** now follows the
   set total (withheld for seated_curl / triceps_kickback), as the
   hammer and front-raise emitters already did.

Deliberately **not** suppressed:

- **measure() form-rejection strings** — they are counting gates, not
  score-derived corrections; changing them would change which frames
  measure. This includes seated_curl's `>45°` rejection
  (`上臂贴紧一点点，别让肩膀跟着抬`) — pinned by a fixture proving the
  gate still operates. (Same copy family as the hint, different
  mechanism class: the hint was advisory output of the suspended
  *scoring* term; the rejection is part of the measurement contract.)
- front_raise's `unstable_movement` (elbow-extension construct, kept;
  replay unchanged: FR-A ×3, FR-C ×4), the plan tracker's
  `unstable_movement` (speed/duration construct), and every
  depth/trunk/symmetry-derived issue everywhere.
- Counting and XP — untouched, as before (XP is rep-derived; the
  suspension round's audit stands).

**Replay quantification (HC-A, the founder's main hammer clip):**
`unstable_movement` corrections fall **16 → 1**. Fifteen of the
sixteen corrections the old pipeline issued on that set were
manufactured by the suspended control term — their reps' speed/
duration evidence was clean — and are now suppressed; one rep's
shortfall was earned by the speed/duration evidence alone and still
corrects. HC-B: 1 → 0. This is the false-corrective-feedback pattern
the consultation was convened over, measured on the exact clip that
motivated it.

## Consumer audit (round 5)

| Consumer | Handling |
|---|---|
| Live trackers (extended) | Suspended types emit stability `unassessable/control` from the first scored rep; per-rep aggregate prints follow `totalWithheld` at every emit site (hammer, front raise, generic path) |
| Summary | No code change: `totalWithheld` semantics flow through — front-raise totals render again with the step-3 renormalization note (`总分只按能评的项目算…`); seated_curl / triceps_kickback totals render `—` with `TOTAL_WITHHELD_NOTE` (copy unchanged — it makes no percentage claim) |
| Plan rest reveal (PlanWorkout) | Same note swap via the same helper; no code change |
| Share cards (set + workout) | No code change: front-raise sets re-enter presented totals and the workout-card average; newly suspended sets take the withheld body (`总分先暂停`) and stay out of the average |
| Client restore (`restoredSetMetrics`) | Stored maps win as before. `assessmentFromScore` is unchanged: it derives states only from recorded evidence (hammer offsets, front-raise band tallies); seated_curl / triceps_kickback accumulators carry no such marker, so **no derivation is invented for them** — their pre-round sets keep their stored presentation, and sets recorded from this round carry the suspended map in the payload |
| Server standalone + plan validators | No change needed: reason `control` was whitelisted on both paths in the suspension round; strictness fixtures still pass (130/130) |
| Adaptive wrapper / voice context / missions / avatar | Unchanged (internal signals; the suspension round's audit stands). `buildSetReveal` already compares only axes numeric in both sets, so the newly suspended stability drops out of set comparisons and goal picks exactly as hammer's did |

## Replay verification (Phase-0 suite, L2 protocol, Full landmarks)

Same harness/driver as step 3 and the suspension round
(`step3-replay/step3-driver.ts`), baseline = suspension-round outputs
vs this change; full JSON in
`~/workspace/movemate-research/accuracy-phase0/step3-replay/replay-round5-*.json`.

**Counting is identical on every clip — same reps at the same
timestamps, same per-rep internal scores (`repEvents` byte-identical),
same internal formScore, breakdown and perfectReps.** Only
presentation and correction counts moved:

| Clip | Reps | Internal total | Presentation / corrections before → after |
|---|---|---|---|
| HC-A hammer | 16 → 16 | 70 → 70 | map unchanged (stability `control`, symmetry 明显交替）; total withheld → withheld; `unstable_movement` corrections **16 → 1** (workstream C) |
| HC-B hammer (held out) | 1 → 1 | 80 → 80 | map unchanged; total withheld → withheld; corrections **1 → 0** |
| FR-A front raise | 3 → 3 | 60 → 60 | map unchanged (bands + `view`); total withheld → **presented** (workstream A); corrections unchanged (3 / 2) |
| FR-C front raise | 6 → 6 | 68 → 68 | map unchanged; total withheld → **presented**; corrections unchanged (4 / 0) |

## Fixtures changed, and why

No counting assertion was weakened anywhere: every revised fixture
keeps its rep-count assertions byte-identical.

`client/tests/axis-validity.test.ts`:

1. **Replaced** — "coverage rule: totals present only at ≥60% numeric
   weight" → "minimum-axis contract: validity reasons and unassessed
   applicable axes withhold; by-design axes never do". Reason: the
   contract itself was replaced per Codex round-4. The old assertions
   (front raise withheld at .45; presented at exactly .60) are
   superseded by: front raise presented at .45 (coverage now
   diagnostic), `control` withheld at .75 coverage, `framing` blocks,
   `no-bilateral-evidence` blocks (clause ii), by-design reasons never
   block.
2. **Revised** — "front raise: the set total is withheld by coverage
   (.45)…" → "…the set total returns under the minimum-axis contract…":
   `totalWithheld` true → false; per-rep feedback
   `好，第 1 次记下啦` → `· 本次 N 分` print restored (regex-pinned).
   Same reason as (1).
3. **Comment only** — the hammer tracker test's ".55 coverage"
   wording now records coverage as a diagnostic; assertions identical.
4. **Extended** — the hammer drift test gains workstream-C assertions
   (no hint text on any frame, no live issue, zero
   `unstable_movement` corrections, empty `lastRepIssues`) on the same
   trajectory whose internal stability (≈60) stays pinned.
5. **New** — seated-curl suspension + suppression (slow drift:
   control-manufactured shortfall → no correction, no live issue, no
   per-rep print, total withheld, internal ≈62 stands); seated-curl
   counterfactual contrast (fast reps: speed/duration alone crosses
   the line → correction stands, ×2); seated-curl gate preservation
   (the >45° form rejection still fires); triceps-kickback suspension;
   seated-lateral-raise contrast (non-suspended extension term still
   raises its live correction).

`client/tests/extended-recognition.test.ts`:

6. **Revised** — "hammer curl stability charges sustained upper-arm
   drift but not a 100 ms spike": the drift rep's
   `unstable_movement` assertion flips to *not includes* (workstream
   C — the shortfall is entirely control-manufactured on that
   trajectory). Internal stability assertions (≈60 sustained, ≥80
   spiked) and rep counts unchanged. This supersedes the suspension
   round's Deviation 3 pin, which had deliberately kept the issue
   "as before" pending this round.
7. **Revised/renamed** — "hammer curl upper-arm hint needs a sustained
   deviation and never blocks the rep" → "hammer curl upper-arm hint
   is suspended with its construct; the rep still counts": the
   sustained-drift `assert.match(上臂贴紧一点点)` flips to
   `doesNotMatch` on both surfaces; brief-drift silence and the
   rep-count assertion unchanged.

Net: client 490 → **495** (+5 new fixtures, 2 tests replaced/revised
in place, 2 revised in the extended suite).

## Verification

- Client `test:repository`: **495/495** (490 baseline + 5 net new).
  Client tsc clean.
- Server: **130/130** + build clean (no server change was needed).
- Cloudflare: **34/34** + typecheck clean.
- Replay: counting identical on all 4 replayable clips (above).

## Deviations and interpretations

1. **Clause (ii) has a real consequence beyond the named cases**: a
   bilateral set whose symmetry produced no bilateral evidence now
   withholds its total even at full numeric coverage elsewhere. That
   is the contract as specified ("every by-design-applicable axis …
   assessed in some form"), applied uniformly rather than carved out;
   for hammer sets it is moot (clause (i) already withholds).
2. **The kickback verdict reverses the suspension round's provisional
   exclusion** — on the mechanism grounds Codex demanded (gates bound
   instants, the term samples the excursion). Recorded here and in
   the table, not silently flipped.
3. **`assessmentFromScore` was not extended** to the newly suspended
   types: their accumulators carry no evidence marker from which a
   derivation could honestly be made (see the consumer audit).
4. **The withheld-total note copy is unchanged.** Under the contract
   it remains accurate (a required axis cannot currently be judged);
   it never cited the percentage.
5. **Restoring any suspended feedback** still waits for the
   axis-validity checkpoint measurement (paired Full/Heavy trace,
   blinded second annotation) — now scoped to three profiles
   (hammer_curl, seated_curl, triceps_kickback) instead of one.
   Heavy recalibration remains paused, per Codex round-4.

## Deploy record

- Merged to main as `dcf5443` (feature `3a02f0b` on
  `round5/minimum-axis-contract`); CI run 42504199887 **success**.
- Production (dongban.xyz): Version
  `29f2260f-2e24-4691-b317-547cecf02263`.
- Preview (preview.dongban.xyz): Version
  `8fa94279-8950-4c54-b431-b404db6b0b14`.
- Deployed with `npx wrangler@4.158.0 deploy` directly (production,
  then `--env preview`) from a main worktree; server `npm ci`
  succeeded in both worktrees — the bcrypt node_modules-copy fallback
  was not needed this round.
- Live verification: both hosts serve byte-identical copies of the
  built chunks carrying this round's code (sha256-verified) — the
  tracker chunk contains
  `new Set(["hammer_curl","seated_curl","triceps_kickback"])`
  (CONTROL_SUSPENDED_TYPES) followed by the `stabilityWithoutControl`
  helper, and the axisAssessment chunk contains the contract
  (`["view","single-side"]` as the only non-blocking reasons; no
  coverage constant remains).
- 动伴进度 space: checked — no displayed fact changed this round
  (library 769, camera-linked 56, videos 18 untouched; the space
  displays no score-presentation facts), so no sync was needed.
