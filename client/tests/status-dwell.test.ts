import assert from 'node:assert/strict';
import test from 'node:test';
import { createDwellState, dwellPush } from '../src/features/motion/lib/statusDwell.ts';

// Display dwell (2026-11-09 walking test): a state line may not flip faster
// than a human can read, but a genuine, persistent state still lands.
test('first value shows immediately', () => {
  const s = createDwellState();
  assert.equal(dwellPush(s, '正在找你 · 站好就行', 1000), '正在找你 · 站好就行');
});

test('a flapping value never reaches the display', () => {
  const s = createDwellState();
  assert.equal(dwellPush(s, '正在找你 · 站好就行', 0), '正在找你 · 站好就行');
  // Alternate every 100ms for 10 seconds: the display must not move.
  for (let t = 100; t <= 10000; t += 100) {
    const v = (t / 100) % 2 === 0 ? '我有点看不清' : '正在找你 · 站好就行';
    assert.equal(dwellPush(s, v, t), '正在找你 · 站好就行', `flap leaked at t=${t}`);
  }
});

test('a persistent new value lands once it outlasts candidate and shown minima', () => {
  const s = createDwellState();
  dwellPush(s, '正在找你 · 站好就行', 0);
  // Candidate appears at 2000 (shown minimum already met) and persists.
  assert.equal(dwellPush(s, '我有点看不清', 2000), '正在找你 · 站好就行');
  assert.equal(dwellPush(s, '我有点看不清', 2300), '正在找你 · 站好就行');
  assert.equal(dwellPush(s, '我有点看不清', 2400), '我有点看不清');
});

test('shown minimum holds a fresh value before it can be replaced', () => {
  const s = createDwellState();
  dwellPush(s, '甲', 0);
  dwellPush(s, '乙', 2000);
  assert.equal(dwellPush(s, '乙', 2400), '乙');
  // A third value arriving 100ms later cannot displace 乙 before its 1500ms.
  dwellPush(s, '丙', 2500);
  assert.equal(dwellPush(s, '丙', 2900), '乙');
  assert.equal(dwellPush(s, '丙', 3900), '丙');
});
