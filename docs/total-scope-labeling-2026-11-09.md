# Total scope labeling — 2026-11-09

Round 6 of the Muse×Codex accuracy program: a presentation-correctness
correction from Codex's round-5 review. Authority: step 3
(`docs/scoring-contract-step3-2026-11-08.md`), the axis-validity
suspension (`docs/axis-validity-suspension-2026-11-09.md`) and the
minimum-axis contract (`docs/minimum-axis-contract-2026-11-09.md`).

**The defect.** A front-raise set's total is computed over stability +
trunk only: depth is assessed as per-side bands and symmetry is
unassessable by design for the frontal view (`view`). Since round 5
that total is presented again — but nothing next to it said what it
covers. A bare number beside a banded axis row invites the reader to
assume the total summarizes all four axes, and step 3's generic note
(「总分只按能评的项目算——评不了的不会算成低分」) neither names the axes
in scope nor describes the banded axis correctly (depth is not
"评不了" — it is assessed, in another form). Codex's requirement:
wherever such a total is shown, its scope is labeled, the depth bands
stay visible alongside, and bands must never enter a numerical total
through an invented mapping.

**This round is presentation-only.** Counting, internal score
computation and every printed total are numerically identical to
current production — replay-verified below, and the no-mapping
property is pinned by fixture.

## The helper

`totalScopeNote(assessment, labels)` in `axisAssessment.ts` derives the
label from the assessment map — never hardcoded per movement:

- Returns a note iff the total is **presented** (not withheld) and at
  least one **applicable** axis is assessed in a non-numeric form
  (`category` or `bands`).
- The note names the numeric axes the total is computed over, in the
  calling surface's own display names, and states the other-form axes
  stay in their form: 「总分只按 手臂控制、躯干稳定 算；前举幅度看档位，
  不算进总分」 (front raise, profile axis names) /
  「总分只按 稳定性、躯干 算；幅度看档位，不算进总分」 (card labels).
- Returns null — presentation unchanged — when there is no assessment
  map (legacy sets), when the total is withheld
  (`TOTAL_WITHHELD_NOTE` owns that state), and when the total covers
  every applicable axis. By-design-unassessable axes (`view`,
  `single-side`) are non-applicable: the single-side family's totals
  cover all their applicable axes and keep the previous presentation,
  generic note included.

## Per-surface audit and outcome

| Surface | Before | After |
|---|---|---|
| **Motion Summary** (stats + reveal note) | Axis rows render bands/state text ✓; the only note was the generic subset note — names no axes, mis-describes banded depth | Scope note (exercise's own axis names) replaces the generic note whenever it applies; withheld → withheld note; by-design-only subsets (single-side family) keep the generic note verbatim |
| **PlanWorkout rest reveal** | Same generic note; axis rows render bands ✓ | Same swap, with the plan profile's axis names (`restScopeNote` derived from `lastAssessment`) |
| **Share set cards** (gym + motion) | Score printed with bands visible in the axis rows, but **no scope statement at all** | `SetCardData.scoreNote` (card axis labels) rendered in the scored body between the chips and the axis rows. No-note cards are byte-identical to before; with a note, the axis block reclaims the height from its top gap and two-line name bands tighten the axis row step (92 → 84) so the last row stays clear of the footer rule (verified: last text row y=1070 / 1130 vs footer rule 1180) |
| **Workout completion card （卡 A, `buildWorkoutCardData`)** | `avgScore` = mean of presented set totals over scored, non-withheld sets, labeled 平均分 | **Unchanged, by decision.** This is a cross-set aggregate, not a front-raise total: no single movement's scope can be named on it, and its inputs are already restricted to presented totals. Per-set scope is labeled on every per-set surface (above). Recorded here so the decision is auditable, not silent |
| **Restored sets — 逐组记录 (`WorkoutRecords`)** | **Missed consumer of step 3**: printed raw accumulator means per axis — fabricated `0`s for front-raise depth/symmetry and for hammer's categorical symmetry — plus the bare set total with no scope, and withheld totals printed as numbers | Axis line renders per the assessment map (state text for non-numeric axes; numbers only for numeric axes — for hammer, symmetry now shows its category and stability 暂时评不了， exactly as the live surfaces do); a withheld set's line reads 识别总分先暂停 instead of the number; a subset-scoped presented total gains the scope note line (profile axis names) |
| **Restored sets — Summary / PlanWorkout restore paths** | Maps already ride along (`restoredSetMetrics`, `assessmentFromScore`) | Covered by the Summary / reveal changes above — the same derived map drives the new label |

Aggregates audited and deliberately left: the Avatar page's history
average and progression stats read the internal `formScore` by design
(they are not per-set presentations; step 3's contract governs what is
printed as a set's score).

**Flagged, not fixed (outside this round's mandate).** The PlanWorkout
completion screen's inline 训练识别均分 (PlanWorkout.tsx, the
`row.sets.some(...)` line) averages **all** camera sets' internal
totals — including sets whose totals are withheld everywhere else.
Round 5 excluded withheld sets from the workout **card's** average but
this inline average was not updated, so the two disagree. Correcting
it changes a headline number rather than a label, so it is flagged
here for a follow-up decision instead of being folded into a
presentation-only round.

## No invented mapping — verification

- By construction: totals everywhere are computed from the recorded
  per-rep totals (`acc.total`, `score.total`), which the trackers build
  from numeric axes only (step 3). No presentation path reads a band or
  a category as a number: `axesFrom` renders non-numeric axes as text
  with `value: 0` used solely as "no bar fill", and the records page
  now does the same via the assessment map.
- By fixture: a stored front-raise accumulator with **poisoned**
  depth/symmetry sums (9999 / 8888) still yields card score 85
  (= total/count) and restored formScore 85, with the depth axis
  presented as bands — there is no mapping for a stray sum to feed.
  The step-3 tracker fixture (front-raise totals renormalize over
  stability + trunk only) continues to pin the computation itself.

## Fixtures

`client/tests/scoring-contract.test.ts` (+2):

1. **New** — scope label derivation: front-raise map in profile names
   and in card names (exact strings); a categorical applicable axis
   named the same way （看类别）; null for withheld (hammer), for
   by-design-only subsets (single-side), for all-numeric maps, and for
   absent maps.
2. **New** — the poisoned-accumulator pin above (card + restore paths).

`client/tests/share-cards.test.ts` (+1):

3. **New** — the set-card SVG prints the scope note beside a
   subset-scoped total (bands visible alongside), and a full-coverage
   total's card carries no note in data or SVG.

No existing fixture was modified; no counting assertion changed.

## Verification

- Client `test:repository`: **498/498** (495 baseline + 3 new).
  Client tsc clean.
- Server: **130/130** + build clean (no server change).
- Cloudflare: **34/34** + typecheck clean (no cloudflare change).
- **Replay (Phase-0 suite, L2 protocol, Full landmarks; same
  step3-driver as rounds 3–5): all four clips byte-identical to the
  round-5 outputs** (`replay-round6-*.json` beside
  `replay-round5-*.json` in
  `~/workspace/movemate-research/accuracy-phase0/step3-replay/`) —
  same reps at the same timestamps, same per-rep events, same internal
  totals (FR-A 60, FR-C 68, HC-A 70, HC-B 80), same correction counts,
  same assessment maps. Any numeric change would have failed this
  round; there is none.

## Deviations and interpretations

1. **The records page （逐组记录） fixes go one step beyond labeling**:
   its fabricated axis 0s and printed withheld totals were step-3
   contract violations on a surface three audits missed; they are
   corrected here with the same helpers rather than left for a fourth
   audit to find. Internal values are untouched; only what the page
   prints changed.
2. **Aggregates keep their presentation** (workout card average;
   completion-screen average flagged above). Per-set scope labeling is
   exhaustive; cross-set averages are labeled as averages over
   presented, scored sets — except the flagged inline average, whose
   withheld-set inclusion predates this round and awaits its own fix.
3. **Stale comment cleanup**: Summary.tsx and cardData.ts still
   described the replaced ≥60% coverage gate in comments next to the
   code this round touched; the comments now name the minimum-axis
   contract. No behavior change.

## Deploy record

- Merged to main as `PENDING`; CI `PENDING`.
- Production (dongban.xyz): Version `PENDING`.
- Preview (preview.dongban.xyz): Version `PENDING`.
- 动伴进度 space: checked — no displayed fact changed this round
  (library 769, camera-linked 56, videos 18 untouched; the space
  displays no score-presentation facts), so no sync was needed.
