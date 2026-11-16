import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// CDN shell (2026-11-16) wiring pins. The production build loads the app
// shell's JS/CSS from the NoDepend CDN host; preview and every other build
// must NEVER pick that base up (the CDN host origin-pulls production, so a
// CDN-based preview would silently run production chunks). These pins lock
// the seam: the base is env-driven with an origin default, only the
// production web-build script sets it, and the production build emits the
// origin fallback variant + watchdog that make the hard dependency safe.
const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
const webBuild = readFileSync(new URL('../../cloudflare/scripts/web.mjs', import.meta.url), 'utf8');
const cfPackage = JSON.parse(readFileSync(new URL('../../cloudflare/package.json', import.meta.url), 'utf8'));
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

test('vite base is env-driven with the origin default and no hard-coded CDN host', () => {
  assert.match(viteConfig, /base:\s*process\.env\.MOVEMATE_SHELL_BASE \|\| '\/'/);
  assert.ok(!viteConfig.includes('pose.xzrcloud.xyz'), 'the CDN host must live in the production build script, not shared source');
});

test('only the production web build sets the CDN shell base; preview stays on the origin base', () => {
  assert.equal(cfPackage.scripts['build:web:production'], 'MOVEMATE_SHELL_BASE=https://pose.xzrcloud.xyz/ node scripts/web.mjs');
  assert.ok(!cfPackage.scripts['build:web'].includes('MOVEMATE_SHELL_BASE'));
  assert.ok(cfPackage.scripts['deploy:preview'].includes('build:web'), 'preview deploys via the plain web build');
  assert.ok(!cfPackage.scripts['deploy:preview'].includes('production'));
  assert.ok(cfPackage.scripts['deploy'].includes('build:web:production'), 'the production deploy path uses the CDN-shell build');
});

test('the shell-base web build emits the origin variant and injects the watchdog into the CDN shell only', () => {
  assert.match(webBuild, /MOVEMATE_SHELL_BASE/);
  assert.match(webBuild, /dist-origin/, 'the origin variant is built into a scratch outDir');
  assert.match(webBuild, /index-origin\.html/, 'the origin variant lands in dist as index-origin.html');
  assert.match(webBuild, /injectShellWatchdog/, 'the CDN index.html gets the boot watchdog');
});

test('the app entry sets the boot flag the watchdog waits for', () => {
  assert.match(main, /__MOVEMATE_BOOTED__\s*=\s*true/);
});
