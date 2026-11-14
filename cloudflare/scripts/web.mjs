import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
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
const cache = resolve(root, 'cloudflare/.wrangler/asset-history');
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
await Promise.all(retained.filter(name => !currentSet.has(name)).map(name => copyFile(resolve(cache, name), resolve(assets, name))));
await writeFile(resolve(cache, 'history.json'), JSON.stringify([...history, current].slice(-2)));
// Emitted after the Vite build on purpose: Vite empties dist/ first. The
// Worker serves this file with Cache-Control: no-store (see src/worker.ts).
await writeFile(resolve(cwd, 'dist/version.json'), JSON.stringify({ version: buildId }));
