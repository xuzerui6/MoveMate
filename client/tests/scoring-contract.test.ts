import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtendedExerciseTracker } from '../src/features/motion/lib/extendedRecognition';
import { createRecognitionTracker, newDemonstrationPose } from '../src/features/motion/lib/recognition';
import { restoredSetMetrics } from '../src/features/gym/workoutSync';
import { buildGymSetCard } from '../src/features/share/cardData';
import { buildSetReveal } from '../src/features/motion/lib/companionCopy';
import type { NormalizedLandmark as Point } from '@mediapipe/tasks-vision';

/** Step-3 scoring contract fixtures (2026-11-08): categorical symmetry
 * emission, cannot-assess axes excluded from totals, the degraded-framing
 * session state, and the stored-set consumers (restore + share card). */

const rot2 = (x: number, y: number, rad: number): [number, number] => [x * Math.cos(rad) - y * Math.sin(rad), x * Math.sin(rad) + y * Math.cos(rad)];
function curlPose(leftElbow: number, rightElbow: number, upperDeg = 0): Point[] {
  const p: Point[] = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));
  const put = (i: number, x: number, y: number) => { p[i] = { x, y, z: 0, visibility: 1 }; };
  put(0, .5, .16);
  const elbows = [leftElbow, rightElbow];
  for (const o of [0, 1]) {
    const sx = .40 + o * .20, dir = o ? -1 : 1, phi = upperDeg * Math.PI / 180;
    put(11 + o, sx, .30); put(23 + o, sx, .56); put(25 + o, sx, .74); put(27 + o, sx, .92);
    const [ux, uy] = rot2(0, 1, dir * phi);
    const ex = sx + ux * .18, ey = .30 + uy * .18; put(13 + o, ex, ey);
    const [fx, fy] = rot2(ux, uy, -dir * (180 - elbows[o]) * Math.PI / 180);
    put(15 + o, ex + fx * .18, ey + fy * .18);
  }
  return p;
}

test('hammer totals renormalize over the three numeric axes — symmetry contributes nothing', () => {
  const tracker = new ExtendedExerciseTracker('hammer_curl', 20, {}, true);
  const step = 1000 / 24; let t = 0;
  const feed = (l: number, r: number) => { const raw = curlPose(l, r); tracker.update(raw, t, 1, structuredClone(raw)); t += step; };
  for (let c = 0; c < 63; c++) feed(160, 160);
  const P = 48;
  const wave = (k: number) => { const u = (k % P) / P; return 160 - 81 * (1 - Math.cos(2 * Math.PI * u)) / 2; };
  // Perfectly synchronized bilateral curls: merged pairs, offsets ≈ 0.
  for (let rep = 0; rep < 2; rep++) for (let k = 0; k < P; k++) feed(wave(k), wave(k));
  for (let c = 0; c < 40; c++) feed(160, 160);
  assert.equal(tracker.metrics.reps, 2);
  assert.deepEqual(tracker.metrics.axisAssessment?.symmetry, { kind: 'category', category: 'sync' });
  const fb = tracker.metrics.formBreakdown;
  // ±1: per-rep scores round from unrounded breakdown values; the set's
  // rounded axis means can sit one point off the recomputed total.
  const expected = Math.round((fb.depth * .35 + fb.stability * .25 + fb.trunk * .2) / .8);
  assert.ok(Math.abs(tracker.metrics.formScore - expected) <= 1, `formScore ${tracker.metrics.formScore} should be the renormalized ${expected}`);
  // The old four-axis total would read lower (symmetry number absent = the
  // placeholder 0 must not leak into the average).
  const leaked = Math.round(fb.depth * .35 + fb.stability * .25 + fb.trunk * .2 + 0 * .2);
  assert.ok(tracker.metrics.formScore > leaked, 'the placeholder 0 symmetry must not drag the total');
});

test('front raise totals renormalize over stability and trunk only', () => {
  const tracker = createRecognitionTracker('front_raise', 20);
  let now = 0; const step = 100;
  const feed = (stage: 'neutral' | 'peak', ms: number) => {
    const input = newDemonstrationPose('front_raise', stage);
    for (let t = 0; t < ms; t += step) { tracker.update(structuredClone(input.landmarks), now, 1, structuredClone(input.worldLandmarks)); now += step; }
  };
  feed('neutral', 3000);
  assert.ok(tracker.metrics.poseFeedback.calibrated);
  feed('peak', 1200); feed('neutral', 1200);
  assert.equal(tracker.metrics.reps, 1);
  assert.equal(tracker.metrics.scoreAccumulator.count, 1);
  const fb = tracker.metrics.formBreakdown;
  const expected = Math.round((fb.stability * .25 + fb.trunk * .2) / .45);
  assert.ok(Math.abs(tracker.metrics.formScore - expected) <= 1, `formScore ${tracker.metrics.formScore} should be the renormalized ${expected}`);
  const bands = tracker.metrics.scoreAccumulator.depthBandCounts;
  const tallies = (bands?.left ? Object.values(bands.left).reduce((a: number, b: any) => a + (b || 0), 0) : 0) + (bands?.right ? Object.values(bands.right).reduce((a: number, b: any) => a + (b || 0), 0) : 0);
  assert.equal(tallies, 2, 'the bilateral demo raise records one band per side');
  assert.equal(tracker.metrics.axisAssessment?.depth.kind, 'bands');
  assert.deepEqual(tracker.metrics.axisAssessment?.symmetry, { kind: 'unassessable', reason: 'view' });
});

test('single-side movements (romanian deadlift) emit no symmetry number and exclude it from the total', () => {
  const tracker = createRecognitionTracker('romanian_deadlift', 20);
  let now = 0; const step = 100;
  const feed = (stage: 'neutral' | 'peak', ms = 1200) => {
    const input = newDemonstrationPose('romanian_deadlift', stage);
    for (let t = 0; t < ms; t += step) { tracker.update(structuredClone(input.landmarks), now, 1, structuredClone(input.worldLandmarks)); now += step; }
  };
  feed('neutral', 3200);
  assert.ok(tracker.metrics.poseFeedback.calibrated, tracker.metrics.feedback);
  feed('peak'); feed('neutral');
  assert.equal(tracker.metrics.reps, 1);
  assert.equal(tracker.metrics.scoreAccumulator.count, 1);
  assert.deepEqual(tracker.metrics.axisAssessment?.symmetry, { kind: 'unassessable', reason: 'single-side' });
  assert.equal(tracker.metrics.scoreAccumulator.symmetry, 0);
  const fb = tracker.metrics.formBreakdown;
  const expected = Math.round((fb.depth * .35 + fb.stability * .25 + fb.trunk * .2) / .8);
  assert.ok(Math.abs(tracker.metrics.formScore - expected) <= 1, `formScore ${tracker.metrics.formScore} should be the renormalized ${expected}`);
  assert.equal(tracker.metrics.correctionCounts.poor_coordination, 0);
});

function raiseWorldArmsDown(): Point[] {
  const w: Point[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  const put = (i: number, x: number, y: number, z: number) => { w[i] = { x, y, z, visibility: 1 }; };
  put(0, 0, -.15, -.1);
  for (const o of [0, 1]) {
    const sx = o ? .2 : -.2, v = 10 * Math.PI / 180, cy = Math.cos(v), sz = -Math.sin(v);
    put(11 + o, sx, 0, 0); put(23 + o, sx, .4, 0); put(13 + o, sx, .2 * cy, .2 * sz); put(15 + o, sx, .45 * cy, .45 * sz); put(25 + o, sx, .75, 0); put(27 + o, sx, 1.05, 0);
  }
  return w;
}
const plainImage = (): Point[] => Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }));

test('degraded framing becomes the cannot-assess session state after 3 s, and a measurable frame exits it', () => {
  const tracker = new ExtendedExerciseTracker('front_raise', 20, {}, true);
  const step = 1000 / 24; let t = 0;
  const world = raiseWorldArmsDown();
  const bad = () => { const img = plainImage(); img[0] = { ...img[0], x: 1.2 }; tracker.update(img, t, 1, structuredClone(world)); t += step; };
  const good = () => { tracker.update(plainImage(), t, 1, structuredClone(world)); t += step; };
  // A short burst stays an ordinary tracking loss — no state change.
  for (let c = 0; c < 19; c++) bad(); // ≈800 ms
  assert.notEqual(tracker.diagnostics.stage, 'cannot_assess');
  // Sustained past 3 s: the state names itself, with the reframe cue, and
  // the unscored set presents every axis as unassessable.
  for (let c = 0; c < 65; c++) bad(); // ≈2.7 s more (total ≈3.5 s)
  assert.equal(tracker.diagnostics.stage, 'cannot_assess');
  assert.match(tracker.metrics.feedback, /这个角度评不了/);
  assert.match(tracker.metrics.feedback, /头和上半身/);
  assert.equal(tracker.metrics.reps, 0);
  for (const k of ['depth', 'stability', 'trunk', 'symmetry'] as const)
    assert.deepEqual(tracker.metrics.axisAssessment?.[k], { kind: 'unassessable', reason: 'framing' });
  // Measurable frames again: the state exits and calibration completes.
  for (let c = 0; c < 80; c++) good(); // ≈3.3 s of clean start pose
  assert.equal(tracker.diagnostics.stage, 'ready');
  assert.equal(tracker.metrics.poseFeedback.calibrated, true);
});

test('restored sets present step-3 states instead of reverting them to numbers', () => {
  // Stored map wins outright.
  const stored = { kind: 'category', category: 'slight' } as const;
  const withStored = restoredSetMetrics({ reps: 3, score: { count: 3, total: 270, depth: 280, stability: 260, trunk: 270, symmetry: 0, symmetryOffsetsMs: [400, 420, 380], axisAssessment: { depth: { kind: 'numeric' }, stability: { kind: 'numeric' }, trunk: { kind: 'numeric' }, symmetry: stored } } });
  assert.deepEqual(withStored.axisAssessment?.symmetry, stored);
  // No stored map: rebuilt from the recorded offsets (median 400 → 略有错峰).
  const fromOffsets = restoredSetMetrics({ reps: 3, score: { count: 3, total: 270, depth: 280, stability: 260, trunk: 270, symmetry: 0, symmetryOffsetsMs: [900, 100, 400] } });
  assert.deepEqual(fromOffsets.axisAssessment?.symmetry, { kind: 'category', category: 'slight' });
  // Axis-validity suspension (2026-11-09): offsets exist only for hammer
  // sets, whose stability came from the suspended control channel — the
  // rebuilt map carries the suspension too (see axis-validity.test.ts).
  assert.deepEqual(fromOffsets.axisAssessment?.stability, { kind: 'unassessable', reason: 'control' });
  // Front-raise tallies rebuild bands + unassessable symmetry.
  const fromBands = restoredSetMetrics({ reps: 2, score: { count: 2, total: 160, depth: 0, stability: 170, trunk: 150, symmetry: 0, depthBandCounts: { left: { shoulder: 2, below: 1 }, right: { below: 1 } } } });
  assert.deepEqual(fromBands.axisAssessment?.depth, { kind: 'bands', left: 'shoulder', right: 'below' });
  assert.deepEqual(fromBands.axisAssessment?.symmetry, { kind: 'unassessable', reason: 'view' });
  // Pre-contract sets carry no evidence: no map is invented for them.
  const legacy = restoredSetMetrics({ reps: 2, score: { count: 2, total: 190, depth: 180, stability: 190, trunk: 180, symmetry: 200 } });
  assert.equal(legacy.axisAssessment, undefined);
  assert.equal(legacy.formBreakdown.symmetry, 100);
});

test('share cards render step-3 states as text, never as a fabricated number', () => {
  const hammer = buildGymSetCard({ reps: 6, exercise: { name: 'hammer_curl', nameZh: '锤式弯举' }, score: { count: 6, total: 540, depth: 560, stability: 520, trunk: 550, symmetry: 0, symmetryOffsetsMs: [80, 90, 70, 85, 95, 75] } }, 0, new Date());
  assert.equal(hammer.axes?.[3].text, '同步');
  const raise = buildGymSetCard({ reps: 2, exercise: { name: 'front_raise', nameZh: '前平举' }, score: { count: 2, total: 170, depth: 0, stability: 180, trunk: 160, symmetry: 0, depthBandCounts: { left: { shoulder: 2 } } } }, 0, new Date());
  assert.equal(raise.axes?.[0].text, '左 到达肩高');
  assert.equal(raise.axes?.[3].text, '这个角度评不了');
});

test('set reveal ignores non-numeric axes when comparing sets', () => {
  const fb = (depth: number, stability: number, trunk: number, symmetry: number) => ({ depth, stability, trunk, symmetry });
  // Symmetry "fell" 90 → 0 only because it stopped being a number; over the
  // numeric axes the sets are identical, so no regression story may be told.
  const r = buildSetReveal(fb(80, 70, 70, 0), fb(80, 70, 70, 90), { reps: 12, unit: '次', scored: true, numericAxes: ['depth', 'stability', 'trunk'] });
  assert.match(r.progressLine, /一样稳/);
  const naive = buildSetReveal(fb(80, 70, 70, 0), fb(80, 70, 70, 90), { reps: 12, unit: '次', scored: true });
  assert.doesNotMatch(naive.progressLine, /一样稳/);
});
