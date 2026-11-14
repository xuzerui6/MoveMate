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
const motionCss = fs.readFileSync(path.join(root, 'src/features/motion/motion.css'), 'utf8');

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

// 4) The avatar editor wraps showcase+customize in .look-layout (Avatar.tsx),
//    but the ≥1100px design-system block still placed the OLD direct children
//    (.avatar-showcase/.avatar-customize) into a 350px + 1fr page grid, so
//    .look-layout auto-placed into the 350px column and its own ≥900px
//    340px + 1fr grid crushed the editing column to a sliver (browser
//    inspection 2026-11-14). The wrapper must span the full page grid and
//    the obsolete direct-child placements must stay retired.
test('avatar editor look-layout spans the full page width at ≥1100px', () => {
  const layout = declarations(designSystem, '.motion-view .avatar-page .look-layout');
  assert.match(layout, /grid-column:\s*1\/-1/);
  for (const stale of ['.motion-view .avatar-page .avatar-showcase', '.motion-view .avatar-page .avatar-customize']) {
    const blocks = allDeclarations(designSystem, stale);
    assert.ok(!blocks.some(b => /grid-column|grid-row/.test(b)), `${stale} must not carry grid placement (retired with the .look-layout wrapper)`);
  }
});

// 5) The shared .page-header base rule is position:sticky, and its ≥769px
//    centering pair (left:50% + translateX(-50%)) only cancels out under
//    position:relative — the .motion-view override, where left:% resolves
//    against the container and translateX(%) against the header's own
//    width:100%. Under sticky the pair does NOT cancel: pages that render
//    Header OUTSIDE .motion-view (Friends /friends, InviteFriend
//    /invite/:code, GameSummary, BossFight, BossAtlas — browser inspection
//    2026-11-14) get shoved half a header-width off-screen at ≥769px,
//    leaving a blank band and an unclickable back button. The pair must
//    therefore be scoped to .motion-view .page-header only; bare headers
//    keep the shared max-width + margin:auto centering, which is safe
//    under both positioning models. (BossAtlas once carried a page-scoped
//    neutralization; the shared fix subsumes it.)

function mediaRules(css: string, query: string): Array<{selector: string; body: string}> {
  const rules: Array<{selector: string; body: string}> = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(`@media ${query}`, from);
    if (at < 0) break;
    const open = css.indexOf('{', at);
    let depth = 0;
    let end = css.length - 1;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) { end = i; break; }
    }
    const inner = css.slice(open + 1, end);
    for (const m of inner.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      rules.push({selector: m[1].trim(), body: m[2]});
    }
    from = end + 1;
  }
  return rules;
}

test('bare .page-header never receives the centering pair at ≥769px', () => {
  const rules = mediaRules(motionCss, '(min-width: 769px)').filter(r => r.selector === '.page-header');
  assert.ok(rules.length > 0, 'a ≥769px bare .page-header rule must exist (desktop width/centering)');
  for (const rule of rules) {
    assert.doesNotMatch(rule.body, /left\s*:/, 'bare .page-header must not set left under position:sticky');
    assert.doesNotMatch(rule.body, /transform\s*:/, 'bare .page-header must not be transformed under position:sticky');
  }
  const joined = rules.map(r => r.body).join('\n');
  assert.match(joined, /max-width:\s*var\(--max-width\)/, 'bare header keeps the shared max-width column');
  assert.match(joined, /margin:\s*0 auto/, 'bare header keeps margin:auto centering (safe under sticky)');
});

// 6) The "/friends still broken after the shared fix" report (2026-11-14)
//    was bisected in a real Chromium and traced to a STALE DOCUMENT, not a
//    page defect: the tab had been loaded before the fix deploy, and asset
//    retention keeps every old hashed bundle servable, so that document
//    kept running the pre-fix entry CSS while /invite — checked after a
//    fresh load — already used the fixed one. With current assets /friends
//    and /invite render identically (header hit-tests pass); with only the
//    pre-fix stylesheet swapped back in, BOTH break identically (header
//    x −45, back button off-screen) — one document can never show the
//    split outcome. What makes every generation safe is the invariant the
//    guards above only check inside motion.css's ≥769px blocks. Lock it
//    across ALL stylesheets and ALL blocks instead: any rule whose subject
//    is .page-header without the .motion-view scope (the only
//    position:relative header context) must never set left/transform —
//    under position:sticky, left:50% resolves against the scroll
//    container, gets clamped by the sticky constraint rectangle, and the
//    unclamped translateX(−50%) then shoves the header half a width
//    off-screen on every bare-header page at once.

function everyRule(css: string): Array<{selector: string; body: string}> {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Array<{selector: string; body: string}> = [];
  const walk = (text: string) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      const selector = text.slice(i, open).trim();
      let depth = 0;
      let end = text.length - 1;
      for (let j = open; j < text.length; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}' && --depth === 0) { end = j; break; }
      }
      const body = text.slice(open + 1, end);
      if (selector.startsWith('@media') || selector.startsWith('@supports')) walk(body);
      else if (selector && !selector.startsWith('@')) rules.push({selector, body});
      i = end + 1;
    }
  };
  walk(clean);
  return rules;
}

function cssFiles(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });
}

test('no stylesheet may put left/transform on a .page-header outside .motion-view scope', () => {
  const violations: string[] = [];
  for (const file of cssFiles(path.join(root, 'src'))) {
    for (const rule of everyRule(fs.readFileSync(file, 'utf8'))) {
      for (const selector of rule.selector.split(',').map(s => s.trim())) {
        const subject = selector.split(/[\s>+~]+/).filter(Boolean).pop() || '';
        if (!subject.includes('.page-header')) continue;
        if (selector.includes('.motion-view')) continue;
        if (/(?:^|;)\s*left\s*:/.test(rule.body) || /(?:^|;)\s*transform\s*:/.test(rule.body)) {
          violations.push(`${path.relative(root, file)} :: ${selector} { ${rule.body.trim().slice(0, 80)} }`);
        }
      }
    }
  }
  assert.deepEqual(violations, [], 'bare .page-header rules must stay free of left/transform (sticky centering-pair trap)');
});

// 7) The avatar editor's two phone-width sticky pieces ghosted/trailed on
//    the owner's iPhone (2026-11-14 recording, confirmed live by the owner):
//    the editing showcase rendered doubled while scrolling and the save bar
//    trailed the scroll. Same mechanism as (3): both live inside the
//    .motion-screen sub-scroller, whose sticky elements iOS Safari
//    composites separately, repainting the tiles under them late during
//    momentum scrolls. The save bar therefore anchors to the viewport
//    exactly like the gym editor bar and the page reserves bottom room for
//    it; the showcase gives up pinning on phone widths and scrolls with
//    the page (its compact editing size stays; every part card's thumbnail
//    already renders the full resulting look, so the combo stays visible
//    per-card). Preset-slot action labels must never wrap mid-word on the
//    narrow cards (「存当前搭/配」, same recording).
test('avatar editor phone save bar is viewport-anchored, showcase unpinned', () => {
  const uncommented = motionCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const mobile = mediaRules(uncommented, '(max-width:700px)');
  const bars = mobile.filter(r => r.selector === '.motion-view .look-save-bar');
  assert.ok(bars.some(r => /position:\s*fixed/.test(r.body) && /bottom:\s*calc\(80px \+ env\(safe-area-inset-bottom/.test(r.body)), 'phone look-save-bar must be fixed above the bottom nav (80px + safe-area)');
  assert.ok(!bars.some(r => /position:\s*sticky/.test(r.body)), 'phone look-save-bar must not be sticky inside the sub-scroller');
  const showcases = mobile.filter(r => r.selector === '.motion-view .avatar-showcase.editing');
  assert.ok(showcases.length > 0, 'editing showcase rule must exist at phone widths');
  assert.ok(!showcases.some(r => /position:\s*sticky/.test(r.body)), 'editing showcase must not be sticky on phone widths (iOS sub-scroller ghosting)');
  const pages = mobile.filter(r => r.selector === '.motion-view .avatar-page');
  assert.ok(pages.some(r => /padding-bottom:\s*120px/.test(r.body)), 'avatar page clears the fixed save bar');
});

test('preset slot action labels never wrap mid-word', () => {
  const rule = declarations(motionCss, '.motion-view .preset-actions button');
  assert.match(rule, /white-space:\s*nowrap/);
});

test('.motion-view .page-header keeps exactly its ≥769px rendering', () => {
  const rules = mediaRules(motionCss, '(min-width: 769px)').filter(r => r.selector === '.motion-view .page-header');
  const joined = rules.map(r => r.body).join('\n');
  assert.match(joined, /left:\s*50%/, '.motion-view header keeps the centering pair (cancels under position:relative)');
  assert.match(joined, /transform:\s*translateX\(-50%\)/);
  const base = declarations(motionCss, '.page-header');
  assert.match(base, /position:\s*sticky/, 'base header stays sticky for bare pages');
  const overrides = allDeclarations(motionCss, '.motion-view .page-header');
  assert.ok(overrides.some(b => /position:\s*relative/.test(b)), '.motion-view override keeps position:relative');
});
