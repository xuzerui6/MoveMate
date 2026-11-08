# Inline average withheld-set exclusion — 2026-11-09

Addendum to the minimum-axis contract
(`docs/minimum-axis-contract-2026-11-09.md`) and the total-scope
labeling round (`docs/total-scope-labeling-2026-11-09.md`, which
flagged this defect and deliberately left it out of that
presentation-only round because fixing it moves a headline number).

**The disagreement.** Two cross-set averages existed with two
different inclusion rules:

- The workout share card's average (`buildWorkoutCardData`) has,
  since round 5, averaged only sets whose totals are **presented** —
  a withheld total stays out, because averaging it in would publish
  the paused number through a side door.
- The PlanWorkout completion screen's inline 「训练识别均分」 still
  averaged **all** camera sets' internal totals (Σtotal / Σcount over
  every camera set with `score.count > 0`), including sets whose
  totals are withheld on every other surface — hammer curl, seated
  curl, triceps kickback, degraded-framing sets. The completion
  screen and the card printed different averages for the same workout,
  and the inline one moved with scores the user is never shown.

**The fix — one rule, one helper.** `totalEntersAverage(score)` in
`axisAssessment.ts` is now the single inclusion predicate for every
cross-set average: a set's total may enter an average only when the
set produced scored reps (`count > 0`) AND its total is presented
under the minimum-axis contract (`!totalWithheld(assessmentFromScore(score))`).

- `cardData.buildWorkoutCardData` now calls the predicate instead of
  its inline copy of the same expression (behavior unchanged — its
  fixtures pass untouched).
- New pure helper `completionRecognitionAverage(sets)` in `cardData.ts`
  computes the completion screen's average with its historical
  per-rep weighting (Σtotal / Σcount — deliberately different from
  the card's per-set mean, a board-documented difference), restricted
  to camera sets passing the predicate. `PlanWorkout.tsx` renders the
  line iff the helper returns non-null.
- The completion screen's set selection is otherwise untouched (no
  status filter added or removed); non-camera sets and presented sets
  behave exactly as before. Copy is unchanged
  (「仅统计可评分的完整动作」 — withheld sets are precisely the ones
  that are not 可评分 in the presented sense).
- **All-withheld case:** when no presented scored camera set remains,
  the helper returns null and the line hides entirely — mirroring the
  card's `avgScore: null`. It never falls back to including withheld
  sets to keep the line alive.

**Fixtures** (`client/tests/share-cards.test.ts`, +2; no existing
fixture modified):

1. Mixed workout: one presented camera set (170/2) + one withheld
   camera set (stored hammer-style accumulator whose recorded peak
   offsets derive the suspended map; internal mean 40) + one manual
   set carrying a score → average is **85**, the presented set's own
   per-rep mean (the old inline formula printed 63). The withheld set
   alone → **null** (old formula printed 40); manual-only and empty
   → null.
2. All-presented regression pin: (1840 + 800) / (20 + 10) = **88** —
   the pre-change inline formula's exact output, so the weighting and
   selection behavior for presented sets is byte-for-byte the old one.

**Verification.**

- Client `test:repository`: **500/500** (498 baseline + 2 new).
  Client tsc clean.
- Server: **130/130** + build clean (no server change).
- Cloudflare: **34/34** + typecheck clean (no cloudflare change).
- **Replay (Phase-0 suite, L2 protocol, Full landmarks; same
  step3-driver as rounds 3–6): all four clips byte-identical to the
  round-6 (current production) outputs** (`replay-round7-*.json`
  beside `replay-round6-*.json` in
  `~/workspace/movemate-research/accuracy-phase0/step3-replay/`) —
  same reps, same per-set internal totals (FR-A 60, FR-C 68, HC-A 70,
  HC-B 80), same assessment maps. The only numeric change anywhere is
  the completion-screen average itself, and only for workouts where a
  withheld set participates — which is the defect being fixed.

## Deploy record

- Merged to main as `__MERGE_SHA__`; CI run __CI_RUN__.
- Production (dongban.xyz): Version `__PROD_VERSION__`.
- Preview (preview.dongban.xyz): Version `__PREVIEW_VERSION__`.
- 动伴进度 space: checked — no displayed fact changed (library /
  recognition counts untouched; the space displays no workout-average
  facts), so no sync was needed.
