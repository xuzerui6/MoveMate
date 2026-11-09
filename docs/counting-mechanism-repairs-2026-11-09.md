# Counting-mechanism repairs — 2026-11-09

Repairs the four proven counting mechanisms from the Phase-0 counting
investigation (`accuracy-phase0/counting-mechanisms-report.md`, Codex
round-9 move #1). **Mechanisms only: no threshold value changes anywhere**
— every gate line (80° peak zone, 115° overshoot cap, 140° evidence line,
±150 ms pair tolerance, 150 ms return dwell, 600 ms pending flush,
2000 ms preservation bound) is exactly as shipped. Recalibration remains
frozen; nothing here reopens it. All changes are in
`client/src/features/motion/lib/extendedRecognition.ts` (plus one
optional diagnostics field in `exerciseMetrics.ts`).

## The repairs

### 1. Front raise: a superseded latch pays out instead of being overwritten (Lead 3b)

A per-side cycle held exactly one latch; when a second effort's qualified
peak closed before the first effort's return confirmed, the latch
assignment overwrote the first effort in place — it left no trace (FR-C
E12, absorbed by E13). The cycle now records the effort-separation fact
the old rule answered by accident: whether the descent after a latch
entered the return zone (raised ≤25°, the shipped start line) at all,
even when its dwell fell short of confirming the return
(`returnTouched`/`returnTouchAt`). When a new qualified peak supersedes
a latch **with** that touch, the superseded effort is closed out first —
a completion built from its latch and the stability evidence gathered up
to the touch — and arrives through the same pending/merge machinery as a
return-confirmed completion, in order (`payOutRaiseLatch` /
`arriveRaiseCompletion`). Without the touch, the new peak is a
continuation of the same effort and replaces its latch, exactly as
before. The new effort's per-effort stability evidence restarts at the
payout (the superseded effort's samples cannot leak into the next rep's
charge); the conservative whole-cycle flags (scoring, shift) keep
accumulating.

### 2. Front raise: peak evidence is evaluated for every closed effort (Lead 3a)

The update loop's branch order ran the overshoot review **before**
`evaluatePeakEvidence`, so any effort tripping the band cap — FR-C's E2,
the genuinely bent 145° effort — was never evaluated at all; whether its
elbow evidence would have qualified was unknowable by construction.
Evaluation now runs for every closed episode and the verdict is recorded
on the cycle and mirrored to diagnostics (`lastPeakEvidence`). The
overshoot review still decides the effort's fate exactly as round 4
specified: a genuine overshoot still revokes, including a latch an
earlier segment earned. The repair is that the evidence path runs and is
attributable — bent-but-real raises are now *evaluated and then*
declined, not invisible.

### 3a. Hammer curls: the pair test consults every episode a cycle latched (Lead 1)

One synchronous effort emitted as two singles on HC-A because the two
sides' **kept** peak windows sat ~330 ms apart: on a fragmented channel,
one side's plateau closes as several peak episodes and the cycle keeps
the last, while a discarded fragment of the same plateau overlapped the
partner's window all along. Each cycle now records every valid episode
window it latches (`peakWindows`, carried onto the completion), and the
merge test asks whether **any** latched window of one completion
overlaps any of the other, under the unchanged ±150 ms tolerance. What
changed is which windows are compared, not the tolerance. A genuinely
staggered effort — each side exactly one episode, windows apart — still
fails every pairing and emits as singles (the step-3 loose-sync fixture,
375 ms offset, and the true-alternating fixtures pin this unchanged).

### 3b. Hammer curls: form rejections no longer wipe in-flight cycles inside the preservation bound (Lead 1, implication 4)

`formInterrupt` wiped all cycle state; on HC-A the tilt gate's rejections
were the shipped path's largest single counting loss (4 of 7 missed
episodes died inside one). For hammer curls, a form rejection now
preserves the side cycles, any pending completion and the last-peak
record inside the same 2000 ms bound soft interrupts use, measured from
the last successfully measured frame on the shared hole clock
(`preserveHammerCycle`). Past the bound the rejection voids the cycles
exactly as before. Ready still drops — recalibration is re-earned at the
start pose before a preserved cycle can progress, and a preserved cycle
still needs valid measured frames to complete. Other movements keep the
wipe: their form rejections judge the pose family itself, and no traced
loss indicts them.

### 4. The judged extremum is bounded to the sampled range (Lead 2, implication 1)

`feedPeakTrack`'s parabola refinement was unbounded: near-collinear
bracket samples make the vertex diverge, so the front-raise overshoot
gate judged values no sample ever reached (refined extrema of 202° and,
on one FR-C garbage segment, 681°, against sampled maxima ≤180°) —
amplifying channel noise exactly where the revocation line sits. A
closed episode's judged depth is now its **sampled** extremum. Episode
timing still refines sub-frame (crossing-interpolated start/end, and
with it the dwell validity); only the judged value was bounded. This
also removes the refinement's small systematic overshoot from the depth
reads of hammer curls, one-arm rows and split squats (their peak values
now read the sampled extremum; see the internal-score note below).

## Replay — full Phase-0 suite, before → after (L2 protocol, step3-driver)

| Clip | Model | Before | After | Accounting |
|---|---|---|---|---|
| HC-A hammer | Full | 16 | **18** | −1 split merged (repair 3a: the 12.47 effort's two singles — kept windows [12.90, 13.10] / [13.43, 13.48] — now pair via the right cycle's discarded first fragment); +3 from the tilt-interrupt cluster (repair 3b: efforts at ≈30.0, ≈31.6 and ≈37.9, all previously wiped by form interrupts at t=31.07/32.43/38.60–38.80, now complete as pairs after recalibration; tapped re-run: completions at 31.33/31.50, 34.10/34.10, 39.07/39.10). The ≈33.2 effort remains absorbed — its motion fell inside the preserved cycles' return span, so it shares the 31.6 cycle's completion rather than counting separately (the same latch-continuation semantics as any two peaks in one unreturned cycle). Remaining misses vs the 22-effort census: 19.2, 20.7, 34.7 — no completions in either run (detection-hole fragmentation, the investigation's inferential attribution), unchanged. |
| HC-A hammer | Heavy | 20 | 20 | Identical rep times. Heavy's channels are unfragmented (one episode per side); nothing to merge, nothing wiped (zero in-set interrupts in that run). |
| HC-B hammer | Full | 1 | 1 | Unchanged (held-out clip; its Full detection poverty is not a mechanism repaired here). |
| HC-B hammer | Heavy | 19 | 19 | Identical rep times; internal set score 81 → 80 (depth mean 93 → 92) from repair 4 — peak values now read the sampled extremum instead of the refined overshoot. Counting unchanged. |
| FR-A front raise | Full | 3 | 3 | Identical rep times. The sides the 115° line kills under Full (effort 4 right at 125.4°, effort 3 left ≈119.8°) die on sampled reads (116.7–129.7 class values were the Heavy trace) — repair 4 does not rescue them and is not meant to. |
| FR-A front raise | Heavy | 0 | 0 | Unchanged: the best effort (7+8) is revoked on **sample-level** reads of 116.7°/129.7° — a channel-distribution fact, not the refinement artefact — and effort 4 still dies at peak evidence. Zero latches either way. |
| FR-C front raise | Full | 6 | **7** | +1: E12 paid out (repair 1). The rep pair lands at 46.5/47.2 — E12's completion flushes when E13's return-confirmed completion arrives, E13's own flush follows — where pre-repair the single merged rep landed at 47.2. E2 still does not count (overshoot, sampled 118.8°/124.1°); it is now **evaluated** on every close (repair 2) instead of pre-empted. Internal set score 68 → 70 on the changed rep population. |
| FR-C front raise | Heavy | 5 | 5 | Identical rep times. |

No other clip changed count. Five new fixtures pin the repairs
(`client/tests/extended-recognition.test.ts`, "Counting-mechanism
repairs" section): the E12-style payout, the verdict recording for a
straight-but-over-band effort (`qualified`) and a bent one (`revoked`),
the sampled-extremum gate (a 114° sampled peak the refinement judged at
≈115.4°), the fragmented-plateau merge, and the form-rejection burst.
Verified discriminating: with the repairs stashed, exactly those five
fixtures fail and the other 85 tests in the file pass.

Tests (serial): client `test:repository` **512/512** (507 baseline + 5
new), client `tsc -b` clean; server **131/131** + build; Cloudflare
**34/34** + typecheck. CI: see the deploy record below.

## Deliberately NOT repaired

- **Single-sample counter-evidence at the peak instant** (Lead 2,
  implication 3 — one lateral flag on the best sample revokes a whole
  episode). A verdict-rule change inside `evaluatePeakEvidence`: it
  alters which reps count under distribution shift and belongs with the
  frozen recalibration work, not with these mechanism repairs.
- **Extremum gates on sustained/typical levels** (Lead 2, implication
  2). A gate-statistic redesign — the same frozen territory.
- **Per-side "channel uninformative" representation and inspectable
  per-side completion streams** (Lead 1, implications 1–2). Diagnostic
  architecture with no counting effect on the shipped path; Heavy's
  one-sided collapse is a channel fact these repairs neither hide nor
  fix.
- **Post-interrupt recalibration dead windows** (Lead 3b, implication
  4 — E10/E17 performed while the tracker was un-ready). A calibration-
  semantics change; repair 3b preserves the cycles but deliberately
  keeps the recalibration requirement itself.
- **The hammer-cycle latch overwrite** (a second episode re-latching
  `peakStart` inside one unreturned cycle). Same code shape as the FR
  defect, but no traced counting loss indicts it — the investigation's
  hammer leads are the merge test and the interrupt wipe — and the task
  scoped the latch repair to front raise. The windows it overwrites are
  now at least *recorded* (`peakWindows`), which is what repair 3a
  consumes.
- **The front-raise pair test** still compares kept windows only; the
  all-episodes identity is scoped to hammer, where the traced split
  occurred.

## What Edward's device retest should look for

- **Hammer curls, one bilateral set**: the count should land closer to
  the true number of reps performed — specifically, synchronous reps
  whose channels fragment should no longer double-count, and reps in
  flight when a brief lean trips the form gate should no longer vanish.
  On the HC-A recording this moved 16 → 18 against a true 22 (the
  remaining gap is detection holes, a channel limit, not counting
  machinery).
- **Front raise**: two raises separated by only a brief dip to the
  start line now count as two. A bent-but-real raise (elbow ≈145°) that
  also goes over shoulder height is still declined — the overshoot rule
  is unchanged — but it is now evaluated on its elbow evidence rather
  than discarded unseen (visible in the on-device diagnostics as
  `lastPeakEvidence`).
- Nothing about scores' *presentation* changes: the suspended axes stay
  suspended; the only score-side effect is internal — depth reads use
  the sampled extremum, so a set's depth mean can move a point or two.

## 动伴进度 space check

Counting repairs change no displayed fact on the space (library counts,
video counts, recognition-tier counts all untouched — counting behaviour
only, no new movements, no media). No sync needed; verified against the
space's current snapshot (769/1,329 · 待补 560 · 照片 656 · 器械类剩 109 ·
视频 18).

## Deploy record

- Code commit: `8c565df` (main)
- CI: run for `8c565df` — success (client 512/512, server 131/131,
  Cloudflare 34/34 as run locally; CI green).
- Production `dongban.xyz` Version: `d1ea7ab3-6925-4b1e-a4d0-4c4ab8f4957a`
- Preview `preview.dongban.xyz` Version: `793e0f69-dc5b-4237-bac4-281f30512c23`
