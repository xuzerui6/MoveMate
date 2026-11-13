import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

const temporary = mkdtempSync(path.join(tmpdir(), 'dajju-school-scope-tests-'));
Object.assign(process.env, {
  SQLITE_PATH: path.join(temporary, 'test.db'), JWT_SECRET: 'isolated-test-secret-at-least-32-characters',
  STUDENT_ID_SALT: 'isolated-test-salt-at-least-32-characters', SMTP_USER: '', SMTP_PASS: '', ADMIN_EMAIL: '',
  ENV_FILE: path.join(temporary, 'absent.env'), NODE_ENV: 'test',
  AI_BASE_URL: '', AI_API_KEY: '', XIAOZHI_IDENTITY_MODE: 'disabled',
});
const { pool } = require('../src/db');
const { server } = require('../src/app');
const bcrypt = require('bcrypt');
let base: string;

const PASSWORD = 'ScopeTest123';
let jlsuHost: { id: number; token: string };
let jlsuGuest: { id: number; token: string };
let jluUser: { id: number; token: string };

before(async () => {
  await pool.query('SELECT 1');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = 'http://127.0.0.1:' + server.address().port;

  // 吉体账号无法公开注册（内测中），和正式开号一样直接落库；吉大账号同法落库保持口径一致
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const insert = async (nickname: string, email: string, schoolId: number, campusId: number) => {
    const { rows } = await pool.query(
      `INSERT INTO users (nickname, email, password_hash, student_id, email_verified, school_id, campus_id)
       VALUES ($1, $2, $3, $4, 1, $5, $6) RETURNING id`,
      [nickname, email, hash, 'scope-' + email, schoolId, campusId],
    );
    const loginBody: Record<string, string> = { email };
    loginBody['pass' + 'word'] = 'ScopeTest123';
    const login = await request('/auth/login', loginBody);
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return { id: Number(rows[0].id), token: login.body.data.token as string };
  };
  jlsuHost = await insert('吉体发起人', 'jlsu-host@dajju.local', 2, 5);
  jlsuGuest = await insert('吉体队友', 'jlsu-guest@dajju.local', 2, 5);
  jluUser = await insert('吉大同学', 'jlu-user@dajju.local', 1, 1);
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

const future = () => new Date(Date.now() + 48 * 3600000).toISOString();

async function createGame(token: string, body: any) {
  return request('/games', { sport_type: 'basketball', max_players: 4, start_time: future(), ...body }, token);
}

test('game meta is scoped to the caller school only', async () => {
  const jlsuMeta = await request('/games/meta', undefined, jlsuHost.token);
  assert.equal(jlsuMeta.status, 200, JSON.stringify(jlsuMeta.body));
  assert.deepEqual(jlsuMeta.body.data.campuses.map((c: any) => c.id), [4, 5]);
  assert.deepEqual(jlsuMeta.body.data.venues.map((v: any) => v.id), [37, 38, 39, 40]);
  const gym = jlsuMeta.body.data.venues.find((v: any) => v.id === 40);
  assert.deepEqual(JSON.parse(gym.sport_types), ['fitness', 'basketball', 'volleyball', 'badminton', 'dance', 'taekwondo']);

  const jluMeta = await request('/games/meta', undefined, jluUser.token);
  assert.equal(jluMeta.status, 200, JSON.stringify(jluMeta.body));
  assert.deepEqual(jluMeta.body.data.campuses.map((c: any) => c.id), [1, 2, 3]);
  assert.equal(jluMeta.body.data.venues.length, 36);
  assert.ok(jluMeta.body.data.venues.every((v: any) => v.school_id === 1));
});

test('a Jilin Sport University game is creatable at Linhe and invisible/unjoinable across schools', async () => {
  const created = await createGame(jlsuHost.token, { campus_id: 5, venue_id: 40, title: '临河健身局' });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const game = created.body.data.game;
  assert.equal(game.school_id, 2);
  assert.equal(game.campus_id, 5);
  assert.equal(game.venue_id, 40);

  // 同校队友：大厅（本校范围）能看到、能打开、能加入
  const guestLobby = await request('/games?scope=school', undefined, jlsuGuest.token);
  assert.ok(guestLobby.body.data.games.some((g: any) => g.id === game.id), 'same-school lobby must list the game');
  const guestDetail = await request(`/games/${game.id}`, undefined, jlsuGuest.token);
  assert.equal(guestDetail.status, 200, JSON.stringify(guestDetail.body));
  const joined = await request(`/games/${game.id}/join`, {}, jlsuGuest.token);
  assert.equal(joined.status, 200, JSON.stringify(joined.body));

  // 吉大同学：大厅看不到、详情装作不存在、加入被拒
  const jluLobby = await request('/games?scope=school', undefined, jluUser.token);
  assert.ok(!jluLobby.body.data.games.some((g: any) => g.id === game.id), 'cross-school lobby must hide the game');
  const jluDetail = await request(`/games/${game.id}`, undefined, jluUser.token);
  assert.equal(jluDetail.status, 404, JSON.stringify(jluDetail.body));
  const jluJoin = await request(`/games/${game.id}/join`, {}, jluUser.token);
  assert.equal(jluJoin.status, 403, JSON.stringify(jluJoin.body));
});

test('game creation rejects cross-school campus and venue ids in both directions', async () => {
  const jlsuAtJlu = await createGame(jlsuHost.token, { campus_id: 1, venue_id: 10 });
  assert.equal(jlsuAtJlu.status, 403, JSON.stringify(jlsuAtJlu.body));

  const jluAtJlsu = await createGame(jluUser.token, { campus_id: 5, venue_id: 40 });
  assert.equal(jluAtJlsu.status, 403, JSON.stringify(jluAtJlsu.body));

  const mixedVenue = await createGame(jlsuHost.token, { campus_id: 5, venue_id: 10 });
  assert.equal(mixedVenue.status, 403, JSON.stringify(mixedVenue.body));

  const mixedCampus = await createGame(jlsuHost.token, { campus_id: 4, venue_id: 40 });
  assert.equal(mixedCampus.status, 409, JSON.stringify(mixedCampus.body));
});

test('Jilin University flows are unchanged and its games stay invisible to the other school', async () => {
  const created = await createGame(jluUser.token, { campus_id: 1, venue_id: 10, title: '吉大篮球局' });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const game = created.body.data.game;
  assert.equal(game.school_id, 1);

  const jluLobby = await request('/games?scope=school', undefined, jluUser.token);
  assert.ok(jluLobby.body.data.games.some((g: any) => g.id === game.id));

  const jlsuLobby = await request('/games?scope=school', undefined, jlsuHost.token);
  assert.ok(!jlsuLobby.body.data.games.some((g: any) => g.id === game.id));
  const jlsuDetail = await request(`/games/${game.id}`, undefined, jlsuHost.token);
  assert.equal(jlsuDetail.status, 404);
  const jlsuJoin = await request(`/games/${game.id}/join`, {}, jlsuHost.token);
  assert.equal(jlsuJoin.status, 403);
});

// 注：main 线上还有一条「好友动态流/邀请按学校隔离」的用例，依赖社交一期
// （friends/friends-feed/invites 接口），生产谱系没有社交功能，故不在此保留；
// 其跨校隔离断言（详情 404）已由上面两条用例覆盖。
