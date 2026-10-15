import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const temporary = mkdtempSync(path.join(tmpdir(), 'movemate-freeze-'));
Object.assign(process.env, {
  TURSO_DATABASE_URL: 'file:' + path.join(temporary, 'source.db'),
  JWT_SECRET: 'source-tests-signing-secret-at-least-32-characters',
  STUDENT_ID_SALT: 'source-tests-student-salt-at-least-32-characters',
  ENV_FILE: path.join(temporary, 'absent.env'), NODE_ENV: 'test', VERCEL: '',
  SEED_DEMO_ACCOUNTS: 'false', SMTP_USER: '', SMTP_PASS: '', XIAOZHI_IDENTITY_MODE: 'disabled',
  CRON_SECRET: 'source-test-migration-control-secret',
});
const { pool } = require('../src/db');
const { server, io } = require('../src/app');
const { runCronTick } = require('../src/cron/state-machine');
let base: string;
test('source freeze protects old deployments at the database and exports only after draining', async () => {
  await pool.query("INSERT INTO users(nickname,email,password_hash,student_id,email_verified) VALUES('source user','source@dajju.local','preserved-bcrypt-hash','student',1)");
  const avatar = Buffer.from([137,80,78,71,13,10,26,10,1,2,3]);
  await pool.query('INSERT INTO uploaded_avatars(id,user_id,content,content_type,created_at) VALUES($1,1,$2,$3,$4)', ['source.png',avatar,'image/png',new Date().toISOString()]);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
  const control = (action: string, method = 'POST') => fetch(base + '/api/source-migration/' + action, { method, headers: { Authorization: 'Bearer ' + process.env.CRON_SECRET, 'Content-Type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) });
  assert.equal((await fetch(base + '/api/source-migration/status')).status, 401);
  assert.equal((await control('freeze')).status, 200);
  assert.equal((await fetch(base + '/api/v1/auth/bootstrap')).status, 503);
  await assert.rejects(pool.query("UPDATE users SET nickname='old deployment write' WHERE id=1"), /maintenance/);
  await assert.rejects(pool.query("INSERT INTO notifications(user_id,type,title,content) VALUES(1,'new_message','blocked','blocked')"), /maintenance/);
  assert.equal((await control('export')).status, 500);
  // Test clock only: production has no API to shorten the connection drain.
  await pool.query("UPDATE migration_control SET value=$1 WHERE key='frozen_at'", [new Date(Date.now() - 306000).toISOString()]);
  await runCronTick();
  const exported = await control('export');
  assert.equal(exported.status, 200);
  const snapshot: any = await exported.json();
  assert.equal(snapshot.manifest.source, 'Vercel/Turso');
  assert.equal(snapshot.manifest.tables.find((t: any) => t.name === 'users').count, 1);
  const user = snapshot.parts.find((p: any) => p.table === 'users');
  assert(user.rows[0].includes('preserved-bcrypt-hash'));
  const image = snapshot.parts.find((p: any) => p.table === 'uploaded_avatars');
  const contentIndex = snapshot.manifest.tables.find((t: any) => t.name === 'uploaded_avatars').columns.indexOf('content');
  assert.equal(image.rows[0][contentIndex].$blob, avatar.toString('base64'));
  assert.equal(snapshot.manifest.tables.some((t: any) => t.name === 'migration_control'), false);
  assert.equal((await control('seal')).status, 200);
});
after(async () => { io.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
