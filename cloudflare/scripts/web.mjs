import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
const root = resolve(import.meta.dirname, '../..');
const cwd = resolve(root, 'client');
const env = { ...process.env, VITE_REALTIME_TRANSPORT: 'cloudflare' };
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
