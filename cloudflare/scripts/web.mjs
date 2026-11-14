import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { mkdir, readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
const root = resolve(import.meta.dirname, '../..');
const cwd = resolve(root, 'client');
// Version stamp: the git commit this build is made from. web.mjs embeds it in
// the bundle (VITE_BUILD_ID, read by client/src/components/UpdateBanner.tsx)
// and writes it to dist/version.json after the build, so a tab that is still
// open across a deployment can notice the newer version and offer a gentle,
// user-tapped refresh. MOVEMATE_BUILD_ID overrides the stamp: a stamp-only
// bump deploy (same code, new stamp) is how the banner is proven end to end.
let buildId = process.env.MOVEMATE_BUILD_ID || '';
if (!buildId) {
  try { buildId = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); }
  catch { buildId = `build-${Date.now()}`; }
}
const env = { ...process.env, VITE_REALTIME_TRANSPORT: 'cloudflare', VITE_BUILD_ID: buildId };
const assets = resolve(cwd, 'dist/assets');
// Retention must follow the DEPLOYMENT, not the build worktree: deploys rotate
// between fresh checkouts, and a per-worktree cache starts empty there, so the
// previous deployment's lazy chunks were dropped and open tabs got 404s on
// lazy imports (2026-11-13: create -> game detail landed on the app-wide error
// page until a manual reload). Prefer an explicit MOVEMATE_ASSET_HISTORY, then
// the machine-shared cache, then the legacy per-worktree cache.
const sharedCache = resolve(homedir(), 'workspace/movemate-asset-history');
const cache = process.env.MOVEMATE_ASSET_HISTORY
  ? resolve(process.env.MOVEMATE_ASSET_HISTORY)
  : existsSync(sharedCache)
    ? sharedCache
    : resolve(root, 'cloudflare/.wrangler/asset-history');
await mkdir(cache, { recursive: true });
let history = [];
try { history = JSON.parse(await readFile(resolve(cache, 'history.json'), 'utf8')); } catch {}
// Preserve the previous output before Vite replaces dist. Open tabs can still
// reference its lazy chunks during a rollout; retaining hashes avoids reloading
// a user's active camera or timer merely because code was deployed.
try {
  const files = (await readdir(assets)).filter(name => !name.includes('/') && !name.includes('\\'));
  await Promise.all(files.map(name => copyFile(resolve(assets, name), resolve(cache, name))));
  if (!history.length) history.push(files);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
execFileSync(process.execPath, [resolve(cwd, 'node_modules/typescript/bin/tsc'), '-b'], { cwd, env, stdio: 'inherit' });
execFileSync(process.execPath, [resolve(cwd, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', 'dist'], { cwd, env, stdio: 'inherit' });
const current = await readdir(assets);
const retained = [...new Set(history.slice(-2).flat())];
const currentSet = new Set(current);
// A history entry can outlive its cached file (pruned caches): skip names
// whose file is gone instead of failing the whole build — retention is a
// best-effort safety net for open tabs, never a build blocker.
await Promise.all(retained.filter(name => !currentSet.has(name)).map(async name => {
  try { await copyFile(resolve(cache, name), resolve(assets, name)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}));
await writeFile(resolve(cache, 'history.json'), JSON.stringify([...history, current].slice(-2)));
// Emitted after the Vite build on purpose: Vite empties dist/ first. The
// Worker serves this file with Cache-Control: no-store (see src/worker.ts).
await writeFile(resolve(cwd, 'dist/version.json'), JSON.stringify({ version: buildId }));
