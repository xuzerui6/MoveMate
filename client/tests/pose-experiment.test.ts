import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planPoseSession} from '../src/features/motion/lib/poseCompatibility';
import {loadPoseModelPreference, savePoseModelPreference} from '../src/features/motion/lib/adaptiveRecognition';

test('default plan preserves shipped behaviour on both platform classes', () => {
  assert.deepEqual(planPoseSession('auto', true, false), {model: 'lite', mainThread: true, experiment: null});
  assert.deepEqual(planPoseSession('auto', false, false), {model: 'full', mainThread: false, experiment: null});
});

test('forceLite and the Lite choice always win and stay on the main thread', () => {
  assert.deepEqual(planPoseSession('heavy', false, true), {model: 'lite', mainThread: true, experiment: null});
  assert.deepEqual(planPoseSession('lite', false, false), {model: 'lite', mainThread: true, experiment: null});
  assert.deepEqual(planPoseSession('lite', true, false), {model: 'lite', mainThread: true, experiment: null});
});

test('experiment variants are honoured on iOS via the main thread and elsewhere via workers', () => {
  assert.deepEqual(planPoseSession('full', true, false), {model: 'full', mainThread: true, experiment: 'full'});
  assert.deepEqual(planPoseSession('heavy', true, false), {model: 'heavy', mainThread: true, experiment: 'heavy'});
  assert.deepEqual(planPoseSession('full', false, false), {model: 'full', mainThread: false, experiment: 'full'});
  assert.deepEqual(planPoseSession('heavy', false, false), {model: 'heavy', mainThread: false, experiment: 'heavy'});
});

test('pose model preference round-trips through device storage and defaults to auto', (t) => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }}});
  t.after(() => { Reflect.deleteProperty(globalThis, 'localStorage'); });
  assert.equal(loadPoseModelPreference(), 'auto');
  savePoseModelPreference('heavy');
  assert.equal(loadPoseModelPreference(), 'heavy');
  savePoseModelPreference('full');
  assert.equal(loadPoseModelPreference(), 'full');
  savePoseModelPreference('auto');
  assert.equal(loadPoseModelPreference(), 'auto');
  store.set('movemate:pose-model-experiment', 'bogus');
  assert.equal(loadPoseModelPreference(), 'auto');
});
