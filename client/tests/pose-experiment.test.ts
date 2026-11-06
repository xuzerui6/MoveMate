import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planPoseSession} from '../src/features/motion/lib/poseCompatibility';
import {loadPoseModelPreference, savePoseModelPreference} from '../src/features/motion/lib/adaptiveRecognition';

const LADDER = [{model: 'full', path: 'worker'}, {model: 'full', path: 'main'}, {model: 'lite', path: 'main'}];

test('default plan is the adaptive ladder on both platform classes', () => {
  assert.deepEqual(planPoseSession('auto', true, false), {experiment: null, ladder: LADDER, startRung: 0, selection: 'probe'});
  assert.deepEqual(planPoseSession('auto', false, false), {experiment: null, ladder: LADDER, startRung: 0, selection: 'probe'});
});

test('a cached verdict starts the ladder at the proven rung', () => {
  assert.deepEqual(planPoseSession('auto', true, false, {rung: 'full-main', at: 1}), {experiment: null, ladder: LADDER, startRung: 1, selection: 'cache'});
  assert.deepEqual(planPoseSession('auto', false, false, {rung: 'lite-main', at: 1}), {experiment: null, ladder: LADDER, startRung: 2, selection: 'cache'});
  // A verdict naming a rung outside the ladder is ignored.
  assert.deepEqual(planPoseSession('auto', true, false, {rung: 'heavy-main', at: 1}), {experiment: null, ladder: LADDER, startRung: 0, selection: 'probe'});
});

test('forceLite and the Lite choice always win and stay on the main thread', () => {
  const floor = {experiment: null, ladder: [{model: 'lite', path: 'main'}], startRung: 0};
  assert.deepEqual(planPoseSession('heavy', false, true), {...floor, selection: 'forced'});
  assert.deepEqual(planPoseSession('lite', false, false), {...floor, selection: 'manual'});
  assert.deepEqual(planPoseSession('lite', true, false), {...floor, selection: 'manual'});
});

test('experiment variants are honoured on iOS via the main thread and elsewhere via workers, with the Lite floor below', () => {
  assert.deepEqual(planPoseSession('full', true, false), {experiment: 'full', ladder: [{model: 'full', path: 'main'}, {model: 'lite', path: 'main'}], startRung: 0, selection: 'manual'});
  assert.deepEqual(planPoseSession('heavy', true, false), {experiment: 'heavy', ladder: [{model: 'heavy', path: 'main'}, {model: 'lite', path: 'main'}], startRung: 0, selection: 'manual'});
  assert.deepEqual(planPoseSession('full', false, false), {experiment: 'full', ladder: [{model: 'full', path: 'worker'}, {model: 'lite', path: 'main'}], startRung: 0, selection: 'manual'});
  assert.deepEqual(planPoseSession('heavy', false, false), {experiment: 'heavy', ladder: [{model: 'heavy', path: 'worker'}, {model: 'lite', path: 'main'}], startRung: 0, selection: 'manual'});
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
