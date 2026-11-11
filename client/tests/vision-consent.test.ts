import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadVisionConsent, saveVisionConsent} from '../src/features/motion/lib/visionConsent';

test('vision consent defaults to local-only and respects a stored choice', (t) => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }}});
  t.after(() => { Reflect.deleteProperty(globalThis, 'localStorage'); });
  assert.equal(loadVisionConsent(), false);
  saveVisionConsent(true);
  assert.equal(loadVisionConsent(), true);
  saveVisionConsent(false);
  assert.equal(loadVisionConsent(), false);
  store.set('movemate:vision-consent', 'bogus');
  assert.equal(loadVisionConsent(), false);
});
