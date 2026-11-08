# Channel suspensions — hammer/front-raise trunk, front-raise depth & stability (2026-11-09)

Implements the Full-spillover audit's suspension recommendations with Codex
round-7 concurrence (`~/workspace/movemate-research/codex-consult-spillover-out.txt`;
evidence: `~/workspace/movemate-research/accuracy-phase0/spillover-audit-report.md`).
Three axes join the assessability contract as unassessable for a new validity
reason, **`channel`** — distinct from `control`: the measurement *input* fails
to support the axis interpretation, whatever the construct. Internal score
computation, counting and XP are untouched throughout; only presentation and
corrective output move.

## Evidence summary (from the spillover audit)

- **Hammer trunk — CONTAMINATED.** Material changes on 2/14 matched adequate
  reps (Δ −15.5, −19.8, both tail reps), systematic −6.9 median with 14/14
  deltas in the same direction, set axis 86 (Full) vs 96 (Heavy); deductions
  of ~20–24 points on tail reps whose annotator-3 marks read posture_ref = 100
  at every marked instant (all 176 marked side-frames across HC-A/HC-B).
  Mechanism: Full's *image* shoulder/hip tilt wanders ±8° cycle-wide with
  spikes to 30–53° (Heavy on identical footage stays within 3.3°), amplified
  by the cycle-max `shift` statistic and the elbow-selected peak sampling
  instant. No production gate tests this channel — the wrapper intercepts
  world collapse 234/234, but trunk flows *through* the gates.
- **Front-raise depth (bands) — CONTAMINATED.** Band changes under Heavy
  substitution on 4/10 labeled efforts, including **both** valid in-band
  efforts, with independent anchors convicting Full in opposite directions
  (effort 4 right over-read to 125°/119.8° past the revocation line on a
  both-sides-qualified raise; efforts 7+8 left under-read to below-band where
  the device counted 84.3° = shoulder band). The shipped per-side band
  presentation was built substantially from fragment tallies. Front raise has
  no wrapper gates on its shipped legacy path.
- **Front-raise trunk — CONTAMINATED (moderate confidence).** Identical
  construction to hammer trunk; FR-C paired runs show the same Full-only
  late-set depression (Full set 92 vs Heavy 97; material ≥10 on at least one
  late effort, early efforts agree ≤2). One grade below hammer: no
  marks-grade posture reference for front raise — a genuine lean would
  appear in both models' identically computed tilt and appears in only one.
- **Hammer depth — values CLEAN, discrimination UNRESOLVED (no suspension).**
  0/14 material changes on adequate reps; but Full's depth is ceiling-pinned
  (100 on 16/16 scored reps; collapse-driven peak-elbow reads of 9–59° at
  13/14 peaks), so the axis cannot discriminate a shallow rep — a
  false-negative risk with zero observed instances. Handled by presentation
  qualification only (below).

## The recorded distinction (Codex round-7, verbatim in substance)

- **Trunk (both movements) and front-raise depth: demonstrated
  contamination.**
- **Front-raise stability: unresolved validity under demonstrated channel
  risk — suspended provisionally, NOT a contamination verdict.** The
  deciding principle: *credible, directly relevant evidence of input
  corruption plus unresolved effect on the claimed measurement warrants
  withholding evaluative feedback; it does not establish that the axis
  itself is wrong.* Stability consumes the implicated elbow channel and
  substitution changes its output substantially (FR-C 48 vs 62, per-rep as
  low as 20); its bounded peak construction might protect it — or introduce
  a different failure — but neither possibility has been validated, and the
  control verdict cannot simply be inherited. Withholding the total and
  per-rep prints while showing a set-level stability number would still
  present an unresolved measurement as feedback, so the number stays
  diagnostic only. An empty scoring surface is a consequence, not evidence
  for or against the suspension.

This distinction is recorded in code at `CHANNEL_SUSPENDED_AXES`
(extendedRecognition.ts) and in `UNASSESSABLE_REASONS` (axisAssessment.ts).

## Scope

The `channel` suspensions apply to these movements' assessments **regardless
of ladder rung** — no shipped rung is validated for these axes. The audit
convicted the shipping Full channel; Heavy is not shipped and is itself
unvalidated for these axes (it over-reads the raised channel and over-counts
hammer offline), so no rung's output earns presentation by substitution.

## What changed

**Contract (`client/src/features/motion/lib/axisAssessment.ts`,
`server/src/services/motion.service.ts`, `server/src/gym/service.ts`)**

- `'channel'` joins `UNASSESSABLE_REASONS` (client), the motion-service
  whitelist and the gym zod enum. It is a validity reason (not in
  `BY_DESIGN_UNASSESSABLE_REASONS`), so `totalWithheld` blocks totals for it
  exactly as for `control` — no gate change was needed.
- Display: `axisStateText` renders `channel` as 「暂时评不了」 (same as
  `control`).
- Derivation (`assessmentFromScore`): recorded peak-timing offsets (hammer
  sets) now also derive trunk `channel` alongside stability `control`;
  recorded front-raise band tallies now derive depth/stability/trunk
  `channel` + symmetry `view` instead of presented bands. A stored map
  always wins, as before.

**Tracker (`client/src/features/motion/lib/extendedRecognition.ts`)**

- `assessmentsFor`: hammer_curl trunk → `unassessable('channel')` (following
  the same pre-contract carve-out as its stability — a restored pre-contract
  hammer set keeps its historical numbers as a set); front_raise depth,
  stability, trunk → `unassessable('channel')`. Front-raise depth tallies
  keep accumulating per rep as diagnostics; no presented band is derived.
- Consequences for front raise: the set total is **withheld again** (it had
  returned in the round-5 window — this reverses that on the audit
  evidence), per-rep score prints stop via the existing withheld mechanism
  in `emitFrontRaiseRep`, the round-6 scope note cannot fire for front raise
  (`totalScopeNote` returns null on a withheld map — pinned by fixture), and
  front-raise sets drop out of the workout-card and completion-screen
  averages through the shared `totalEntersAverage` predicate (pinned by
  fixture).
- Suspended axes stop correcting, per the established suspension semantics:
  - Hammer per-rep `body_alignment` (derived from trunk) is no longer
    emitted — posture − shift *is* the convicted read, so there is no
    unsuspended remainder to run the counterfactual over.
  - Hammer's live posture issue (`f.posture < 70 → body_alignment`, same
    tilt channel) no longer surfaces; hammer curls currently raise no live
    corrective issue (the control-derived ones were removed in round 5).
  - Front-raise per-rep `body_alignment` is no longer emitted (same
    reasoning); front-raise `unstable_movement` now stands only when the
    speed/duration evidence produces the shortfall without the
    elbow-channel control term (the `stabilityWithoutControl`
    counterfactual, mirroring the hammer `control` treatment — the
    speed/duration remainder does not consume the implicated channel).
  - Front raise's live posture issue no longer surfaces. The round-4
    blocker hints (direction / peak-evidence guidance) are counting-gate
    guidance on a separate audited path and stand untouched.

**Hammer depth presentation qualification (Codex round-7 Q3)**

The audit's narrow finding stands — values clean on matched adequate reps,
discrimination unresolved — so the number stays, but affirmative
depth-quality claims are suppressed pending discrimination evidence:

- `buildSetReveal` gains `quietAxes`: an axis that may not star in the
  reveal's affirmative improvement claim (「先说进步：…比上一组好了一截」).
  Summary and PlanWorkout pass `['depth']` for hammer_curl. The axis still
  counts in the totals comparison and the weakest-axis goal, which make no
  per-axis quality claim. (The corrective `insufficient_range` stands: it
  fires on a *low* read, and depth's values on adequate reps are the clean
  part of the evidence — the unresolved direction is missed shallow reps,
  not false corrections.)
- Where the hammer breakdown renders alongside the withheld total (Summary
  reveal; PlanWorkout rest reveal for cameraType-routed hammer sets), a
  limitation line in companion tone states the qualification. Exact copy
  shipped (`COPY_DEPTH_SHALLOW_LIMIT` in companionCopy.ts):

  > 幅度先记你举到的高度——深浅我还分不清，就不拿它下结论啦

  (Edward can veto the wording; it is a single constant.) The share card
  carries the raw amplitude readout without the line — the withheld card
  body has no note slot, and the number there is the same measurement
  readout, not a claim; noted here as a known surface difference.

**Historical sets** are not recomputed: stored assessment maps win on every
restore path (a round-5-window front-raise set keeps its bands presentation
and its presented total — pinned by fixture), and the pre-contract hammer
carve-out is unchanged in shape.

## Restoration criteria (defined now, before any repair results — Codex round-7)

- Restoration requires **validation of the repaired axis through its
  complete production path** — not merely cleaner landmarks. A sealed
  channel-substitution experiment can justify restoration within its tested
  scope if it includes independent references, adequate **and** deliberately
  faulty efforts, and the relevant aggregation and presentation logic.
  Heavy agreeing with Full, or producing more plausible values, is
  insufficient.
- The step-6 multi-participant study remains necessary for broader
  population claims a narrow experiment cannot establish; it need not be
  the only possible restoration route.
- The two trunk axes are **independently restorable** (hammer's marks-grade
  evidence and front raise's moderate-confidence evidence are separate
  records; a repair validated for one does not restore the other).
- Front-raise stability restores through a **targeted audit** of
  independently marked elbow extension, peak-evidence selection, threshold
  crossings and resulting scores — its provisional status means the audit
  can clear it as well as convict it.
- Hammer depth's discrimination question resolves with shallow-range hammer
  reps under the same sealed protocol as the challenge-set filming
  (independently defined adequate / shallow / boundary ranges; frozen
  production filtering, gates, scoring and decision criteria; held-out
  evaluation after any tuning). Those reps can support a bounded
  shallow-range detection claim only — not general depth accuracy.

## Verification

- Suites (serial): client `test:repository` **506/506** (baseline 500;
  +6 net fixtures — hammer lean suppression, front-raise lean suppression,
  front-raise control-counterfactual, restored front-raise derivation +
  average exclusion, quiet-axis reveal claim, and the poisoned-sum test
  split into tallies-derived vs stored-map pins; existing front-raise
  presentation fixtures updated openly to the new states — no counting
  assertion weakened) + client tsc clean; server **131/131** (baseline 130;
  +1 channel round-trip fixture across both server validators) + server
  build clean; cloudflare **34/34** + typecheck clean.
- Phase-0 replay (L2 protocol, step3-driver, `replay-round8-*.json` beside
  `replay-round7-*.json` in
  `~/workspace/movemate-research/accuracy-phase0/step3-replay/`):
  **counting byte-identical on all four clips** — reps 16 / 1 / 3 / 6,
  rep-event times and per-rep internal scores identical, internal set
  totals identical (HC-A 70, HC-B 80, FR-A 60, FR-C 68), breakdowns,
  offsets and band tallies identical. The only deltas are the designed
  ones: assessment maps (hammer trunk → `channel`; front-raise depth /
  stability / trunk → `channel`) and suspended-axis corrections —
  FR-A `body_alignment` 2 → 0 and `unstable_movement` 3 → 0, FR-C
  `unstable_movement` 4 → 0 (every front-raise `unstable_movement` on
  both clips was control-manufactured under the counterfactual), hammer
  correction counts unchanged on these clips (their `body_alignment`
  was already 0 offline; the suppression is pinned by the lean
  fixtures).
- XP untouched (rep-derived; server fixture pins xpEarned = reps × 2 for a
  channel-suspended set).

## Deploy record

- (backfilled after deploy)
