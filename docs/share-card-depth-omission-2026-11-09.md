# Share-card depth omission for hammer curl (2026-11-09)

Implements the Codex round-8 ruling (`~/workspace/movemate-research/codex-consult-round8-out.txt` §1): the channel-suspension round left one documented gap — hammer-curl SET SHARE CARDS still printed the raw amplitude (depth) number in its axis slot, with no limitation line, because the withheld card body has no note slot.

## The ruling

Summary/PlanWorkout present hammer's depth number WITH the limitation copy 「幅度先记你举到的高度——深浅我还分不清，就不拿它下结论啦」 — Codex accepts that as a provisional descriptive readout. But a standalone card must carry its own interpretation; a limitation stated elsewhere does not accompany it. **On share cards, the amplitude number is omitted** — the slot renders the card system's existing unavailable treatment (`—`, via the `SetCardAxis.text` machinery: muted text in the fixed slot, no number, no bar). The independently supported `insufficient_range` correction is unaffected (it is not a card element).

## The change (card data layer only)

`client/src/features/share/cardData.ts`:

- `axesFrom(...)` gains an `omitDepthValue` option: for the depth axis it returns `{ value: 0, text: '—' }` instead of the rounded number. The shared assessment is NOT touched — hammer depth stays legitimately `numeric` in `axisAssessment` for the surfaces that carry the limitation line.
- Both set-card builders pass the option under one condition: **the set is hammer_curl AND its total is withheld** (`totalWithheld(assessment)`):
  - `buildMotionSetCard`: `result.exerciseType === 'hammer_curl'`.
  - `buildGymSetCard`: the recognition type derived the way PlanWorkout derives its requestedType — `exercise.planCamera?.profile || exercise.cameraType || exercise.name` (core exercises' name is itself the type id) — equals `'hammer_curl'`.
- Pre-contract legacy hammer sets (no assessment map) are not withheld, so their cards keep today's behavior exactly — presented total, depth number shown; no derivation is invented for them.
- No other movement's card changes; a non-hammer withheld card (e.g. seated curl, whose depth claim was never suppressed) keeps its depth number. Hammer cards' other axes, reps, score state and layout geometry are unchanged — the slot keeps its fixed position.

## Verification

- Fixtures (client/tests/share-cards.test.ts, +1 test): gym-path hammer withheld card → depth axis `text: '—'`, value 0, and the rendered SVG contains the omission mark and no `>93</text>` depth number (93 = the fixture's 560/6 mean); motion-path hammer card with a stored map → same omission; seated-curl withheld card → depth number 93 still printed (data + SVG); legacy hammer card (no map) → presented total 90, depth number shown. No existing fixture was modified.
- Suites (serial): client `test:repository` **507/507** (506 baseline + 1 new) + tsc clean; server **131/131** + build clean; cloudflare **34/34** + typecheck clean. No server/cloudflare code changed.
- Replay (Phase-0 L2 protocol, `replay-round9-*.json` beside the round-8 files in the step3-replay folder): all four clips **byte-identical** to round 8 (current production) — HC-A 16 reps/70, HC-B 1/80, FR-A 3/60, FR-C 6/68. Counting and totals numerically unchanged; this round is presentation-only.
- 动伴进度 space: checked — no displayed fact changed (library/recognition counts untouched); no sync.

## Deploy record

- Feature: `fix/share-card-depth-omission`; merge: _(filled by backfill)_.
- CI: _(filled by backfill)_.
- Production (dongban.xyz) Version: _(filled by backfill)_; preview (preview.dongban.xyz) Version: _(filled by backfill)_.
- No bcrypt/node_modules fallback was needed _(confirm at backfill)_.
