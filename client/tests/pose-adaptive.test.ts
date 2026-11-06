import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AUTO_POSE_LADDER, loadPoseVerdict, savePoseVerdict, poseRungId} from '../src/features/motion/lib/poseCompatibility';
import {evaluateProbe, sustainedDegradation} from '../src/features/motion/lib/poseProtocol';

test('the automatic ladder is best-first, ends at the Lite floor and never includes Heavy', () => {
  assert.deepEqual(AUTO_POSE_LADDER.map(poseRungId), ['full-worker', 'full-main', 'lite-main']);
  assert.ok(AUTO_POSE_LADDER.every(rung => rung.model !== 'heavy'));
});

test('evaluateProbe passes a fast warm path and names the failing criterion otherwise', () => {
  const fast = Array.from({length: 70}, (_, i) => i * 33);
  assert.deepEqual(evaluateProbe(fast, fast.map(() => 30)), {pass: true, reason: null, fps: 1000 / 33, latency95: 30});
  const sparse = Array.from({length: 13}, (_, i) => i * 200);
  const fpsFail = evaluateProbe(sparse, sparse.map(() => 30));
  assert.equal(fpsFail.pass, false);
  assert.equal(fpsFail.reason, 'fps');
  const late = evaluateProbe(fast, fast.map(() => 250));
  assert.equal(late.pass, false);
  assert.equal(late.reason, 'frame-age');
  assert.equal(evaluateProbe([1000], [30]).reason, 'stall');
  assert.equal(evaluateProbe([], []).reason, 'stall');
  assert.equal(evaluateProbe([0, 500], [30, 30]).reason, 'stall');
});

test('sustainedDegradation maps rolling metrics to the step-down reason', () => {
  assert.equal(sustainedDegradation(7.9, 30), 'fps');
  assert.equal(sustainedDegradation(15, 250), 'frame-age');
  assert.equal(sustainedDegradation(15, 100), null);
  assert.equal(sustainedDegradation(5, 300), 'fps');
  assert.equal(sustainedDegradation(8, 200), null);
});

function stubStorage(t: any) {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); }}});
  t.after(() => { Reflect.deleteProperty(globalThis, 'localStorage'); });
  return store;
}

test('pose verdict round-trips through device storage', (t) => {
  stubStorage(t);
  const now = 1_000_000_000;
  assert.equal(loadPoseVerdict(now), null);
  savePoseVerdict('full-worker', now);
  assert.deepEqual(loadPoseVerdict(now), {rung: 'full-worker', at: now});
  savePoseVerdict('full-main', now);
  assert.deepEqual(loadPoseVerdict(now), {rung: 'full-main', at: now});
});

test('pose verdict expires: a week for a better rung, a day for the floor', (t) => {
  stubStorage(t);
  const now = 1_000_000_000, day = 24 * 60 * 60 * 1000;
  savePoseVerdict('full-worker', now - 6 * day);
  assert.deepEqual(loadPoseVerdict(now), {rung: 'full-worker', at: now - 6 * day});
  savePoseVerdict('full-worker', now - 8 * day);
  assert.equal(loadPoseVerdict(now), null);
  savePoseVerdict('lite-main', now - 23 * 60 * 60 * 1000);
  assert.deepEqual(loadPoseVerdict(now), {rung: 'lite-main', at: now - 23 * 60 * 60 * 1000});
  savePoseVerdict('lite-main', now - 25 * 60 * 60 * 1000);
  assert.equal(loadPoseVerdict(now), null);
});

test('pose verdict rejects rungs outside the ladder and corrupt payloads', (t) => {
  const store = stubStorage(t);
  const now = 1_000_000_000;
  savePoseVerdict('heavy-main', now);
  assert.equal(loadPoseVerdict(now), null);
  store.set('movemate:pose-path-verdict-v1', 'not json');
  assert.equal(loadPoseVerdict(now), null);
  store.set('movemate:pose-path-verdict-v1', JSON.stringify({rung: 'full-worker'}));
  assert.equal(loadPoseVerdict(now), null);
  store.set('movemate:pose-path-verdict-v1', JSON.stringify({rung: 'full-worker', at: now + 1000}));
  assert.equal(loadPoseVerdict(now), null);
});
