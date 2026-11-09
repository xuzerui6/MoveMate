# Walking-test fixes — 2026-11-09

Origin: Edward's 2026-11-09 evening screen recording on the preview build
(hammer-curl session, night sidewalk, handheld camera, TWO people walking
side by side, nobody exercising; ground truth ZERO curls, the app counted
4, the skeleton hopped between the two people unannounced, and the HUD
contradicted itself). Full investigation:
`~/workspace/movemate-research/walking-test-2026-11-09.md`.

No counting threshold changed anywhere in this round. No scoring change.

Ship record: main `59e5391`; CI green; production (dongban.xyz) Version
`869f27b9-423d-415c-9b27-7dd8d12d94f5`; preview (preview.dongban.xyz)
Version `8b1d6737-c29a-47cd-9a9a-f6f809fdb58b`. Both stations verified
live (HTTP 200; the new companion copy and timer copy present in the
served chunks).

## Defect 1 — phantom reps from walking: strict re-arm after tracking loss

Mechanism (traced in the report): the session latched and lost its latch
dozens of times (61 calibrated flips in the Full-landmark production-path
replay, 73 on Lite), and every phantom rep completed inside a stretch that
had RE-armed instantly — via `armOnStart`'s single-frame arm or banked
arm-swing fragments — after a tracking-loss interrupt. Hammer cycle
admission itself needs no position/stationarity evidence, so once armed,
ordinary arm swing (elbow channel crossing the ≤80° peak zone and the
≥145° return dwell at stride cadence) completed per-side cycles.

Fix (`extendedRecognition.ts`): re-arming after a **tracking-loss**
interrupt (the adaptive wrapper's rejects, a pause, a restored session —
anywhere the subject was actually lost) now requires one
**continuously-measured** start-pose hold of 1500 ms
(`REARM_MIN_SEGMENT_MS`); banked fragments may still supply the rest of
the 2 s total. "Continuously measured" is literal: a measurement gap
over 500 ms (`SEGMENT_GAP_MS`) banks the open segment and restarts it, so
freeze spans and skipped frames cannot inflate a hold. The calibration
progress readout on a strict re-arm reports the binding requirement, so
the ring cannot fill on fragments alone.

Deliberate exemptions, each load-bearing:
- **First calibration** is untouched (guided user, 2026-11-07 banking
  story, prep flow and its instant `armOnStart` arm included).
- **Form-rejection re-arms** are exempt: the rejecting frame was measured,
  the set context is intact, and the 2026-11-09 counting repairs rely on
  fast re-latching mid-set (HC-A's recovered reps).
- The squat-family `ExerciseTracker` and the plan-path
  `PlanExerciseTracker` keep their own calibration rules (out of this
  defect's evidence; the session was the extended hammer path).

Validation (Phase-0 harness): production-path replay of the recording →
**0 reps on both landmark channels** (Full 1→0, Lite 3→0; p0 skip mode
Lite 4→0). Canonical L2 suite counts unchanged: **HC-A 18, HC-B 1,
FR-A 3, FR-C 7**, latch counts identical to pre-fix. One individually
accounted change: FR-C in the (known-divergent) offline adaptive harness
goes 3→2 (skipclamp) / 1→0 (skip) — the lost rep was admitted pre-fix by
an instant re-arm landing mid-raise (latched at 16.0 s during an effort
already under way); post-fix the tracker honestly re-holds and counts the
later raises. The L2 mechanism harness shows walking counts unchanged —
by construction it strips the wrapper (visibility clamped, no framing or
freeze routing), so the tracking-loss signal this fix keys on does not
exist there; see the investigation report.

## Defect 2 — subject switching: continuity verdict learns shape

The adaptive wrapper's existing position guard compared one hip joint
between consecutive accepted frames and answered every jump with
「位置变了一下」. It now also compares the hip **centroid** step and the
**shoulder-width** ratio: a teleport (centroid step beyond the guard's
own bound) WITH a shape change (shoulder width outside [0.75, 1.33])
reads as the model locking onto a different person, and rejects with the
new companion line `COPY_SUBJECT_SWITCH`
（「画面里好像不止一个人，我跟丢啦——站回画面中间，让我重新找到你」),
dropping to the finding-you state like every reject. Position-only jumps
keep the existing copy and behaviour exactly. The detector deliberately
lives only in the wrapper (raw frames, consecutive accepted pairs):
on the smoothed tracker stream the same joint statistic fires during
HC-A's channel-collapse episodes (7–8 events), so a tracker-level
version would void real sets — measured, and rejected on that evidence.

Replay: the switch copy fires on the walking recording (1× Full, 2×
Lite; most switches cross reject gaps and surface as ordinary tracking
loss instead); it never fires on any Phase-0 gym clip.

## Defect 3 — presentation contradictions (Workout.tsx)

(a) 有效时长 semantics were already coherent in code — the clock starts
at the first latch and keeps running through tracking loss exactly like a
resume from pause (the page's own 2026-11-07 design note); the false
surface was the HUD calibration panel's unconditional subline
「计时还没开始 · 计数也是」. It is now conditional on the first latch:
before it, the original line; after it, 「计时在走 · 站回来，我接着数」.

(b) State-line strobing: the tracker-level churn collapsed with the
Defect-1 fix (calibrated flips 61/73 → 3/3 in replay), and the display
layer now also dwells (`statusDwell.ts`): the header state, the status
capsule, the HUD panel choice and the coach line's engine-feedback
fallback pass through a dwell (candidate must persist ~400 ms and the
shown line must have been up ~1.5 s; coach fallback 1.2 s/350 ms). The
「找到你啦」 event line additionally re-fires only after the subject was
continuously uncalibrated for ≥2.5 s (first latch always fires). Counts,
the session clock, event lines, milestone lines and the primary-issue
message stay immediate; paused/ending states bypass the dwell.

(c) The form line at ~61 s was `measure()`'s hammer upper-arm hint
reaching the screen through the calibration branch of `update()` —
round 5 had removed it only from the post-latch path. The calibration
branch no longer surfaces `f.hint` for any type: no form cue fires
before the set has latched. Front raise's framing-weak copy (a framing
fact, not a form judgment) remains the only pre-latch exception, and
post-latch surfaces are untouched. Replay: hint appearances 29/57 → 0.

## Tests

Client 519/519 (was 512): +4 dwell unit tests, +1 strict-re-arm fixture,
+1 pre-latch form-cue fixture, +1 subject-switch fixture (the two
tracker fixtures verified discriminating — they fail on the pre-fix
source). One existing fixture updated: the hammer freeze-void test's
recalibration feed now runs the continuous re-arm hold its scenario
actually performs (800→2600 ms of neutral, interpolation/filter lag
included); its assertions are unchanged. Client tsc clean; server
131/131 + build; cloudflare 34/34 + typecheck.
