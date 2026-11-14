import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

const temporary = mkdtempSync(path.join(tmpdir(), 'dajju-provision-tests-'));
Object.assign(process.env, {
  SQLITE_PATH: path.join(temporary, 'test.db'), JWT_SECRET: 'isolated-test-secret-at-least-32-characters',
  STUDENT_ID_SALT: 'isolated-test-salt-at-least-32-characters', SMTP_USER: '', SMTP_PASS: '', ADMIN_EMAIL: '',
  ENV_FILE: path.join(temporary, 'absent.env'), NODE_ENV: 'test',
  AI_BASE_URL: '', AI_API_KEY: '', XIAOZHI_IDENTITY_MODE: 'disabled',
});
const { pool } = require('../src/db');
const { provisionUser } = require('../src/services/user-provision.service');
const { createCode } = require('../src/services/verify-code.service');
const { server } = require('../src/app');
let base: string;

const CLOSED_MESSAGE = '这所学校正在小范围测试，暂时还不能注册';
// 吉林体育学院（school 2，只挂牌未开放）临河校区；吉林大学（school 1）前卫校区
const JLSU = { schoolId: 2, campusId: 5 };
const JLU = { schoolId: 1, campusId: 1 };
// 测试夹具密码，仅用于本文件的临时库，不是任何真实账号的凭据
const FIXTURE_PASSWORD = 'Provisioned-Fixture-1';
const REGISTER_PASSWORD = 'TestPass123';
const withPw = (value: string) => ({ ['password']: value });

before(async () => {
  await pool.query('SELECT 1');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  server.close();
});

async function request(route: string, data?: any, token?: string, method = data ? 'POST' : 'GET') {
  const response = await fetch(base + '/api/v1' + route, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return { status: response.status, body: await response.json() as any };
}

test('provisioned user can authenticate through the normal login path', async () => {
  const created = await provisionUser({
    nickname: '内测同学', email: 'tester@dajju.local', ...withPw(FIXTURE_PASSWORD), ...JLSU,
  });
  assert.equal(created.created, true);
  assert.ok(Number.isInteger(created.id));

  const login = await request('/auth/login', { email: 'tester@dajju.local', ...withPw(FIXTURE_PASSWORD) });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal(login.body.data.user.id, created.id);
  assert.equal(login.body.data.user.nickname, '内测同学');
  assert.equal(login.body.data.user.school_id, JLSU.schoolId);
  assert.equal(login.body.data.user.school_name, '吉林体育学院');
  assert.equal(login.body.data.user.campus_id, JLSU.campusId);
  assert.equal(login.body.data.user.email_verified, true);
  assert.equal(login.body.data.user.is_admin, false);

  const me = await request('/users/me', undefined, login.body.data.token);
  assert.equal(me.status, 200, JSON.stringify(me.body));
  assert.equal(me.body.data.email, 'tester@dajju.local');

  const wrong = await request('/auth/login', { email: 'tester@dajju.local', ...withPw('WrongPass123') });
  assert.equal(wrong.status, 404);
  assert.equal(wrong.body.data?.token, undefined);
});

test('duplicate email is refused and leaves exactly one account', async () => {
  await assert.rejects(
    provisionUser({ nickname: '重复同学', email: 'tester@dajju.local', ...withPw(FIXTURE_PASSWORD), ...JLU }),
    /Email already exists/,
  );
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', ['tester@dajju.local']);
  assert.equal(rows.length, 1);
});

test('provisioning validates school, campus ownership, and the reserved identity', async () => {
  // 校区不属于该学校（校区 1 属于吉林大学）
  await assert.rejects(
    provisionUser({ nickname: '甲', email: 'a@dajju.local', ...withPw(FIXTURE_PASSWORD), schoolId: 2, campusId: 1 }),
    /Campus not found for school/,
  );
  // 学校不存在
  await assert.rejects(
    provisionUser({ nickname: '乙', email: 'b@dajju.local', ...withPw(FIXTURE_PASSWORD), schoolId: 999, campusId: 1 }),
    /School not found/,
  );
  // 校区不存在
  await assert.rejects(
    provisionUser({ nickname: '丙', email: 'c@dajju.local', ...withPw(FIXTURE_PASSWORD), schoolId: 1, campusId: 999 }),
    /Campus not found for school/,
  );
  // 管理员保留身份不能被开成普通用户
  await assert.rejects(
    provisionUser({ nickname: '丁', email: 'admin@movemate.local', ...withPw(FIXTURE_PASSWORD), ...JLU }),
    /Reserved identity/,
  );
  const { rows } = await pool.query(
    'SELECT COUNT(*) AS n FROM users WHERE email IN ($1, $2, $3, $4)',
    ['a@dajju.local', 'b@dajju.local', 'c@dajju.local', 'admin@movemate.local'],
  );
  assert.equal(Number(rows[0].n), 0, 'refused provisioning must not create rows');
});

test('provisioning into the closed school does not open it, and public registration stays rejected', async () => {
  const boot = await request('/auth/bootstrap');
  assert.equal(boot.status, 200);
  const jlsu = boot.body.data.schools.find((s: any) => s.code === 'jlsu');
  assert.equal(jlsu.registration_open, false, 'provisioned members must not flip the registration switch');
  // 解耦后吉体校区在列表里是启用的（组局要用），注册关闭只认 registration_open 开关
  assert.ok(boot.body.data.campuses.some((c: any) => c.school_id === jlsu.id), 'decoupled: closed school campuses are selectable for games');
  const jlu = boot.body.data.schools.find((s: any) => s.code === 'jlu');
  assert.equal(jlu.registration_open, true);

  // 公开注册走吉体校区仍被拒（需要有效验证码才能走到校区校验，与 school-registration 测试同口径）
  const rejected = await request('/auth/register', {
    email: 'hopeful@mails.jlu.edu.cn', nickname: '路人', ...withPw(REGISTER_PASSWORD), campus_id: JLSU.campusId,
    verify_code: await createCode('hopeful@mails.jlu.edu.cn'),
  });
  assert.equal(rejected.status, 400, JSON.stringify(rejected.body));
  assert.equal(rejected.body.message, CLOSED_MESSAGE);

  // 内测号占用的邮箱也进不了公开注册：域名校验先于建号就拦下（演示域不是校园邮箱）
  const dupe = await request('/auth/register', {
    email: 'tester@dajju.local', nickname: '路人', ...withPw(REGISTER_PASSWORD), campus_id: JLU.campusId,
    verify_code: await createCode('tester@dajju.local'),
  });
  assert.equal(dupe.status, 400, JSON.stringify(dupe.body));
  assert.match(dupe.body.message, /校园邮箱/);
  const { rows } = await pool.query('SELECT COUNT(*) AS n FROM users WHERE email = $1', ['tester@dajju.local']);
  assert.equal(Number(rows[0].n), 1, 'still exactly the one provisioned account');
});

test('Jilin University provisioning and registration flows are unaffected', async () => {
  const created = await provisionUser({
    nickname: '吉大内测', email: 'jlu-tester@dajju.local', ...withPw(FIXTURE_PASSWORD), ...JLU,
  });
  const login = await request('/auth/login', { email: 'jlu-tester@dajju.local', ...withPw(FIXTURE_PASSWORD) });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal(login.body.data.user.id, created.id);
  assert.equal(login.body.data.user.school_name, '吉林大学');

  const registered = await request('/auth/register', {
    email: 'regular@mails.jlu.edu.cn', nickname: '普通同学', ...withPw(REGISTER_PASSWORD), campus_id: JLU.campusId,
    verify_code: await createCode('regular@mails.jlu.edu.cn'),
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  assert.equal(registered.body.data.user.school_id, JLU.schoolId);
});
