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

function allDeclarations(css: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(escaped + '\\s*\\{([^}]*)\\}', 'g'))].map(m => m[1]);
}

// 3) The settings + plan-editor save bars must NOT ride as position:sticky
//    inside the .motion-screen sub-scroller on phone/tablet widths: iOS
//    Safari composites sticky-in-subscroller separately and repaints the
//    tiles under it late during momentum scrolls (owner's 2026-11-12 screen
//    recording: chips overprinting under the save button, dead white band
//    above the bottom nav). Below 1100px both bars anchor to the viewport
//    like .training-controls; the desktop forms stay untouched.
test('settings save bar is viewport-anchored below 1100px, static on desktop', () => {
  const blocks = allDeclarations(gymCss, '.gym-settings-savebar');
  const mobile = blocks.find(b => /position:\s*fixed/.test(b) && /bottom:\s*calc\(80px \+ env\(safe-area-inset-bottom/.test(b));
  assert.ok(mobile, 'phone save bar must be fixed above the bottom nav (80px + safe-area)');
  const tablet = blocks.find(b => /position:\s*fixed/.test(b) && /left:\s*86px/.test(b));
  assert.ok(tablet, 'tablet save bar must be fixed beside the 86px rail');
  assert.ok(blocks.some(b => /position:\s*static/.test(b)), 'desktop save bar stays static (≥1100px rule)');
  const forms = allDeclarations(gymCss, '.gym-settings-form');
  assert.ok(forms.some(b => /padding-bottom:\s*96px/.test(b)), 'settings form clears the fixed bar');
});

test('plan editor save bar is viewport-anchored below 1100px, keyboard still unfixes it', () => {
  const blocks = allDeclarations(gymCss, '.gym-editor-save-bar');
  assert.ok(blocks.some(b => /position:\s*fixed/.test(b) && /bottom:\s*calc\(80px \+ env\(safe-area-inset-bottom/.test(b)), 'phone editor bar must be fixed above the bottom nav');
  assert.ok(blocks.some(b => /position:\s*fixed/.test(b) && /left:\s*86px/.test(b)), 'tablet editor bar must be fixed beside the rail');
  const keyboard = declarations(gymCss, '.keyboard-open .gym-editor-save-bar');
  assert.match(keyboard, /position:\s*static/);
});
