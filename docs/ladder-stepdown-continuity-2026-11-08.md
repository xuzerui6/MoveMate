# Ladder step-down continuity — 2026-11-08

Fix for the state-carry defect confirmed by the Phase-0 measurement-pipeline
audit (`~/workspace/movemate-research/accuracy-phase0/audit-report.md` §b).
Base: main `0cf5cff` (step-3 scoring contract). Scope: state continuity only —
no ladder rung order, step-down trigger, model file, tracker threshold,
counting gate or scoring semantic changed.

## The defect

`useAdaptivePose.stepDown()` closed the transport and constructed a **new**
`AdaptiveRecognition` engine seeded with the old engine's metrics snapshot.
Everything except the set/count/score accumulators reset on every switch:

- calibration bank + latched `ready` (the tracker constructor hardcodes
  `calibrated = false`) — counting halted until the user re-held the start
  pose for a fresh calibration;
- both `TimeFilter` instances (image + world landmarks) — the first
  post-switch frame passed through unfiltered, derivative state restarted;
- the open cycle / peak-track state / `lastPeak` peer memory — the
  in-progress rep was voided;
- wrapper state (framing history, body-shape ratios, 2D/3D basis).

Bounded cost per switch: ≤ 1 in-progress rep + one ≈2 s recalibration window
of uncounted reps, payable more than once under sustained thermal throttling.

## The fix

A step-down now swaps **only the pose model**. `stepDown()` calls
`AdaptiveRecognition.carryToRun(newRunId)` on the existing engine instead of
rebuilding it, so the tracker instance — calibration bank, latched ready,
open cycle, peer-peak memory, metrics accumulators — and both `TimeFilter`s
carry over by construction. Three seams are re-sewn explicitly:

1. **Frame order** — `FrameOrder.rebind(runId)`: frame ids restart with the
   new run (the runtime resets its counter), but the `capturedAt` high-water
   mark survives, so a late frame from the old rung stays rejected both by
   run id and by time.
2. **Frame-gap guard** — the transport gap while the new rung's model loads
   (routinely > 750 ms) would itself trip every tracker's gap interrupt on
   the first post-switch frame. `carryToRun` arms a one-shot bridge: the
   next frame that actually reaches the tracker first calls
   `bridgeFreezeGap(capturedAt)` — the established hammer evidence-freeze
   pattern. `ExtendedExerciseTracker` already had it; `ExerciseTracker`
   (core-4) and `PlanExerciseTracker` gained the identical method (arm only
   when the pending gap exceeds the guard; consumed by the first gapped
   frame; cleared by any interrupt). The flag lives in the wrapper and is
   consumed only at the moment of bridging; a tracker interrupt in between
   resets the tracker's gap reference, which neutralises a stale flag.
3. **Measurement basis** — the wrapper's 2D/3D basis flag resets to
   unestablished, so the estimator change itself is not read as a basis
   flip; the first frame of the new rung establishes the basis and the flip
   guard resumes from there. The body-shape ratios stay: they describe the
   user's proportions, not the model's, and the 25 % drift tolerance absorbs
   inter-model differences.

Accumulators were verified to still carry: they live in the same tracker
instance, and the between-reps fixture below compares the full
`scoreAccumulator`/`formScore`/`formBreakdown` against a no-switch control.

## What still resets, deliberately

- **Runtime performance bookkeeping** in the hook (fps/latency/inference
  windows, degradation judge, probe state): it describes the old rung's
  performance and must not contaminate the new rung's verdicts.
- **The wrapper basis flag** (above): one frame re-establishes it.
- **A genuine basis loss after the switch**: if the incoming rung's world
  channel is invalid where the old rung's was valid (or vice versa) for
  > 200 ms, the pre-existing basis-flip guard still interrupts. That guard
  protects measurement integrity, not step-down bookkeeping, and is out of
  scope for this round.
- **Duration-sensitive subscores see the real gap**: counting is exact
  across a switch, but a rep whose cycle spans the transport gap has that
  elapsed time in its duration/speed evidence — the frames genuinely were
  not measured during the model load. Bounded by the same ≤ 1 rep as before;
  fabricating the missing time would be worse.

## Fixture evidence

Nine new fixtures in `client/tests/adaptive-recognition.test.ts`, driving a
rig that reproduces `stepDown`'s exact semantics (1600 ms of no frames, frame
ids restarting under a new run, `carryToRun`):

- **Between reps, all three tracker families** (squat → `ExerciseTracker`,
  biceps_curl → `PlanExerciseTracker`, hammer_curl →
  `ExtendedExerciseTracker`): calibration stays latched on the first
  post-switch frame; the second cycle after the switch produces **identical**
  reps, scored count, `formScore` and `formBreakdown` to a no-switch control
  run of the same frames.
- **Mid-rep, all three families**: the switch lands on an open peak; the rep
  completes exactly once and is scored; calibration never drops.
- **Contrast**: the pre-fix rebuild (fresh engine seeded with the metrics
  snapshot) starts uncalibrated with the open rep gone — the defect, pinned.
- **Stale frames**: an old-run frame and a new-run frame behind the
  captured-at high-water mark are both rejected after the carry; the session
  stays calibrated.
- **Filter continuity**: across gaps of 50 ms and 1600 ms the `TimeFilter`
  output stays within the stated bound — per coordinate it never overshoots
  the segment between the previous filtered value and the raw sample — and a
  carried filter demonstrably smooths where a reset filter would pass the
  raw sample through untouched.

The offline L2 replay harness feeds landmarks straight into a tracker and
has no forced-switch facility, so replay was not re-run; the fixture rig
replicates the hook's switch semantics one-to-one and is the evidence.

## Verification

Serial, from baselines client 473 / server 129 / cloudflare 34:

- client `test:repository` **482/482** (473 + 9 new) + `tsc -b` clean
- server **129/129** + build clean
- cloudflare **34/34** + typecheck clean

## Deploy

(Backfilled after deploy.)
