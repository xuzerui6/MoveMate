import test from 'node:test';
import assert from 'node:assert/strict';
import { animatedValueAt, easeOutCubic } from '../src/hooks/animateValue';

test('easeOutCubic clamps to [0,1] and is monotonic with fast start', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutCubic(-0.5), 0);
  assert.equal(easeOutCubic(1.5), 1);
  // 快进慢停：前半程走完大半
  assert.ok(easeOutCubic(0.5) > 0.8);
  assert.ok(easeOutCubic(0.25) < easeOutCubic(0.5));
  assert.ok(easeOutCubic(0.5) < easeOutCubic(0.75));
});

test('animatedValueAt hits endpoints and interpolates with easeOut', () => {
  assert.equal(animatedValueAt(0, 86, 0, 480), 0);
  assert.equal(animatedValueAt(0, 86, -10, 480), 0);
  assert.equal(animatedValueAt(0, 86, 480, 480), 86);
  assert.equal(animatedValueAt(0, 86, 9999, 480), 86);
  const mid = animatedValueAt(0, 86, 240, 480);
  assert.ok(mid > 86 * 0.8 && mid < 86);
});

test('animatedValueAt supports count-down direction and zero duration', () => {
  assert.equal(animatedValueAt(20, 5, 0, 320), 20);
  assert.equal(animatedValueAt(20, 5, 320, 320), 5);
  const mid = animatedValueAt(20, 5, 160, 320);
  assert.ok(mid > 5 && mid < 20);
  assert.equal(animatedValueAt(3, 9, 100, 0), 9);
  assert.equal(animatedValueAt(3, 9, 100, -5), 9);
});
