import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const temporary = mkdtempSync(path.join(tmpdir(), 'movemate-cloud-runtime-'));
Object.assign(process.env, {
  TURSO_DATABASE_URL: 'file:' + path.join(temporary, 'cloud.db'),
  JWT_SECRET: 'cloud-tests-signing-secret-at-least-32-characters',
  STUDENT_ID_SALT: 'cloud-tests-student-salt-at-least-32-characters',
  ENV_FILE: path.join(temporary, 'absent.env'), NODE_ENV: 'test',
  VERCEL: '', SEED_DEMO_ACCOUNTS: 'true', CLOUD_DEMO_PASSWORD: 'CloudTestPass123',
  SMTP_USER: '', SMTP_PASS: '', XIAOZHI_IDENTITY_MODE: 'disabled', CRON_SECRET: 'cloud-test-cron-secret',
});
const { ensureCloudRuntime } = require('../src/cloud');
const { pool } = require('../src/db');
const { createCode, verifyCode } = require('../src/services/verify-code.service');
const { server, io } = require('../src/app');

function separateInstance(source: string) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', source], {
    cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('cloud bootstrap seeds only dedicated ordinary accounts and preserves existing profile on another instance', async () => {
  await Promise.all([ensureCloudRuntime(), ensureCloudRuntime()]);
  const { rows } = await pool.query('SELECT * FROM users ORDER BY id');
  assert.equal(rows.length, 3);
  assert.ok(rows.every((user: any) => user.email_verified && !user.is_admin));
  await pool.query('UPDATE users SET nickname=$1 WHERE id=$2', ['saved cloud profile', rows[0].id]);
  separateInstance("require('./src/cloud').ensureCloudRuntime().then(()=>process.exit(0)).catch(()=>process.exit(1))");
  assert.equal((await pool.query('SELECT nickname FROM users WHERE id=$1', [rows[0].id])).rows[0].nickname, 'saved cloud profile');
  assert.equal((await pool.query('SELECT COUNT(*) AS n FROM users')).rows[0].n, 3);
});

test('cloud verification codes survive instance changes, enforce cooldown and commit failed attempts', async () => {
  const email = 'cross-instance@mails.jlu.edu.cn';
  const code = await createCode(email);
  const saved = (await pool.query('SELECT * FROM email_codes WHERE email=$1', [email])).rows[0];
  assert.notEqual(saved.code_hash, code); assert.equal(saved.code_hash.length, 64);
  assert.match(separateInstance(`require('./src/services/verify-code.service').createCode(${JSON.stringify(email)}).then(()=>process.exit(1)).catch(e=>{console.log(e.message);process.exit(0)})`), /发送过于频繁/);
  assert.equal(await verifyCode(email, '000000'), false);
  assert.equal((await pool.query('SELECT attempts FROM email_codes WHERE email=$1', [email])).rows[0].attempts, 1);
  assert.match(separateInstance(`require('./src/services/verify-code.service').verifyCode(${JSON.stringify(email)},${JSON.stringify(code)}).then(ok=>{console.log('verified='+ok);process.exit(ok?0:1)})`), /verified=true/);
  assert.equal(await verifyCode(email, code), false);
  const expiredEmail = 'cloud-expired@mails.jlu.edu.cn';
  const expired = await createCode(expiredEmail);
  await pool.query('UPDATE email_codes SET expires_at=$1 WHERE email=$2', [Date.now() - 1, expiredEmail]);
  assert.equal(await verifyCode(expiredEmail, expired), false);
});

test('cloud avatar uploads use persistent storage, reject disguised files and cron requires its secret', async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(base + '/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'host@dajju.local', password: 'CloudTestPass123' }),
  });
  assert.equal(response.status, 200);
  const token = (await response.json() as any).data.token;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=', 'base64');
  const form = new FormData(); form.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
  const uploaded = await fetch(base + '/api/v1/users/avatar', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
  assert.equal(uploaded.status, 200);
  const url = (await uploaded.json() as any).data.url;
  const stored = await fetch(base + url);
  assert.equal(stored.status, 200); assert.equal(stored.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await stored.arrayBuffer()), png);
  assert.match(separateInstance(`require('./src/db').pool.query('SELECT length(content) AS n FROM uploaded_avatars WHERE id=$1',[${JSON.stringify(url.split('/').pop())}]).then(r=>{console.log('length='+r.rows[0].n);process.exit(0)})`), new RegExp('length=' + png.length));
  const fake = new FormData(); fake.append('file', new Blob(['<script>invalid</script>'], { type: 'image/png' }), 'fake.png');
  assert.equal((await fetch(base + '/api/v1/users/avatar', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fake })).status, 400);
  assert.equal((await fetch(base + '/api/cron')).status, 401);
  assert.equal((await fetch(base + '/api/cron', { headers: { Authorization: 'Bearer cloud-test-cron-secret' } })).status, 200);
});

after(async () => { await new Promise<void>(resolve => io.close(resolve)); });
