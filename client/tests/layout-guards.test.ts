import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Source guards for two layout defects found by visual inspection:
// 1) The sidebar user card (≥1100px) wrapped the campus name inside its
//    parentheses — 「校区）」 dangled alone on a third line — because the
//    <small> campus line, unlike the nickname <b> above it, had no
//    nowrap/ellipsis treatment.
// 2) On the workout page the left column (.gym-current) is much shorter
//    than the controls column before the camera starts, leaving a dead
//    hole under the exercise info; the column distributes its content by
//    pushing the instructions block to its bottom.
const root = path.resolve(import.meta.dirname, '..');
const designSystem = fs.readFileSync(path.join(root, 'src/design-system.css'), 'utf8');
const gymCss = fs.readFileSync(path.join(root, 'src/features/gym/gym.css'), 'utf8');

function declarations(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
  assert.ok(match, `${selector} rule is missing`);
  return match[1];
}

test('sidebar campus label cannot wrap mid-parenthesis', () => {
  const rule = declarations(designSystem, '.sidebar-bottom small');
  assert.match(rule, /white-space:\s*nowrap/);
  assert.match(rule, /text-overflow:\s*ellipsis/);
  assert.match(rule, /overflow:\s*hidden/);
});

test('workout left column distributes content instead of leaving a dead hole', () => {
  const column = declarations(gymCss, '.gym-current');
  assert.match(column, /display:\s*flex/);
  assert.match(column, /flex-direction:\s*column/);
  const instructions = declarations(gymCss, '.gym-current .gym-instructions');
  assert.match(instructions, /margin-top:\s*auto/);
});

test('prep set-plan card fills the left column middle with equal-height rows', () => {
  const card = declarations(gymCss, '.gym-set-plan');
  assert.match(card, /display:\s*flex/);
  assert.match(card, /flex-direction:\s*column/);
  assert.match(card, /flex:\s*1/);
  const row = declarations(gymCss, '.gym-set-plan-list li');
  assert.match(row, /flex:\s*1/);
  const current = declarations(gymCss, '.gym-set-plan-list li.is-current');
  assert.match(current, /background:\s*var\(--mint\)/);
});
