import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { mkdir, readdir, readFile, writeFile, copyFile, open, rename, stat, unlink, rm } from 'node:fs/promises';
import { injectShellWatchdog } from './shell-watchdog.mjs';
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
// CDN shell (production builds only, via `npm run build:web:production`):
// MOVEMATE_SHELL_BASE points the Vite asset base at the NoDepend CDN host so
// the served index.html loads its JS/CSS from there (see client/vite.config.ts
// and scripts/shell-watchdog.mjs). When set, this script ALSO builds an
// origin-based variant of the same source and merges it into dist (see the
// post-build block below), so the Worker's ?shell=origin fallback always has
// a same-version origin shell to serve. Preview builds never set it.
const shellBase = process.env.MOVEMATE_SHELL_BASE || '';
const env = { ...process.env, VITE_REALTIME_TRANSPORT: 'cloudflare', VITE_BUILD_ID: buildId, ...(shellBase ? { MOVEMATE_SHELL_BASE: shellBase } : {}) };
const assets = resolve(cwd, 'dist/assets');
// Retention must follow the DEPLOYMENT, not the build worktree: deploys rotate
// between fresh checkouts, and a per-worktree cache starts empty there, so the
// previous deployment's lazy chunks were dropped and open tabs got 404s on
// lazy imports (2026-11-13: create -> game detail landed on the app-wide error
// page until a manual reload). Prefer an explicit MOVEMATE_ASSET_HISTORY, then
// the machine-shared cache. There is deliberately NO silent per-worktree
// fallback (2026-11-15 audit V11): if the shared dir cannot be created, fail
// loudly here instead of quietly retaining nothing deployment-wide.
const sharedCache = resolve(homedir(), 'workspace/movemate-asset-history');
const cache = process.env.MOVEMATE_ASSET_HISTORY
  ? resolve(process.env.MOVEMATE_ASSET_HISTORY)
  : sharedCache;
try {
  await mkdir(cache, { recursive: true });
} catch (error) {
  throw new Error(`web.mjs: cannot create the shared asset-history cache at ${cache} (${error.message}). Set MOVEMATE_ASSET_HISTORY to a writable directory; retention must never silently fall back to a per-worktree cache.`);
}
const historyPath = resolve(cache, 'history.json');
const lockPath = resolve(cache, 'history.lock');

async function fileExists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function readHistory() {
  try {
    const parsed = JSON.parse(await readFile(historyPath, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
    console.warn(`web.mjs: WARNING ${historyPath} is not a JSON array; treating retention history as empty.`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      // A corrupt history must be loud (audit V4): silently treating it as
      // empty drops every retained generation without a trace.
      console.warn(`web.mjs: WARNING cannot parse retention history at ${historyPath} (${error.message}); treating it as empty.`);
    }
  }
  return [];
}

/** Atomic history write: temp file in the same directory + rename. */
async function writeHistory(generations) {
  const tmp = resolve(cache, `history.json.tmp-${process.pid}`);
  await writeFile(tmp, JSON.stringify(generations));
  await rename(tmp, historyPath);
}

/*
 * Simple lockfile around every history read-modify-write (audit V4): two
 * builds sharing one cache must not snapshot the same history and overwrite
 * each other's generations. A lock older than 10 minutes is treated as stale
 * (builds here take ~1-3 minutes) and broken; otherwise we wait up to ~60s
 * and then fail loudly rather than clobber.
 */
async function acquireLock() {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
      return handle;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > 10 * 60_000) { await unlink(lockPath); continue; }
      } catch { continue; }
      await new Promise(done => setTimeout(done, 250));
    }
  }
  throw new Error(`web.mjs: could not acquire the asset-history lock at ${lockPath} after ~60s; another build may be stuck. Refusing to risk clobbering the shared retention history.`);
}

async function withHistoryLock(fn) {
  const handle = await acquireLock();
  try { return await fn(); }
  finally {
    await handle.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
  }
}

// Preserve the previous output before Vite replaces dist. Open tabs can still
// reference its lazy chunks during a rollout; retaining hashes avoids reloading
// a user's active camera or timer merely because code was deployed.
await withHistoryLock(async () => {
  const history = await readHistory();
  try {
    const files = (await readdir(assets)).filter(name => !name.includes('/') && !name.includes('\\'));
    await Promise.all(files.map(name => copyFile(resolve(assets, name), resolve(cache, name))));
    if (!history.length) await writeHistory([files]);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
});
execFileSync(process.execPath, [resolve(cwd, 'node_modules/typescript/bin/tsc'), '-b'], { cwd, env, stdio: 'inherit' });
execFileSync(process.execPath, [resolve(cwd, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', 'dist'], { cwd, env, stdio: 'inherit' });
if (shellBase) {
  // Origin shell variant: identical source built with the origin base into a
  // scratch outDir, then merged into dist BEFORE the retention step below,
  // so the shared history records the union and both generations are
  // retained together. Chunk file names are content hashes — a name present
  // in both builds must have identical bytes; anything else means the two
  // builds diverged unexpectedly, and merging them would corrupt both
  // shells, so fail loudly instead.
  const originEnv = { ...env };
  delete originEnv.MOVEMATE_SHELL_BASE;
  execFileSync(process.execPath, [resolve(cwd, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', 'dist-origin'], { cwd, env: originEnv, stdio: 'inherit' });
  const originAssets = resolve(cwd, 'dist-origin/assets');
  for (const name of await readdir(originAssets)) {
    const from = resolve(originAssets, name);
    const to = resolve(assets, name);
    if (await fileExists(to)) {
      const [a, b] = await Promise.all([readFile(from), readFile(to)]);
      if (!a.equals(b)) throw new Error(`web.mjs: origin-shell asset ${name} differs from the CDN-shell build under the same content-hash name; refusing to merge divergent generations.`);
    } else await copyFile(from, to);
  }
  await writeFile(resolve(cwd, 'dist/index-origin.html'), await readFile(resolve(cwd, 'dist-origin/index.html'), 'utf8'));
  await rm(resolve(cwd, 'dist-origin'), { recursive: true, force: true });
  // The watchdog goes ONLY into the CDN-based index.html: the origin
  // variant is the fallback of last resort and must never navigate away.
  const indexPath = resolve(cwd, 'dist/index.html');
  await writeFile(indexPath, injectShellWatchdog(await readFile(indexPath, 'utf8')));
  console.log(`web.mjs: CDN shell base ${shellBase} — origin variant merged into dist, boot watchdog injected.`);
}
const current = await readdir(assets);
const currentSet = new Set(current);
await withHistoryLock(async () => {
  // Re-read under the lock: another build may have appended a generation
  // while this one was compiling; merge with the fresh state, never with a
  // stale snapshot.
  const history = await readHistory();
  // Cache the NEW generation's bytes BEFORE writing history (audit V3): a
  // generation whose names are recorded but whose bytes never reached the
  // shared cache retains nothing on the next rotating-worktree build.
  await Promise.all(current.map(name => copyFile(resolve(assets, name), resolve(cache, name))));
  const retained = [...new Set(history.slice(-2).flat())].filter(name => !currentSet.has(name));
  const dangling = [];
  await Promise.all(retained.map(async name => {
    if (await fileExists(resolve(cache, name))) {
      await copyFile(resolve(cache, name), resolve(assets, name));
    } else {
      dangling.push(name);
    }
  }));
  let generations = history;
  if (dangling.length) {
    // Prune loudly (audit V3): names without bytes are dropped from history
    // so the index never again claims a generation it cannot restore.
    console.warn(`web.mjs: WARNING pruning ${dangling.length} retained asset name(s) with no bytes in the shared cache ${cache}: ${dangling.join(', ')}`);
    const dead = new Set(dangling);
    generations = history.map(gen => gen.filter(name => !dead.has(name))).filter(gen => gen.length);
  }
  await writeHistory([...generations, current].slice(-2));
});
// Emitted after the Vite build on purpose: Vite empties dist/ first. The
// Worker serves this file with Cache-Control: no-store (see src/worker.ts).
await writeFile(resolve(cwd, 'dist/version.json'), JSON.stringify({ version: buildId }));
