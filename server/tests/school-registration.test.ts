import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

const temporary = mkdtempSync(path.join(tmpdir(), 'dajju-school-tests-'));
Object.assign(process.env, {
  SQLITE_PATH: path.join(temporary, 'test.db'), JWT_SECRET: 'isolated-test-secret-at-least-32-characters',
  STUDENT_ID_SALT: 'isolated-test-salt-at-least-32-characters', SMTP_USER: '', SMTP_PASS: '', ADMIN_EMAIL: '',
  ENV_FILE: path.join(temporary, 'absent.env'), NODE_ENV: 'test',
  AI_BASE_URL: '', AI_API_KEY: '', XIAOZHI_IDENTITY_MODE: 'disabled',
});
const { pool } = require('../src/db');
const { createCode } = require('../src/services/verify-code.service');
const { server } = require('../src/app');
let base: string;

const CLOSED_MESSAGE = '这所学校正在小范围测试，暂时还不能注册';
// 吉林体育学院种子校区（校区启用供组局，注册开关关闭 = 只挂牌、注册关闭）
const JLSU_CAMPUSES = [4, 5];

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

async function registerAttempt(email: string, campusId: number) {
  return request('/auth/register', {
    email, nickname: '测试同学', password: 'TestPass123', campus_id: campusId,
    verify_code: await createCode(email),
  });
}

test('bootstrap lists both schools: Jilin University open, Jilin Sport University listed but closed', async () => {
  const boot = await request('/auth/bootstrap');
  assert.equal(boot.status, 200);
  assert.equal(boot.body.data.school.name, '吉林大学');
  const schools = boot.body.data.schools;
  assert.equal(schools.length, 2);
  const jlu = schools.find((s: any) => s.code === 'jlu');
  assert.equal(jlu.name, '吉林大学');
  assert.equal(jlu.registration_open, true);
  const jlsu = schools.find((s: any) => s.code === 'jlsu');
  assert.equal(jlsu.name, '吉林体育学院');
  assert.equal(jlsu.registration_open, false);
  // 解耦后吉体校区是启用的（出现在可选列表里，给内测账号组局用），注册仍由开关拦住
  assert.ok(boot.body.data.campuses.some((c: any) => c.school_id === jlsu.id));
});

test('Jilin University registration still works exactly as before', async () => {
  const email = 'jlu-student@mails.jlu.edu.cn';
  const registered = await registerAttempt(email, 1);
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  assert.equal(registered.body.data.user.school_id, 1);
  assert.equal(registered.body.data.user.school_name, '吉林大学');
  assert.equal(registered.body.data.user.email_verified, true);
});

test('registration tied to the closed school is rejected at the server with the plain-language reason', async () => {
  for (const [index, campusId] of JLSU_CAMPUSES.entries()) {
    const email = `hopeful-${index}@mails.jlu.edu.cn`;
    const rejected = await registerAttempt(email, campusId);
    assert.equal(rejected.status, 400, JSON.stringify(rejected.body));
    assert.equal(rejected.body.message, CLOSED_MESSAGE);
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    assert.equal(rows.length, 0, 'no account may be created for the closed school');
  }
});

test('profile campus change cannot move a user into the closed school, but in-school moves still work', async () => {
  const email = 'mover@mails.jlu.edu.cn';
  const registered = await registerAttempt(email, 1);
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  const token = registered.body.data.token;

  const blocked = await request('/users/me', { campus_id: JLSU_CAMPUSES[0] }, token, 'PUT');
  assert.equal(blocked.status, 400, JSON.stringify(blocked.body));
  assert.equal(blocked.body.message, CLOSED_MESSAGE);

  const allowed = await request('/users/me', { campus_id: 2 }, token, 'PUT');
  assert.equal(allowed.status, 200, JSON.stringify(allowed.body));
  assert.equal(allowed.body.data.user.campus_id, 2);
  assert.equal(allowed.body.data.user.school_id, 1);
});

test('opening the school later is a single data flip: the registration switch', async () => {
  // 解耦后校区一直是启用的；开放注册只需翻 schools.registration_open 一个开关
  await pool.query('UPDATE schools SET registration_open = 1 WHERE id = 2');
  try {
    const boot = await request('/auth/bootstrap');
    const jlsu = boot.body.data.schools.find((s: any) => s.code === 'jlsu');
    assert.equal(jlsu.registration_open, true);

    const email = 'first-jlsu@mails.jlu.edu.cn';
    const registered = await registerAttempt(email, JLSU_CAMPUSES[0]);
    assert.equal(registered.status, 201, JSON.stringify(registered.body));
    assert.equal(registered.body.data.user.school_id, 2);
    assert.equal(registered.body.data.user.school_name, '吉林体育学院');
  } finally {
    await pool.query('UPDATE schools SET registration_open = 0 WHERE id = 2');
  }
  const rejected = await registerAttempt('second-hopeful@mails.jlu.edu.cn', JLSU_CAMPUSES[0]);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.message, CLOSED_MESSAGE);
});
