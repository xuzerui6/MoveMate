# Axis-validity suspension + minimum-coverage totals — 2026-11-09

Implements the Muse×Codex converged decision that followed the Codex
round-3 consultation on the stability axis
(`~/workspace/movemate-research/codex-consult-stability-out.txt`), on top
of the step-3 scoring contract
(`docs/scoring-contract-step3-2026-11-08.md`).

**The problem.** Step 3's renormalization concentrated the hammer-curl
total onto the stability axis (effective weight 0.25 → ≈0.3125), and
that axis is dominated by a control term read off the elbow-dependent
upper-arm angle (`angle(elbow, shoulder, hip)` on world landmarks) — the
same channel the Phase-0 evidence showed carrying per-rep sign-flipping
noise of 15–35°. On the founder's main hammer clip (HC-A) the pipeline
reads stability 15 where annotator 1 judged upper-arm control
"adequate"; under renormalization that channel alone cost the set
≈26 points of total. Codex's verdict: the evidence establishes a serious
validity concern, not proof the signal is mostly noise — but printing
the number while that concern stands is not defensible, reweighting it
would be arbitrary, and categorizing it would launder the same evidence
into coarser wrong corrections.

**What changed is presentation, never counting or computation.** Every
tracker gate, threshold, cycle rule and internal score computation is
byte-identical (replay-verified below, and pinned by fixtures asserting
the pre-suspension internal values). Two things stop being printed:

1. For the hammer family (scope below), the stability axis is
   **unassessable** — new reason `control` — as a whole: the
   speed/duration remainder is *not* rebranded as "stability".
2. A **minimum-coverage rule** now governs every set total: a total is
   presented only when the numeric axes cover ≥60% of the nominal axis
   weight (depth .35 / stability .25 / trunk .20 / symmetry .20;
   categorical, bands and unassessable axes contribute 0). Below 60%
   the total is withheld on every surface, with a companion-tone note
   (`TOTAL_WITHHELD_NOTE`), and the assessable axes present alone.

## Scope of the suspension (precise)

The suspension keys on the tracker type, in
`ExtendedExerciseTracker.assessmentsFor()`: **`hammer_curl`** — every
catalog profile routed to that tracker inherits it. This is exactly
step 3's cell 1, and it is the only movement with Phase-0 label evidence
on this construct (HC-A/HC-B).

Candidates examined and **excluded**, with reasons:

| Candidate | Same formula? | Why excluded |
|---|---|---|
| `seated_curl` (extended, generic path) | Yes — identical `max(0, max(upperArm) − 15) × 1.5` | Seated, prescribed **diagonal** view （斜侧面）, not frontal; no label evidence on this construct for it. Flagged for the axis-validity checkpoint (below), not silently extended. |
| `triceps_kickback` (extended, generic path) | Yes — identical formula | Bent-over diagonal view; the upper-arm position is itself a hard counting gate (upper ≤55°/≤45°), so the control term duplicates a gate rather than grading an unobservable. Different construct. |
| Plan-tracker frontal arm profiles (`biceps_curl`, `lateral_raise`, `shoulder_press`, `bent_over_row`) | No — different tracker, no elbow-dependent upper-arm control term of this form | Step 3 deviation 1 already scopes cell 1 to the extended hammer path; no evidence was gathered on the plan tracker's stability construct. |
| `front_raise`, `seated_lateral_raise`, `reverse_fly` | No — control = elbow *extension* shortfall (`170 − min(elbows)`) | A different channel and construct; front raise's stability stays numeric (its total is withheld by the coverage rule instead — see below). |
| `lying_triceps_extension`, `seated_triceps_extension` | No — deviation from a defined hold position / extension shortfall | Different constructs, supine/overhead views. |

A restored **pre-contract** hammer set (its accumulator recorded
per-rep `symmetryValues` and no `symmetryOffsetsMs` — the marker the
step-3 code already uses) keeps its historical stability number:
historical sets are not recomputed, the standing rule.

## The coverage rule's effect, per movement

| Movement / family | Numeric axes after this change | Coverage | Total |
|---|---|---|---|
| hammer_curl (frontal bilateral arm) | depth, trunk (+ symmetry category) | **.55** | **withheld** (was presented, renormalized ÷.80) |
| front_raise (frontal) | stability, trunk (+ depth bands, symmetry unassessable) | **.45** | **withheld** (was presented, renormalized ÷.45). Its stability axis is *not* suspended — the total falls to the general rule. |
| Single-side family (romanian_deadlift, glute_bridge, barbell_deadlift, lying_leg_raise) | depth, stability, trunk | .80 | presented (unchanged) |
| Everything else (all-numeric maps, incl. core-4, plan profiles, support-discipline fourth axes) | all four | 1.00 | presented (unchanged) |
| Degraded framing, 0 scored reps | none | 0 | no total existed (formScore 0, unscored presentation) — unchanged |

Boundary: exactly .60 (e.g. depth + stability numeric) still presents —
pinned by a fixture on the pure helper.

## XP audit (decision point 3)

**XP never derives from a set total, on either path.** Server
`calculateXp` (`motion.service.ts`): camera sessions earn `reps × 2`;
timer/other sports earn by duration; demo earns 0. Plan workouts settle
through their linked sport sessions with the same function; the gym
transfer/import paths write `xp: 0`. Withholding a total therefore
cannot change XP, and no code was needed to "preserve" it — a new
server fixture pins it anyway (a hammer session carrying the suspended
assessment settles at `xpEarned = 4` for 2 reps).

The internal `formScore` computation is deliberately **unchanged
everywhere** (per-rep aggregates, accumulator sums, `updateAverage`),
because three progression loops read it as an internal signal, not as a
presented total: `perfectReps` (per-rep internal score ≥ 90), the daily
mission's `hasHighScoreWorkout` (formScore ≥ 90), and the Avatar 技巧
attribute (mean formScore over settled sessions — a gamified aggregate,
not a set total). Keeping the internal computation byte-identical keeps
every one of those loops exactly as it behaved before the suspension.
The voice coach's `recentScore` context is the same class: an internal
context value, not a rendered total; unchanged.

## Consumer audit

| Consumer | Handling |
|---|---|
| Live trackers (extended) | Hammer map carries stability `unassessable/control` from the first scored rep; per-rep feedback withholds its aggregate print while the set total is withheld (hammer + front raise: `好，第 N 次记下啦`, no `· 本次 X 分`) — see Deviations |
| Summary | Stats row prints `—` for a withheld total; the note under the axes becomes `TOTAL_WITHHELD_NOTE` when withheld, the step-3 renormalization note otherwise; axis rows render `暂时评不了` for the suspended axis; `buildSetReveal` already compares only axes numeric in both sets, so stability drops out of comparisons and goal picks |
| Plan rest reveal (PlanWorkout) | Same note swap when the last set's total is withheld; axis rows already state-render |
| Share cards (set card) | New `totalWithheld` body in `setCardSvg`: hero slot prints `总分先暂停` + an explanatory line, over the same chips and axis rows (axes extracted to a shared renderer). `score` is null, `personalBest` is suppressed (the comparison would publish the number). The unscored body is *not* reused — its copy blames framing, which is false here |
| Share cards (workout completion card) | Withheld sets are excluded from `avgScore` (an average over withheld totals would re-publish them); if no presentable set remains, `avgScore` is null (existing degradation) |
| Client restore (`restoredSetMetrics`) | The map travels as before; `assessmentFromScore`'s offsets branch (hammer-only evidence) now also derives the stability suspension — see Deviations. `formScore` restoration unchanged (internal) |
| Server standalone (`cleanMetrics` / `cleanAxisAssessment`) | Reason whitelist gains `control` (both the top-level map and the accumulator-carried map) |
| Server plan (gym zod `axisStateSchema`) | Reason enum gains `control` |
| Avatar stats / voice context / daily missions | Audited, deliberately unchanged (XP audit above) |

Server validation stays strict in both directions: the new reason
round-trips verbatim on both paths, and a non-whitelisted reason is
still rejected (new fixture).

## Replay verification (Phase-0 suite, L2 protocol, Full landmarks)

Same harness and driver as step 3 (`step3-replay/step3-driver.ts`),
baseline = step-3 outputs vs this change; full JSON in
`~/workspace/movemate-research/accuracy-phase0/step3-replay/replay-suspension-*.json`.

**Counting is identical on every clip — same reps at the same
timestamps, same per-rep internal scores, same internal formScore,
breakdown, correction counts and perfectReps.** Only presentation moved:

| Clip | Reps | Internal total | Presentation before → after |
|---|---|---|---|
| HC-A hammer | 16 → 16 | 70 → 70 | stability 15 printed → **unassessable (control)**; total 70 presented → **withheld** (.55). Symmetry category 明显交替 unchanged (the step-3 offline-fragmentation artifact, already flagged) |
| HC-B hammer (held out) | 1 → 1 | 80 → 80 | stability 45 printed → **unassessable (control)**; total 80 → **withheld** |
| FR-A front raise | 3 → 3 | 60 → 60 | map unchanged (bands + view); total 60 → **withheld** (.45) |
| FR-C front raise | 6 → 6 | 68 → 68 | map unchanged; total 68 → **withheld** (.45) |

## Deviations and interpretations

1. **Per-rep feedback aggregates are withheld too** (hammer + front
   raise). The decision text governs set totals; a per-rep `本次 X 分`
   is the same aggregate one level down and, for hammer, is computed
   *from* the suspended control term — printing it while suspending the
   axis would be the curtain Codex rejected. Unscored-rep copy is
   unchanged; no other movement's per-rep print changes (coverage ≥.80).
2. **`assessmentFromScore`'s offsets fallback also derives the
   suspension.** Recorded peak-timing offsets exist only for hammer
   sets, and those sets' stability came from the suspended channel;
   this is the same evidence-based derivation step 3 established for
   the symmetry category, extended to the newly suspended axis. It
   affects only sets with offsets but *no stored map* (recorded between
   the step-3 ship and this one). Stored maps still win outright, and
   pre-contract sets (no offsets) get no invented map.
3. **Rep-level issue derivation is deliberately unchanged.** The
   `unstable_movement` correction count and the live sustained-deviation
   upper-arm hint still derive from the internal control evidence, as
   they did under step 3 for every other axis presentation change; an
   existing fixture pins the internal stability behavior *including*
   the issue flag ("as before"). Whether the live cue should also be
   suspended is a feedback-validity question for the checkpoint below,
   not an axis-presentation question — flagged, not silently decided.
4. **The workout completion card's `avgScore` exclusion** (consumer
   table) follows from the same no-republication principle as the
   `personalBest` suppression.

## Flagged follow-up: the axis-validity checkpoint

Per the consultation, restoring any numeric or categorical control
feedback waits for the paired-channel measurement (Full vs Heavy on
frozen rep boundaries, blinded second annotation of penalty-driving
intervals, baseline-offset vs jitter vs genuine-drift separation) —
which will also decide the `seated_curl` question above and the live
cue in Deviation 3. The preregistered ≥30% angle-error gate for model
adoption remains **unmeasured**; nothing in this round changes it.

## Verification

- Client `test:repository`: **490/490** (482 baseline + 8 new fixtures
  in `client/tests/axis-validity.test.ts`; 1 existing fixture extended
  in `scoring-contract.test.ts` — the offsets-restore case gains the
  stability-suspension assertion; no existing assertion was weakened).
  Client tsc clean.
- Server: **130/130** (129 + 1 new: control-reason round-trips on both
  sync paths, malformed-reason rejection, XP pin) + build clean.
- Cloudflare: **34/34** + typecheck clean.
- Replay: counting identical on all 4 replayable clips (above).

Deploy: _pending — filled in after the dual-station deploy below._
