import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
execFileSync(process.execPath, [resolve(root, 'server/node_modules/typescript/bin/tsc')], { cwd: resolve(root, 'server'), stdio: 'inherit' });
await import('./schema.mjs');
const aliases = new Map([
  [resolve(root, 'server/src/db/runtime'), resolve(root, 'cloudflare/src/unavailable-runtime.ts')],
  [resolve(root, 'server/src/cloud'), resolve(root, 'cloudflare/src/unavailable-runtime.ts')],
  [resolve(root, 'server/src/db/index'), resolve(root, 'cloudflare/src/cache.ts')],
  [resolve(root, 'server/src/db'), resolve(root, 'cloudflare/src/cache.ts')],
  [resolve(root, 'server/src/websocket/notification.handler'), resolve(root, 'cloudflare/src/events.ts')],
  [resolve(root, 'server/src/services/email.service'), resolve(root, 'cloudflare/src/email.ts')],
]);
await mkdir(resolve(root, 'cloudflare/dist'), { recursive: true });
const result = await build({
  entryPoints: [resolve(root, process.env.CF_TEST_BUILD ? 'cloudflare/tests/probe.ts' : 'cloudflare/src/worker.ts')],
  outfile: resolve(root, process.env.CF_TEST_BUILD ? 'cloudflare/dist/test-worker.js' : 'cloudflare/dist/worker.js'), bundle: true, platform: 'node',
  format: 'esm', target: 'es2022', conditions: ['workerd', 'worker', 'browser'],
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire('/worker.js');" },
  external: ['cloudflare:*', 'node:*'], sourcemap: true, metafile: true,
  define: { 'process.env.CLOUDFLARE': '"1"', 'process.env.VERCEL': '"0"' },
  plugins: [{ name: 'cloudflare-platform', setup(plugin) {
    plugin.onResolve({ filter: /.*/ }, args => {
      if (args.path === 'bcrypt') return { path: resolve(root, 'server/node_modules/bcryptjs/index.js') };
      if (args.path === 'express-rate-limit') return { path: resolve(root, 'cloudflare/src/rate-limit.ts') };
      if (args.path === 'node-cron') return { path: resolve(root, 'cloudflare/src/no-cron.ts') };
      const path = resolve(args.resolveDir, args.path.replace(/\.js$/, ''));
      return aliases.has(path) ? { path: aliases.get(path) } : undefined;
    });
  } }],
});
const forbidden = Object.keys(result.metafile.inputs).filter(path => /sqlite-adapter|turso-adapter|node_modules\/(bcrypt\/|ioredis\/|node-cron\/|socket\.io\/)/.test(path.replaceAll('\\', '/')));
if (forbidden.length) throw new Error('Node-only modules in Worker: ' + forbidden.join(', '));
await writeFile(resolve(root, 'cloudflare/dist/bundle-inputs.json'), JSON.stringify(Object.keys(result.metafile.inputs), null, 2));
console.log('Worker bundle ready; native SQLite, Redis, Socket.IO and node-cron excluded.');
