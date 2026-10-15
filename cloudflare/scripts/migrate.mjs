import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const root = resolve(import.meta.dirname, '../..');
const command = process.argv[2], target = process.argv[3], backupPath = process.argv[4];
const secretsPath = resolve(root, 'server/data', target?.includes('preview') ? 'cloudflare-preview-secrets.json' : 'cloudflare-secrets.json');
const secrets = JSON.parse(await readFile(secretsPath, 'utf8'));
const sourceSecrets = JSON.parse(await readFile(resolve(root, 'server/data/vercel-secrets.json'), 'utf8'));
const request = async (base, path, body, secret) => {
  const response = await fetch(new URL(path, base), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + secret, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(result)}`);
  return result;
};
const call = (action, body) => request(target, '/api/migration/' + action, body, secrets.MIGRATION_SECRET);
const keyPath = resolve(root, 'server/data/cloudflare-backup-key.json');
async function key(create = false) {
  try { return Buffer.from(JSON.parse(await readFile(keyPath, 'utf8')).key, 'hex'); }
  catch (error) {
    if (!create || error.code !== 'ENOENT') throw error;
    const value = randomBytes(32); await writeFile(keyPath, JSON.stringify({ key: value.toString('hex') }), { flag: 'wx', mode: 0o600 }); return value;
  }
}
async function importSnapshot(snapshot) {
  await call('begin', snapshot.manifest);
  const state = await call('status');
  const checkpoints = new Map(state.parts.map(part => [part.part, part.hash]));
  for (const part of snapshot.parts) {
    if (checkpoints.get(part.part) === part.hash) continue;
    await call('part', part);
    console.log(`Imported checkpoint ${part.part + 1}/${snapshot.parts.length}: ${part.table} (${part.rows.length} rows)`);
  }
  const verified = await call('verify', {});
  console.log(JSON.stringify({ ok: verified.ok, tables: verified.results.map(row => ({ table: row.table, count: row.count, ok: row.ok })), foreignKeys: verified.foreignKeys.length, invalidLedger: verified.invalidLedger.length, growthMismatches: verified.growth.length }, null, 2));
}

if (!/^https:\/\//.test(target || '')) throw new Error('Provide the explicit HTTPS target URL');
if (command === 'preview-fixture') {
  if (!target.includes('movemate-preview.')) throw new Error('Synthetic data is restricted to the isolated preview Worker');
  const { fixture } = await import('../tests/fixture.mjs'); await importSnapshot(fixture());
} else if (command === 'status') console.log(JSON.stringify(await call('status'), null, 2));
else if (command === 'open') console.log(JSON.stringify(await call('open', {})));
else if (command === 'source-freeze' || command === 'source-seal' || command === 'source-status') {
  const action = command.slice(7);
  console.log(JSON.stringify(await request(target, '/api/source-migration/' + action, action === 'status' ? undefined : {}, sourceSecrets.CRON_SECRET)));
} else if (command === 'export') {
  if (!backupPath || resolve(backupPath).startsWith(root)) throw new Error('Encrypted backup must be outside the repository');
  const snapshot = await request(target, '/api/source-migration/export', {}, sourceSecrets.CRON_SECRET);
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', await key(true), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(snapshot), 'utf8'), cipher.final()]);
  await mkdir(resolve(backupPath, '..'), { recursive: true });
  await writeFile(backupPath, Buffer.concat([Buffer.from('MMCF1'), iv, cipher.getAuthTag(), ciphertext]), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ encryptedBackup: backupPath, snapshot: snapshot.manifest.id, counts: snapshot.manifest.tables.map(t => ({ table: t.name, count: t.count })) }, null, 2));
} else if (command === 'import') {
  const bytes = await readFile(backupPath);
  if (bytes.subarray(0, 5).toString() !== 'MMCF1') throw new Error('Not an encrypted MoveMate backup');
  const decipher = createDecipheriv('aes-256-gcm', await key(), bytes.subarray(5, 17)); decipher.setAuthTag(bytes.subarray(17, 33));
  const snapshot = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(33)), decipher.final()]).toString('utf8'));
  await importSnapshot(snapshot);
} else throw new Error('Use status, preview-fixture, source-status, source-freeze, export, import, open or source-seal');
