import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 2026-11-14 老板录屏：怪兽图鉴滚动时，卡片的深色剪影和文字透过
// 页头玻璃带显出来、和标题撞在一起。根因是共享 .page-header 的
// 有效背景为 rgba(249,250,251,0.85)（同规则里靠后的 background-color
// 覆盖了简写的实色）+ backdrop blur；卡片侧没有任何 z-index/transform
// 能越过页头的 z-index:100，不是层叠逃逸。修复只在本页把页头压实。
// 套件没有渲染脚手架，这里按仓库既有 source-guard 惯例锁住规则本身；
// 滚动截图验收在预览版浏览器里做。

test('boss atlas header is opaque on the atlas page only (source guard)', () => {
  const atlasCss = readFileSync(new URL('../src/pages/BossAtlas/BossAtlas.css', import.meta.url), 'utf8');
  const rule = atlasCss.match(/\.ba-page \.page-header \{([^}]*)\}/);
  assert.ok(rule, 'scoped .ba-page .page-header rule exists');
  assert.match(rule[1], /background-color:\s*var\(--color-bg\)/);
  assert.match(rule[1], /backdrop-filter:\s*none/);

  // 共享玻璃面保持原样：修复是本页作用域的，不许顺手改掉别的页面
  const motionCss = readFileSync(new URL('../src/features/motion/motion.css', import.meta.url), 'utf8');
  const shared = motionCss.match(/\.page-header \{([^}]*)\}/);
  assert.ok(shared, 'shared .page-header rule exists');
  assert.match(shared[1], /rgba\(249, 250, 251, 0\.85\)/);
  assert.match(shared[1], /backdrop-filter: blur\(12px\)/);
});
