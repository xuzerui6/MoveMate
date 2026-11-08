import test from 'node:test';
import assert from 'node:assert/strict';
import { ExtendedExerciseTracker } from '../src/features/motion/lib/extendedRecognition';
import { createRecognitionTracker, newDemonstrationPose } from '../src/features/motion/lib/recognition';
import { numericCoverageOf, totalWithheld, type AxisAssessments } from '../src/features/motion/lib/axisAssessment';
import { restoredSetMetrics } from '../src/features/gym/workoutSync';
import { buildGymSetCard, buildMotionSetCard, buildWorkoutCardData } from '../src/features/share/cardData';
import type { NormalizedLandmark as Point } from '@mediapipe/tasks-vision';

/** Axis-validity suspension fixtures (2026-11-09, Codex round-3):
 * the hammer family's stability axis is unassessable ('control'), set
 * totals are presented only at ≥60% numeric coverage, and the internal
 * score computation (formScore / breakdown / XP inputs) is untouched. */

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

test('coverage rule: totals present only at ≥60% numeric weight', () => {
  const map = (depth: any, stability: any, trunk: any, symmetry: any): AxisAssessments => ({ depth, stability, trunk, symmetry });
  const num = { kind: 'numeric' } as const;
  assert.equal(numericCoverageOf(undefined), 1);
  assert.equal(totalWithheld(undefined), false);
  assert.equal(totalWithheld(map(num, num, num, num)), false);
  // Exactly 60% (depth + stability): presented.
  assert.equal(numericCoverageOf(map(num, num, { kind: 'unassessable', reason: 'view' }, { kind: 'category', category: 'sync' })), .6);
  assert.equal(totalWithheld(map(num, num, { kind: 'unassessable', reason: 'view' }, { kind: 'category', category: 'sync' })), false);
  // Hammer frontal after the suspension (depth + trunk = .55): withheld.
  assert.equal(totalWithheld(map(num, { kind: 'unassessable', reason: 'control' }, num, { kind: 'category', category: 'sync' })), true);
  // Front raise (stability + trunk = .45): withheld.
  assert.equal(totalWithheld(map({ kind: 'bands', left: 'shoulder' }, num, num, { kind: 'unassessable', reason: 'view' })), true);
  // Single-side family (depth + stability + trunk = .80): presented.
  assert.equal(totalWithheld(map(num, num, num, { kind: 'unassessable', reason: 'single-side' })), false);
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
  assert.deepEqual(tracker.metrics.axisAssessment?.symmetry, { kind: 'category', category: 'sync' });
  // Coverage .55 → the total is withheld at presentation level...
  assert.equal(numericCoverageOf(tracker.metrics.axisAssessment), .55);
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
  const feed = (e: number, u: number) => { const raw = curlPose(e, e, u); tracker.update(raw, t, 1, structuredClone(raw)); t += step; };
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
});

test('a restored pre-contract hammer set keeps its historical numbers', () => {
  const tracker = new ExtendedExerciseTracker('hammer_curl', 20, {
    reps: 2,
    scoreAccumulator: { count: 2, total: 180, depth: 190, stability: 170, trunk: 180, symmetry: 172, symmetryValues: [85, 87] },
  }, true);
  assert.equal(tracker.metrics.axisAssessment?.stability.kind, 'numeric');
  assert.equal(tracker.metrics.axisAssessment?.symmetry.kind, 'numeric');
  assert.equal(totalWithheld(tracker.metrics.axisAssessment), false);
});

test('front raise: the set total is withheld by coverage (.45) while bands and internal score stand', () => {
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
  assert.equal(totalWithheld(tracker.metrics.axisAssessment), true);
  assert.equal(feedbackAtRep, '好，第 1 次记下啦');
  assert.ok(tracker.metrics.formScore > 0, 'internal formScore still computed');
});

test('restored hammer sets (offsets, no stored map) present the suspension; cards withhold the total', () => {
  const restored = restoredSetMetrics({ reps: 3, score: { count: 3, total: 270, depth: 280, stability: 260, trunk: 270, symmetry: 0, symmetryOffsetsMs: [400, 420, 380] } });
  assert.deepEqual(restored.axisAssessment?.stability, { kind: 'unassessable', reason: 'control' });
  assert.equal(restored.formScore, 90, 'the internal restored total is unchanged');
  assert.equal(totalWithheld(restored.axisAssessment), true);

  const card = buildGymSetCard({ reps: 6, exercise: { name: 'hammer_curl', nameZh: '锤式弯举' }, score: { count: 6, total: 540, depth: 560, stability: 520, trunk: 550, symmetry: 0, symmetryOffsetsMs: [80, 90, 70, 85, 95, 75] } }, 0, new Date());
  assert.equal(card.totalWithheld, true);
  assert.equal(card.score, null);
  assert.equal(card.axes?.[1].text, '暂时评不了');
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
