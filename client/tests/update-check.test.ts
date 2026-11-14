import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_DISMISSED_KEY,
  dismissVersion,
  fetchLatestVersion,
  isUpdateAvailable,
  parseVersionFile,
  readDismissedVersion,
  shouldShowUpdateBanner,
} from '../src/lib/updateCheck';

test('parseVersionFile only accepts a non-empty string version', () => {
  assert.equal(parseVersionFile({ version: 'abc123' }), 'abc123');
  assert.equal(parseVersionFile({ version: '' }), null);
  assert.equal(parseVersionFile({ version: '  ' }), null);
  assert.equal(parseVersionFile({ version: 42 }), null);
  assert.equal(parseVersionFile({}), null);
  assert.equal(parseVersionFile(null), null);
  assert.equal(parseVersionFile('abc123'), null);
  // SPA 兜底返回的 HTML 不是对象 → 读不到，静默不提示
  assert.equal(parseVersionFile('<html></html>'), null);
});

test('isUpdateAvailable is a strict stamp comparison', () => {
  assert.equal(isUpdateAvailable('aaa', 'aaa'), false);
  assert.equal(isUpdateAvailable('aaa', 'bbb'), true);
  // 线上回滚到更旧的戳同样算「与本页不同」→ 提示刷新到线上版本
  assert.equal(isUpdateAvailable('bbb', 'aaa'), true);
  assert.equal(isUpdateAvailable(null, 'bbb'), false);
  assert.equal(isUpdateAvailable('aaa', null), false);
  assert.equal(isUpdateAvailable(undefined, undefined), false);
  assert.equal(isUpdateAvailable('', 'bbb'), false);
});

test('dismiss memory is per version: same version stays hidden, a newer one shows again', () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
  assert.equal(readDismissedVersion(storage), null);
  dismissVersion(storage, 'v2');
  assert.equal(data.get(UPDATE_DISMISSED_KEY), 'v2');
  assert.equal(readDismissedVersion(storage), 'v2');
  const base = { current: 'v1', dismissedVersion: readDismissedVersion(storage), sessionActive: false };
  assert.equal(shouldShowUpdateBanner({ ...base, latest: 'v2' }), false);
  assert.equal(shouldShowUpdateBanner({ ...base, latest: 'v3' }), true);
});

test('dismiss/read tolerate broken storage without throwing', () => {
  const broken = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  };
  assert.equal(readDismissedVersion(broken), null);
  assert.doesNotThrow(() => dismissVersion(broken, 'v2'));
  assert.equal(readDismissedVersion(null), null);
  assert.doesNotThrow(() => dismissVersion(null, 'v2'));
});

test('banner shows only with an update, not dismissed, and no active session', () => {
  const base = { current: 'v1', latest: 'v2', dismissedVersion: null, sessionActive: false };
  assert.equal(shouldShowUpdateBanner(base), true);
  assert.equal(shouldShowUpdateBanner({ ...base, sessionActive: true }), false);
  assert.equal(shouldShowUpdateBanner({ ...base, latest: 'v1' }), false);
  assert.equal(shouldShowUpdateBanner({ ...base, latest: null }), false);
  assert.equal(shouldShowUpdateBanner({ ...base, current: null }), false);
  assert.equal(shouldShowUpdateBanner({ ...base, dismissedVersion: 'v2' }), false);
  assert.equal(shouldShowUpdateBanner({ ...base, dismissedVersion: 'v9' }), true);
});

test('fetchLatestVersion reads the stamp with no-store and fails silently', async () => {
  const seen: Array<{ url: string; cache?: string }> = [];
  const okFetch = async (url: string, init?: { cache?: string }) => {
    seen.push({ url, cache: init?.cache });
    return { ok: true, json: async () => ({ version: 'deadbeef' }) };
  };
  assert.equal(await fetchLatestVersion(okFetch), 'deadbeef');
  assert.deepEqual(seen, [{ url: '/version.json', cache: 'no-store' }]);

  const notOk = async () => ({ ok: false, json: async () => ({}) });
  assert.equal(await fetchLatestVersion(notOk), null);

  const offline = async () => {
    throw new Error('offline');
  };
  assert.equal(await fetchLatestVersion(offline), null);

  const spaHtml = async () => ({
    ok: true,
    json: async () => {
      throw new Error('not json');
    },
  });
  assert.equal(await fetchLatestVersion(spaHtml), null);

  const wrongShape = async () => ({ ok: true, json: async () => ({ build: 'x' }) });
  assert.equal(await fetchLatestVersion(wrongShape), null);
});

test('check interval is the approved ~3 minutes', () => {
  assert.equal(UPDATE_CHECK_INTERVAL_MS, 180_000);
});

// ---- 源码守卫：刷新只能由用户点按钮触发，且跨端契约不被悄悄改掉 ----

const clientRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(clientRoot, '..');
const read = (p: string) => fs.readFileSync(p, 'utf8');

test('the only reload in the update feature is wired to the banner button', () => {
  const banner = read(path.join(clientRoot, 'src/components/UpdateBanner.tsx'));
  const logic = read(path.join(clientRoot, 'src/lib/updateCheck.ts'));
  assert.equal(logic.includes('reload'), false, 'pure logic must never reload');
  const reloads = banner.match(/location\.reload\(\)/g) || [];
  assert.equal(reloads.length, 1, 'exactly one reload call, on the refresh button');
  assert.match(banner, /onClick=\{\(\) => window\.location\.reload\(\)\}/);
  // 定时器/可见性回调只做检查（check），不许直接或间接刷新
  assert.match(banner, /setInterval\(\(\) => void check\(\)/);
  assert.equal(banner.includes('location.href'), false);
});

test('banner is mounted in the shared Layout and suppressed during workouts', () => {
  const layout = read(path.join(clientRoot, 'src/components/Layout.tsx'));
  assert.match(layout, /<UpdateBanner\/>/);
  const banner = read(path.join(clientRoot, 'src/components/UpdateBanner.tsx'));
  // 与 Training 页同一条「进行中」判定：会话 running/paused 即抑制
  assert.match(banner, /s\.status === 'running' \|\| s\.status === 'paused'/);
  assert.match(banner, /\/train\/workout\//);
  assert.match(banner, /有新版本啦/);
  assert.match(banner, />\s*刷新\s*</);
  assert.match(banner, />\s*稍后\s*</);
});

test('build stamps the version and the worker never caches version.json', () => {
  const web = read(path.join(repoRoot, 'cloudflare/scripts/web.mjs'));
  assert.match(web, /VITE_BUILD_ID: buildId/);
  assert.match(web, /dist\/version\.json/);
  assert.match(web, /MOVEMATE_BUILD_ID/, 'stamp-only bump override must stay available');
  const worker = read(path.join(repoRoot, 'cloudflare/src/worker.ts'));
  assert.match(worker, /url\.pathname === '\/version\.json'\) headers\.set\('Cache-Control', 'no-store'\)/);
});
