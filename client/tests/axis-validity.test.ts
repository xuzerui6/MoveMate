import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtendedExerciseTracker } from '../src/features/motion/lib/extendedRecognition';
import { createRecognitionTracker, newDemonstrationPose } from '../src/features/motion/lib/recognition';
import { numericCoverageOf, totalScopeNote, totalWithheld, type AxisAssessments } from '../src/features/motion/lib/axisAssessment';
import { restoredSetMetrics } from '../src/features/gym/workoutSync';
import { buildGymSetCard, buildMotionSetCard, buildWorkoutCardData } from '../src/features/share/cardData';
import { libraryPose } from './fixtures/library-camera';
import type { NormalizedLandmark as Point } from '@mediapipe/tasks-vision';

/** Axis-validity suspension fixtures (2026-11-09, Codex rounds 3–4):
 * the suspended profiles' stability axis is unassessable ('control'),
 * set totals follow the minimum-axis contract (a total is presented
 * iff no axis is unassessable for a validity reason and every
 * by-design-applicable axis is assessed in some form — the ≥60%
 * coverage gate of the suspension round was replaced per Codex
 * round-4), suspended constructs stop generating corrective output,
 * and the internal score computation (formScore / breakdown / XP
 * inputs) is untouched.
 *
 * Channel-suspension fixtures (2026-11-09, Codex round-7) extend the
 * same discipline to the axes the spillover audit convicted at the
 * channel level: hammer trunk and front-raise depth/trunk
 * (demonstrated contamination) and front-raise stability
 * (provisional — unresolved validity under demonstrated channel
 * risk) are unassessable ('channel'); front-raise band tallies keep
 * accumulating as diagnostics but are never presented. */

const rot2 = (x: number, y: number, rad: number): [number, number] => [x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad)];
function curlPose(leftElbow: number, rightElbow: number, upperDeg = 0, hipShift = 0): Point[] {
  const p: Point[] = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
  const put = (i: number, x: number, y: number) => { p[i] = { x, y, z: 0, visibility: 1 }; };
  put(0, .5, .16);
  const elbows = [leftElbow, rightElbow];
  for (const o of [0, 1]) {
    const sx = .40 + o * .20, dir = o ? -1 : 1, phi = upperDeg * Math.PI / 180;
    put(11 + o, sx, .30); put(23 + o, sx + hipShift, .56); put(25 + o, sx, .74); put(27 + o, sx, .92);
    const [ux, uy] = rot2(0, 1, dir * phi);
    const ex = sx + ux * .18, ey = .30 + uy * .18; put(13 + o, ex, ey);
    const [fx, fy] = rot2(ux, uy, -dir * (180 - elbows[o]) * Math.PI / 180);
    put(15 + o, ex + fx * .18, ey + fy * .18);
  }
  return p;
}

test('minimum-axis contract: validity reasons and unassessed applicable axes withhold; by-design axes never do', () => {
  const map = (depth: any, stability: any, trunk: any, symmetry: any): AxisAssessments => ({ depth, stability, trunk, symmetry });
  const num = { kind: 'numeric' } as const;
  assert.equal(totalWithheld(undefined), false);
  assert.equal(totalWithheld(map(num, num, num, num)), false);
  // Coverage is diagnostic metadata only now — it is still computed
  // (front raise renormalizes over .45 of the nominal weight) but it no
  // longer gates anything, in either direction.
  assert.equal(numericCoverageOf(undefined), 1);
  assert.equal(numericCoverageOf(map({ kind: 'bands', left: 'shoulder' }, num, num, { kind: 'unassessable', reason: 'view' })), .45);
  // Front raise: every applicable axis is assessed (depth as bands,
  // stability + trunk numeric) and symmetry is unassessable BY DESIGN
  // ('view') → the total is presented again, despite .45 coverage.
  assert.equal(totalWithheld(map({ kind: 'bands', left: 'shoulder' }, num, num, { kind: 'unassessable', reason: 'view' })), false);
  // A validity suspension withholds at ANY coverage — this map covers
  // .75 numerically and still withholds ('control' blocks).
  assert.equal(numericCoverageOf(map(num, { kind: 'unassessable', reason: 'control' }, num, num)), .75);
  assert.equal(totalWithheld(map(num, { kind: 'unassessable', reason: 'control' }, num, num)), true);
  // Hammer frontal after the suspension: withheld (the 'control' axis).
  assert.equal(totalWithheld(map(num, { kind: 'unassessable', reason: 'control' }, num, { kind: 'category', category: 'sync' })), true);
  // The session-level framing state blocks, as it did before.
  assert.equal(totalWithheld(map({ kind: 'unassessable', reason: 'framing' }, { kind: 'unassessable', reason: 'framing' }, { kind: 'unassessable', reason: 'framing' }, { kind: 'unassessable', reason: 'framing' })), true);
  // An applicable axis that went unassessed in this set blocks (clause
  // ii): symmetry was applicable but produced no bilateral evidence.
  assert.equal(totalWithheld(map(num, num, num, { kind: 'unassessable', reason: 'no-bilateral-evidence' })), true);
  // Single-side family: symmetry is non-applicable by design → presented.
  assert.equal(totalWithheld(map(num, num, num, { kind: 'unassessable', reason: 'single-side' })), false);
  // Mixed: a by-design axis alongside assessed forms never blocks.
  assert.equal(totalWithheld(map(num, num, { kind: 'unassessable', reason: 'view' }, { kind: 'category', category: 'sync' })), false);
});

test('hammer curls: stability is unassessable (control), the total is withheld, internal scoring is unchanged', () => {
  const tracker = new ExtendedExerciseTracker('hammer_curl', 20, {}, true);
  const step = 1000 / 24; let t = 0;
  const feedbackAtRep: string[] = [];
  const feed = (l: number, r: number) => {
    const before = tracker.metrics.reps;
    const raw = curlPose(l, r); tracker.update(raw, t, 1, structuredClone(raw)); t += step;
    if (tracker.metrics.reps > before) feedbackAtRep.push(tracker.metrics.feedback);
  };
  for (let c = 0; c < 63; c++) feed(160, 160);
  const P = 48;
  const wave = (k: number) => { const u = (k % P) / P; return 160 - 81 * (1 - Math.cos(2 * Math.PI * u)) / 2; };
  for (let rep = 0; rep < 2; rep++) for (let k = 0; k < P; k++) feed(wave(k), wave(k));
  for (let c = 0; c < 40; c++) feed(160, 160);
  assert.equal(tracker.metrics.reps, 2);
  // The axis presents as cannot-assess with the suspension reason.
  assert.deepEqual(tracker.metrics.axisAssessment?.stability, { kind: 'unassessable', reason: 'control' });
  // Channel suspension (2026-11-09, Codex round-7): trunk follows —
  // demonstrated contamination of its image tilt channel.
  assert.deepEqual(tracker.metrics.axisAssessment?.trunk, { kind: 'unassessable', reason: 'channel' });
  assert.deepEqual(tracker.metrics.axisAssessment?.symmetry, { kind: 'category', category: 'sync' });
  // The suspended axes withhold the total at presentation level
  // (numeric coverage .35 — depth alone — is a diagnostic only)...
  assert.equal(numericCoverageOf(tracker.metrics.axisAssessment), .35);
  assert.equal(totalWithheld(tracker.metrics.axisAssessment), true);
  // ...while the internal computation is byte-identical to step 3: the
  // renormalized total over depth/stability/trunk, stability included.
  const fb = tracker.metrics.formBreakdown;
  const expected = Math.round((fb.depth * .35 + fb.stability * .25 + fb.trunk * .2) / .8);
  assert.ok(Math.abs(tracker.metrics.formScore - expected) <= 1, `internal formScore ${tracker.metrics.formScore} should stay the renormalized ${expected}`);
  // Per-rep feedback prints no aggregate while the total is withheld.
  assert.deepEqual(feedbackAtRep, ['好，第 1 次记下啦', '好，第 2 次记下啦']);
});

test('hammer curls: sustained upper-arm drift still computes internally, but the axis stays unassessable', () => {
  const tracker = new ExtendedExerciseTracker('hammer_curl', 20, {}, true);
  const step = 1000 / 24; let t = 0;
  const seenText: string[] = [];
  let liveIssueSeen = false;
  const feed = (e: number, u: number) => {
    const raw = curlPose(e, e, u); tracker.update(raw, t, 1, structuredClone(raw)); t += step;
    seenText.push(tracker.metrics.feedback, tracker.metrics.poseFeedback.message);
    if (tracker.metrics.poseFeedback.primaryIssue === 'unstable_movement') liveIssueSeen = true;
  };
  for (let c = 0; c < 63; c++) feed(160, 22);
  const P = 58;
  for (let k = 0; k < P; k++) { const u = k / P; feed(160 - 85 * (1 - Math.cos(2 * Math.PI * u)) / 2, 42); }
  for (let c = 0; c < 40; c++) feed(160, 22);
  assert.equal(tracker.metrics.reps, 1);
  // The internal stability value is exactly what the pre-suspension code
  // computed for this trajectory (≈60 — the pinned step-3-era fixture):
  // the suspension withholds the presentation, not the measurement.
  const s = tracker.metrics.formBreakdown.stability;
  assert.ok(s >= 54 && s <= 66, `internal stability ${s} should be ≈60, as before`);
  assert.deepEqual(tracker.metrics.axisAssessment?.stability, { kind: 'unassessable', reason: 'control' });
  // Workstream C (round 5): the suspended construct stops correcting.
  // The drift above is a sustained 42° upper-arm excursion — the exact
  // input that used to fire the live upper-arm hint, the live issue and
  // the per-rep unstable_movement correction. None may surface now:
  // the rep's shortfall is entirely control-manufactured (its
  // speed/duration evidence is clean), so the correction is suppressed.
  assert.ok(!seenText.some(m => m.includes('上臂贴紧')), 'the live upper-arm hint must not surface for a suspended movement');
  assert.equal(liveIssueSeen, false, 'the live control-derived issue must not fire for a suspended movement');
  assert.equal(tracker.metrics.correctionCounts.unstable_movement, 0);
  assert.deepEqual(tracker.metrics.lastRepIssues, []);
});

test('seated curls: a shortfall the speed/duration evidence produces on its own still corrects', () => {
  const tracker = new ExtendedExerciseTracker('seated_curl', 20, {}, true);
  const step = 1000 / 30; let t = 0;
  const feed = (elbow: number, upper: number) => { const raw = seatedCurlPose(elbow, upper); tracker.update(raw, t, 1, structuredClone(raw)); t += step; };
  for (let c = 0; c < 70; c++) feed(170, 0);
  // Fast reps (0.47 s) WITH the same 40° upper-arm excursion as the
  // suppression fixture above: the control term contributes its 37.5,
  // but the speed/duration evidence alone already costs ≈32 points —
  // the counterfactual (stability without control ≈ 67) is below the
  // issue line, so the correction stands. Suspension of the axis does
  // not blanket-suppress corrections the unsuspended evidence earns.
  const P = 14;
  for (let r = 0; r < 2; r++) for (let k = 0; k < P; k++) { const e = 170 - 92 * (1 - Math.cos(2 * Math.PI * (k / P))) / 2; feed(e, e < 145 ? 40 : 0); }
  for (let c = 0; c < 45; c++) feed(170, 0);
  assert.equal(tracker.metrics.reps, 2);
  assert.deepEqual(tracker.metrics.axisAssessment?.stability, { kind: 'unassessable', reason: 'control' });
  assert.ok(tracker.metrics.formBreakdown.stability < 70, `internal stability ${tracker.metrics.formBreakdown.stability} should show the combined shortfall`);
  assert.equal(tracker.metrics.correctionCounts.unstable_movement, 2);
  assert.ok(tracker.metrics.lastRepIssues.includes('unstable_movement'));
});

test('a restored pre-contract hammer set keeps its historical numbers', () => {
  const tracker = new ExtendedExerciseTracker('hammer_curl', 20, {
    reps: 2,
    scoreAccumulator: { count: 2, total: 180, depth: 190, stability: 170, trunk: 180, symmetry: 172, symmetryValues: [85, 87] },
  }, true);
  assert.equal(tracker.metrics.axisAssessment?.stability.kind, 'numeric');
  assert.equal(tracker.metrics.axisAssessment?.symmetry.kind, 'numeric');
  // The channel suspension follows the same carve-out as 'control':
  // the pre-contract set's trunk number stands with the rest of its
  // historical presentation.
  assert.equal(tracker.metrics.axisAssessment?.trunk.kind, 'numeric');
  assert.equal(totalWithheld(tracker.metrics.axisAssessment), false);
});

test('hammer curls: a hard lean still computes trunk internally, but the suspended axis derives no correction', () => {
  const tracker = new ExtendedExerciseTracker('hammer_curl', 20, {}, true);
  const step = 1000 / 24; let t = 0;
  let liveBodyAlignmentSeen = false;
  const feed = (l: number, r: number, lean = 0) => {
    const raw = curlPose(l, r, 0, lean); tracker.update(raw, t, 1, structuredClone(raw)); t += step;
    if (tracker.metrics.poseFeedback.primaryIssue === 'body_alignment') liveBodyAlignmentSeen = true;
  };
  for (let c = 0; c < 63; c++) feed(160, 160);
  // Reps performed with the hips shifted 0.15 of frame width: the image
  // tilt reads ≈30°, so the internal trunk value collapses (≈19 —
  // posture and shift both read the tilt channel). This is the exact
  // read the spillover audit convicted on marks-upright reps: it used
  // to print a per-rep body_alignment correction and a live one
  // (posture ≈64 < 70). Neither may surface now.
  const P = 48;
  const wave = (k: number) => { const u = (k % P) / P; return 160 - 81 * (1 - Math.cos(2 * Math.PI * u)) / 2; };
  for (let rep = 0; rep < 2; rep++) for (let k = 0; k < P; k++) feed(wave(k), wave(k), .15);
  for (let c = 0; c < 40; c++) feed(160, 160);
  assert.equal(tracker.metrics.reps, 2);
  const tb = tracker.metrics.formBreakdown.trunk;
  assert.ok(tb < 70, `internal trunk ${tb} should show the lean read (<70), proving the fixture exercises the convicted path`);
  assert.deepEqual(tracker.metrics.axisAssessment?.trunk, { kind: 'unassessable', reason: 'channel' });
  assert.equal(tracker.metrics.correctionCounts.body_alignment, 0);
  assert.ok(!tracker.metrics.lastRepIssues.includes('body_alignment'));
  assert.equal(liveBodyAlignmentSeen, false, 'the live posture issue reads the suspended tilt channel and must not fire');
});

test('front raise: channel suspensions withhold the total again; tallies and internal score stand', () => {
  const tracker = createRecognitionTracker('front_raise', 20);
  let now = 0; const step = 100;
  let feedbackAtRep = '';
  const feed = (stage: 'neutral' | 'peak', ms: number) => {
    const input = newDemonstrationPose('front_raise', stage);
    for (let t = 0; t < ms; t += step) {
      const before = tracker.metrics.reps;
      tracker.update(structuredClone(input.landmarks), now, 1, structuredClone(input.worldLandmarks)); now += step;
      if (tracker.metrics.reps > before) feedbackAtRep = tracker.metrics.feedback;
    }
  };
  feed('neutral', 3000);
  feed('peak', 1200); feed('neutral', 1200);
  assert.equal(tracker.metrics.reps, 1);
  // History: the suspension round withheld this total under the ≥60%
  // coverage gate; round 5's minimum-axis contract presented it again
  // (stability + trunk numeric, depth as bands, symmetry by design).
  // The channel suspensions (2026-11-09, Codex round-7) withhold it
  // once more, on the spillover audit's evidence: depth (bands) and
  // trunk are unassessable on demonstrated channel contamination,
  // stability provisionally on unresolved validity under demonstrated
  // channel risk; symmetry stays unassessable by design ('view').
  assert.deepEqual(tracker.metrics.axisAssessment?.depth, { kind: 'unassessable', reason: 'channel' });
  assert.deepEqual(tracker.metrics.axisAssessment?.stability, { kind: 'unassessable', reason: 'channel' });
  assert.deepEqual(tracker.metrics.axisAssessment?.trunk, { kind: 'unassessable', reason: 'channel' });
  assert.deepEqual(tracker.metrics.axisAssessment?.symmetry, { kind: 'unassessable', reason: 'view' });
  assert.equal(numericCoverageOf(tracker.metrics.axisAssessment), 0);
  assert.equal(totalWithheld(tracker.metrics.axisAssessment), true);
  // The per-rep aggregate print follows the withheld total.
  assert.equal(feedbackAtRep, '好，第 1 次记下啦');
  // Band tallies keep accumulating as diagnostics — they are simply
  // never presented anymore.
  const bands = tracker.metrics.scoreAccumulator.depthBandCounts;
  const tallies = (bands?.left ? Object.values(bands.left).reduce((a: number, b: any) => a + (b || 0), 0) : 0) + (bands?.right ? Object.values(bands.right).reduce((a: number, b: any) => a + (b || 0), 0) : 0);
  assert.equal(tallies, 2, 'the bilateral demo raise still records one diagnostic tally per side');
  assert.ok(tracker.metrics.formScore > 0, 'internal formScore still computed');
  // The scope label must NOT fire for front raise anymore: the
  // withheld note owns this state (totalScopeNote returns null for a
  // withheld map by construction).
  assert.equal(totalScopeNote(tracker.metrics.axisAssessment, { depth: '幅度', stability: '稳定性', trunk: '躯干', symmetry: '对称' }), null);
});

test('restored hammer sets (offsets, no stored map) present the suspension; cards withhold the total', () => {
  const restored = restoredSetMetrics({ reps: 3, score: { count: 3, total: 270, depth: 280, stability: 260, trunk: 270, symmetry: 0, symmetryOffsetsMs: [400, 420, 380] } });
  assert.deepEqual(restored.axisAssessment?.stability, { kind: 'unassessable', reason: 'control' });
  // Channel suspension: the derivation carries the trunk suspension
  // for the same sets (offsets identify a hammer set).
  assert.deepEqual(restored.axisAssessment?.trunk, { kind: 'unassessable', reason: 'channel' });
  assert.equal(restored.formScore, 90, 'the internal restored total is unchanged');
  assert.equal(totalWithheld(restored.axisAssessment), true);

  const card = buildGymSetCard({ reps: 6, exercise: { name: 'hammer_curl', nameZh: '锤式弯举' }, score: { count: 6, total: 540, depth: 560, stability: 520, trunk: 550, symmetry: 0, symmetryOffsetsMs: [80, 90, 70, 85, 95, 75] } }, 0, new Date());
  assert.equal(card.totalWithheld, true);
  assert.equal(card.score, null);
  assert.equal(card.axes?.[1].text, '暂时评不了');
  assert.equal(card.axes?.[2].text, '暂时评不了', 'the channel-suspended trunk renders as 暂时评不了, not a number');
  assert.equal(card.axes?.[3].text, '同步');

  // A set at exactly 80% coverage (single-side family) still shows its total.
  const romanian = buildGymSetCard({ reps: 4, exercise: { name: 'romanian_deadlift', nameZh: '罗马尼亚硬拉' }, score: { count: 4, total: 320, depth: 330, stability: 310, trunk: 320, symmetry: 0, axisAssessment: { depth: { kind: 'numeric' }, stability: { kind: 'numeric' }, trunk: { kind: 'numeric' }, symmetry: { kind: 'unassessable', reason: 'single-side' } } } }, 0, new Date());
  assert.equal(romanian.totalWithheld, false);
  assert.equal(romanian.score, 80);
});

test('motion set card: withheld total prints no score and cannot claim a personal best', () => {
  const assessment: AxisAssessments = { depth: { kind: 'numeric' }, stability: { kind: 'unassessable', reason: 'control' }, trunk: { kind: 'numeric' }, symmetry: { kind: 'category', category: 'sync' } };
  const result: any = { id: 'cur', exerciseType: 'hammer_curl', source: 'camera', startTime: new Date(), reps: 6, formScore: 95, perfectReps: 0, scoreAccumulator: { count: 6, total: 570, depth: 560, stability: 520, trunk: 550, symmetry: 0 }, formBreakdown: { depth: 93, stability: 87, trunk: 92, symmetry: 0 }, axisAssessment: assessment };
  const history: any[] = [{ id: 'old', exerciseType: 'hammer_curl', source: 'camera', formScore: 90, scoreAccumulator: { count: 6 } }];
  const card = buildMotionSetCard(result, history);
  assert.equal(card.totalWithheld, true);
  assert.equal(card.score, null);
  assert.equal(card.personalBest, false);
  assert.equal(card.axes?.[1].text, '暂时评不了');
  // The same session without the suspension map presents its total as before.
  const shown = buildMotionSetCard({ ...result, axisAssessment: undefined }, history);
  assert.equal(shown.score, 95);
  assert.equal(shown.personalBest, true);
});

/** Round-5 scope-review fixtures: seated_curl and triceps_kickback
 * share hammer's control construction (identical formula, identical
 * channel), so their stability axes join the suspension; the suspended
 * constructs stop correcting; a non-suspended profile keeps its
 * control-derived correction. */
function seatedCurlPose(elbowDeg: number, upperDeg: number): Point[] {
  const p: Point[] = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
  const put = (i: number, x: number, y: number) => { p[i] = { x, y, z: 0, visibility: 1 }; };
  put(0, .5, .16);
  for (const o of [0, 1]) {
    const sx = .43 + o * .06, dir = o ? -1 : 1, phi = upperDeg * Math.PI / 180;
    put(11 + o, sx, .30); put(23 + o, sx, .57); put(25 + o, .65 + o * .06, .57); put(27 + o, .65 + o * .06, .85);
    const [ux, uy] = rot2(0, 1, dir * phi);
    const ex = sx + ux * .16, ey = .30 + uy * .16; put(13 + o, ex, ey);
    const [fx, fy] = rot2(ux, uy, -dir * (180 - elbowDeg) * Math.PI / 180);
    put(15 + o, ex + fx * .16, ey + fy * .16);
  }
  return p;
}

test('seated curls: the shared control construction suspends the stability axis, withholds the total, and stops correcting', () => {
  const tracker = new ExtendedExerciseTracker('seated_curl', 20, {}, true);
  const step = 1000 / 24; let t = 0;
  let liveIssueSeen = false;
  let feedbackAtRep = '';
  const feed = (elbow: number, upper: number) => {
    const before = tracker.metrics.reps;
    const raw = seatedCurlPose(elbow, upper); tracker.update(raw, t, 1, structuredClone(raw)); t += step;
    if (tracker.metrics.poseFeedback.primaryIssue === 'unstable_movement') liveIssueSeen = true;
    if (tracker.metrics.reps > before) feedbackAtRep = tracker.metrics.feedback;
  };
  for (let c = 0; c < 63; c++) feed(170, 0);
  // One slow rep with a sustained 40° upper-arm excursion while the arm
  // is flexed: the control term alone manufactures the stability
  // shortfall (speed/duration evidence is clean at this tempo).
  const P = 70;
  for (let k = 0; k < P; k++) { const e = 170 - 92 * (1 - Math.cos(2 * Math.PI * (k / P))) / 2; feed(e, e < 145 ? 40 : 0); }
  for (let c = 0; c < 40; c++) feed(170, 0);
  assert.equal(tracker.metrics.reps, 1);
  assert.deepEqual(tracker.metrics.axisAssessment?.stability, { kind: 'unassessable', reason: 'control' });
  assert.equal(totalWithheld(tracker.metrics.axisAssessment), true);
  // The internal computation is untouched (≈62 from the control term).
  const s = tracker.metrics.formBreakdown.stability;
  assert.ok(s >= 55 && s <= 70, `internal stability ${s} should be ≈62, computed as before`);
  assert.ok(tracker.metrics.formScore > 0, 'internal formScore still computed');
  // The per-rep aggregate print follows the withheld set total.
  assert.equal(feedbackAtRep, '好，第 1 次记下啦');
  // Workstream C: no control-derived correction anywhere — not the
  // per-rep issue (the shortfall is control-manufactured), not the live
  // issue (the raw penalty is >30 throughout the excursion).
  assert.equal(tracker.metrics.correctionCounts.unstable_movement, 0);
  assert.deepEqual(tracker.metrics.lastRepIssues, []);
  assert.equal(liveIssueSeen, false);
});

test('seated curls: the >45° upper-arm form rejection is a measurement gate and still operates', () => {
  const tracker = new ExtendedExerciseTracker('seated_curl', 20, {}, true);
  const step = 1000 / 24; let t = 0;
  const feed = (elbow: number, upper: number) => { const raw = seatedCurlPose(elbow, upper); tracker.update(raw, t, 1, structuredClone(raw)); t += step; };
  for (let c = 0; c < 63; c++) feed(170, 0);
  // Workstream C suppresses score-derived corrections and the advisory
  // hint — not measure()'s form gates, which are part of counting.
  feed(170, 50);
  assert.ok(tracker.metrics.feedback.includes('上臂贴紧一点点，别让肩膀跟着抬'), `gate copy should surface, got: ${tracker.metrics.feedback}`);
  assert.equal(tracker.metrics.reps, 0);
});

function kickbackPose(elbowDeg: number, upperDeg = 0): Point[] {
  const p: Point[] = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
  const put = (i: number, x: number, y: number) => { p[i] = { x, y, z: 0, visibility: 1 }; };
  put(0, .55, .18);
  for (const o of [0, 1]) {
    const d = o * .06, dy = o * .02;
    const sx = .65 + d, sy = .28 + dy, hx = .42 + d, hy = .52 + dy;
    put(11 + o, sx, sy); put(23 + o, hx, hy); put(25 + o, .40 + d, .74 + dy); put(27 + o, .40 + d, .90);
    const base = Math.atan2(hy - sy, hx - sx);
    const ua = base + upperDeg * Math.PI / 180;
    const ex = sx + Math.cos(ua) * .17, ey = sy + Math.sin(ua) * .17; put(13 + o, ex, ey);
    const fa = ua + (180 - elbowDeg) * Math.PI / 180;
    put(15 + o, ex + Math.cos(fa) * .17, ey + Math.sin(fa) * .17);
  }
  return p;
}

test('triceps kickbacks: the shared control construction suspends the stability axis and withholds the total', () => {
  const tracker = new ExtendedExerciseTracker('triceps_kickback', 20, {}, true);
  const step = 1000 / 24; let t = 0;
  let feedbackAtRep = '';
  const feed = (elbow: number) => {
    const before = tracker.metrics.reps;
    const raw = kickbackPose(elbow); tracker.update(raw, t, 1, structuredClone(raw)); t += step;
    if (tracker.metrics.reps > before) feedbackAtRep = tracker.metrics.feedback;
  };
  for (let c = 0; c < 63; c++) feed(95);
  const P = 58;
  for (let k = 0; k < P; k++) feed(95 + 73 * (1 - Math.cos(2 * Math.PI * (k / P))) / 2);
  for (let c = 0; c < 40; c++) feed(95);
  assert.equal(tracker.metrics.reps, 1);
  assert.deepEqual(tracker.metrics.axisAssessment?.stability, { kind: 'unassessable', reason: 'control' });
  assert.equal(totalWithheld(tracker.metrics.axisAssessment), true);
  assert.equal(feedbackAtRep, '好，第 1 次记下啦');
  assert.ok(tracker.metrics.formScore > 0, 'internal formScore still computed');
});

test('seated lateral raise (not suspended): the elbow-extension control term still raises its live correction', () => {
  const tracker = createRecognitionTracker('seated_lateral_raise', 20);
  let now = 0; const step = 100;
  const neutral = libraryPose('seated_lateral_raise', 'neutral');
  for (let c = 0; c < 30; c++) { tracker.update(structuredClone(neutral.landmarks), now, 1, structuredClone(neutral.worldLandmarks)); now += step; }
  assert.ok(tracker.metrics.poseFeedback.calibrated);
  // Peak geometry with the elbows dropped to ≈107°: the extension
  // control penalty reads ≈58 (>30). This profile's construct was
  // reviewed and KEPT (elbow-extension shortfall, gate-bounded), so
  // its live unstable_movement correction must still fire — the
  // contrast direction of workstream C.
  const peak = libraryPose('seated_lateral_raise', 'peak');
  const bentWorld = peak.worldLandmarks!.map(v => ({ ...v }));
  bentWorld[13] = { ...bentWorld[13], x: -.2, y: .12, z: 0 };
  bentWorld[14] = { ...bentWorld[14], x: .2, y: .12, z: 0 };
  let issueSeen = false;
  for (let c = 0; c < 10; c++) {
    tracker.update(structuredClone(peak.landmarks), now, 1, structuredClone(bentWorld)); now += step;
    if (tracker.metrics.poseFeedback.primaryIssue === 'unstable_movement') issueSeen = true;
  }
  assert.equal(issueSeen, true, 'the non-suspended profile keeps its control-derived live correction');
});

test('restored front-raise sets (tallies, no stored map) present the channel suspensions; cards withhold and drop out of averages', () => {
  const score = { count: 2, total: 170, depth: 0, stability: 180, trunk: 160, symmetry: 0, depthBandCounts: { left: { shoulder: 2 }, right: { below: 1 } } };
  const restored = restoredSetMetrics({ reps: 2, score });
  assert.deepEqual(restored.axisAssessment?.depth, { kind: 'unassessable', reason: 'channel' });
  assert.deepEqual(restored.axisAssessment?.stability, { kind: 'unassessable', reason: 'channel' });
  assert.deepEqual(restored.axisAssessment?.trunk, { kind: 'unassessable', reason: 'channel' });
  assert.deepEqual(restored.axisAssessment?.symmetry, { kind: 'unassessable', reason: 'view' });
  assert.equal(restored.formScore, 85, 'the internal restored total is unchanged');
  assert.equal(totalWithheld(restored.axisAssessment), true);

  const card = buildGymSetCard({ reps: 2, exercise: { name: 'front_raise', nameZh: '哑铃前平举' }, score }, 0, new Date());
  assert.equal(card.totalWithheld, true);
  assert.equal(card.score, null);
  assert.equal(card.scoreNote, null, 'no scope note beside a withheld total — the withheld presentation owns the state');
  assert.equal(card.axes?.[0].text, '暂时评不了', 'band tallies are no longer presented as bands');
  assert.equal(card.axes?.[1].text, '暂时评不了');
  assert.equal(card.axes?.[2].text, '暂时评不了');
  assert.equal(card.axes?.[3].text, '这个角度评不了');

  // The completion average excludes the front-raise set through the
  // shared predicate (its total is withheld now): only the presented
  // set's value survives.
  const row: any = {
    session: { effectiveSeconds: 600, startTime: new Date() },
    sets: [
      { status: 'completed', exercise: { id: 'e1' }, reps: 8, score: { count: 2, total: 160, depth: 170, stability: 150, trunk: 160, symmetry: 160 } },
      { status: 'completed', exercise: { id: 'e2' }, reps: 2, score },
    ],
  };
  assert.equal(buildWorkoutCardData(row, 3)?.avgScore, 80, 'only the presentable set enters the average');
  assert.equal(buildWorkoutCardData({ ...row, sets: [row.sets[1]] }, 3)?.avgScore, null);
});

test('workout completion card: withheld sets stay out of the average score', () => {
  const row: any = {
    session: { effectiveSeconds: 900, startTime: new Date() },
    sets: [
      { status: 'completed', exercise: { id: 'e1' }, reps: 8, score: { count: 2, total: 160, depth: 170, stability: 150, trunk: 160, symmetry: 160 } },
      { status: 'completed', exercise: { id: 'e2' }, reps: 6, score: { count: 2, total: 80, depth: 170, stability: 60, trunk: 160, symmetry: 0, symmetryOffsetsMs: [100, 120] } },
    ],
  };
  const data = buildWorkoutCardData(row, 3);
  assert.equal(data?.avgScore, 80, 'only the presentable set enters the average');
  const onlyWithheld = buildWorkoutCardData({ ...row, sets: [row.sets[1]] }, 3);
  assert.equal(onlyWithheld?.avgScore, null);
});
