import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/design-system.css', import.meta.url), 'utf8');

// 真机问题（iPhone / iOS 26）：编辑资料时打开键盘，视觉视口被 iOS 平移后，
// 页面顶部被状态栏/灵动岛压住、表单与键盘之间出现大片空白、保存按钮滚不到。
// 壳层必须同时跟随 visualViewport 的高度与 offsetTop，而不能只跟高度。
test('shell publishes the visual viewport offset, not just its height', () => {
  assert.match(layout, /setProperty\('--viewport-height',\(viewport\?\.height\|\|window\.innerHeight\)\+'px'\)/);
  assert.match(layout, /setProperty\('--viewport-offset-top',\(viewport\?\.offsetTop\|\|0\)\+'px'\)/);
  // offsetTop 在键盘平移时经由 visualViewport 的 scroll 事件变化，必须订阅它而不是只听 resize
  assert.match(layout, /viewport\?\.addEventListener\('resize',sync\)/);
  assert.match(layout, /viewport\?\.addEventListener\('scroll',sync\)/);
  assert.match(layout, /removeProperty\('--viewport-offset-top'\)/);
});

test('mobile shell is positioned inside the visual viewport and respects the top safe area', () => {
  assert.match(css, /\.app-shell\{position:relative;top:var\(--viewport-offset-top,0px\);height:var\(--viewport-height,100dvh\)\}/);
  // viewport-fit=cover 下顶部内容不能压到状态栏/灵动岛：滚动容器顶部内边距要叠加 safe-area-inset-top
  assert.match(css, /\.motion-screen\{[^}]*padding-top:calc\(30px \+ env\(safe-area-inset-top,0px\)\)/);
  assert.match(css, /\.motion-screen\[data-route\]:not\(\[data-route="\/"\]\)\{padding-top:calc\(24px \+ env\(safe-area-inset-top,0px\)\)\}/);
});

test('focusing a form field scrolls it into the visible part of the screen scroller', () => {
  assert.match(layout, /window\.addEventListener\('focusin',reveal\)/);
  assert.match(layout, /el\.matches\('input,textarea,select'\)/);
  assert.match(layout, /scroller\.getBoundingClientRect\(\)/);
  assert.match(layout, /scroller\.scrollTop\+=field\.bottom-\(box\.bottom-pad\)/);
  assert.match(layout, /scroller\.scrollTop-=box\.top\+pad-field\.top/);
});
