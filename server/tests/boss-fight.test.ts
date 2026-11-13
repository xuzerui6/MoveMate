import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

const temporary = mkdtempSync(path.join(tmpdir(), 'dajju-boss-tests-'));
Object.assign(process.env, {
  SQLITE_PATH: path.join(temporary, 'test.db'), JWT_SECRET: 'isolated-test-secret-at-least-32-characters',
  STUDENT_ID_SALT: 'isolated-test-salt-at-least-32-characters', SMTP_USER: '', SMTP_PASS: '', ADMIN_EMAIL: '',
  ENV_FILE: path.join(temporary, 'absent.env'), NODE_ENV: 'test',
  AI_BASE_URL: '', AI_API_KEY: '', XIAOZHI_IDENTITY_MODE: 'disabled',
});
const { pool } = require('../src/db');
const { AuthService } = require('../src/services/auth.service');
const { createCode } = require('../src/services/verify-code.service');
const games = require('../src/services/game.service');
const motion = require('../src/services/motion.service');
const BossFight = require('../src/services/boss-fight.service');
const { server, io } = require('../src/app');
let base: string;

async function request(route: string, data?: any, token?: string, method = data ? 'POST' : 'GET') {
  const response = await fetch(base + '/api/v1' + route, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  return { status: response.status, body: await response.json() as any };
}
async function account(name: string) {
  const email = name + '@mails.jlu.edu.cn';
  return AuthService.register({ email, nickname: name, password: 'TestPass123', campus_id: 1, verify_code: await createCode(email) });
}
/** 建局 → 成员加入 → 直接置为进行中并签到（与 social.test 同款的测试捷径） */
async function liveGame(host: any, members: any[], opts: { checkIn?: boolean } = {}) {
  const game = await games.createGame({
    host_id: host.user.id, sport_type: 'basketball', campus_id: 1, location: '测试球场', max_players: 20,
    start_time: new Date(Date.now() + 48 * 3600000).toISOString(),
  });
  for (const member of members) await games.joinGame(game.id, member.user.id);
  await pool.query("UPDATE games SET status = 'in_progress' WHERE id = $1", [game.id]);
  if (opts.checkIn !== false) {
    await pool.query('UPDATE game_members SET checked_in_at = NOW() WHERE game_id = $1', [game.id]);
  }
  return game;
}
async function cameraSession(user: any, sportType = 'squat') {
  const row = await motion.createSession(user.user.id, { sportType, source: 'camera' });
  return row.id as string;
}
const isoAgo = (sec: number) => new Date(Date.now() - sec * 1000).toISOString();
async function backdateFightStart(fightId: string, sec: number) {
  await pool.query('UPDATE boss_fights SET started_at = $2 WHERE id = $1', [fightId, isoAgo(sec)]);
}
async function fightState(gameId: number, viewer: any) {
  const res = await request(`/games/${gameId}/boss-fight`, undefined, viewer.token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
}

before(async () => {
  await pool.query('SELECT 1');
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { await new Promise<void>((resolve) => io.close(() => resolve())); });

test('hp formula follows the scheme rule: one member may contribute nothing, then 20% kinder', () => {
  assert.equal(BossFight.computeMaxHp('squat', 2, 600), 160); // 20/min * 10min * (2-1) * 0.8
  assert.equal(BossFight.computeMaxHp('push_up', 4, 600), 360); // 15 * 10 * 3 * 0.8
  assert.equal(BossFight.computeMaxHp('high_knees', 6, 600), 2400); // 60 * 10 * 5 * 0.8
  assert.equal(BossFight.computeMaxHp('jumping_jack', 3, 300), 320); // 40 * 5 * 2 * 0.8
});

test('create fight: host only, tier-1 roster only, game must be in progress, one open fight per game', async () => {
  const host = await account('boss-create-host'), player = await account('boss-create-player');
  // 局还没开始（recruiting）→ 不能发起
  const pending = await games.createGame({
    host_id: host.user.id, sport_type: 'basketball', campus_id: 1, location: '测试球场', max_players: 6,
    start_time: new Date(Date.now() + 48 * 3600000).toISOString(),
  });
  assert.equal((await request(`/games/${pending.id}/boss-fight`, { movement: 'squat' }, host.token)).status, 409);

  const game = await liveGame(host, [player]);
  // 非一级可信动作 → 400
  assert.equal((await request(`/games/${game.id}/boss-fight`, { movement: 'barbell_row' }, host.token)).status, 400);
  // 非发起人 → 403
  assert.equal((await request(`/games/${game.id}/boss-fight`, { movement: 'squat' }, player.token)).status, 403);
  // 发起人正常发起
  const created = await request(`/games/${game.id}/boss-fight`, { movement: 'squat' }, host.token);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.data.status, 'gathering');
  assert.equal(created.body.data.boss_id, 'kunkun');
  assert.equal(created.body.data.participants.length, 1);
  // 一局同时只能有一场未结束的打怪
  assert.equal((await request(`/games/${game.id}/boss-fight`, { movement: 'squat' }, host.token)).status, 409);
});

test('ready gate: start rejected until every joined fighter is ready; non-members and unsigned members rejected', async () => {
  const host = await account('boss-ready-host'), player = await account('boss-ready-player'), outsider = await account('boss-ready-outsider');
  const game = await liveGame(host, [player]);
  await request(`/games/${game.id}/boss-fight`, { movement: 'push_up' }, host.token);
  // 局外人：看不到、进不来
  assert.equal((await request(`/games/${game.id}/boss-fight`, undefined, outsider.token)).status, 403);
  assert.equal((await request(`/games/${game.id}/boss-fight/join`, {}, outsider.token)).status, 403);
  const joined = await request(`/games/${game.id}/boss-fight/join`, {}, player.token);
  assert.equal(joined.status, 200, JSON.stringify(joined.body));
  // player 没点准备 → 开不了
  assert.equal((await request(`/games/${game.id}/boss-fight/start`, {}, host.token)).status, 409);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, host.token);
  assert.equal((await request(`/games/${game.id}/boss-fight/start`, {}, host.token)).status, 409);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, player.token);
  const started = await request(`/games/${game.id}/boss-fight/start`, {}, player.token);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.data.status, 'fighting');
  assert.equal(started.body.data.max_hp, 120); // push_up: 15 * 10 * (2-1) * 0.8
  assert.equal(started.body.data.hp, 120);
  assert.ok(started.body.data.ends_at);
  // 开打后不能再加入（迟到者是局成员、已签到，但没赶上组队）
  const host3 = await account('boss-ready-host3'), p3 = await account('boss-ready-p3'), late = await account('boss-ready-late');
  const game3 = await liveGame(host3, [p3, late]);
  await request(`/games/${game3.id}/boss-fight`, { movement: 'squat' }, host3.token);
  await request(`/games/${game3.id}/boss-fight/join`, {}, p3.token);
  await request(`/games/${game3.id}/boss-fight/ready`, { ready: true }, host3.token);
  await request(`/games/${game3.id}/boss-fight/ready`, { ready: true }, p3.token);
  await request(`/games/${game3.id}/boss-fight/start`, {}, host3.token);
  assert.equal((await request(`/games/${game3.id}/boss-fight/join`, {}, late.token)).status, 409);

  // 没签到的成员不能加入打怪
  const host2 = await account('boss-ready-host2'), unsigned = await account('boss-ready-unsigned');
  const game2 = await liveGame(host2, [unsigned], { checkIn: false });
  await pool.query('UPDATE game_members SET checked_in_at = NOW() WHERE game_id = $1 AND user_id = $2', [game2.id, host2.user.id]);
  await request(`/games/${game2.id}/boss-fight`, { movement: 'squat' }, host2.token);
  assert.equal((await request(`/games/${game2.id}/boss-fight/join`, {}, unsigned.token)).status, 409);
});

test('damage ledger: deltas only, retries do not double count, drops do not go negative, rate cap drains backlog', async () => {
  const host = await account('boss-dmg-host'), player = await account('boss-dmg-player');
  const game = await liveGame(host, [player]);
  const hostSession = await cameraSession(host);
  const created = await request(`/games/${game.id}/boss-fight`, { movement: 'squat' }, host.token);
  const fightId = created.body.data.id;
  assert.equal((await request(`/games/${game.id}/boss-fight/join`, { sessionId: hostSession }, host.token)).status, 200);
  await request(`/games/${game.id}/boss-fight/join`, {}, player.token);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, host.token);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, player.token);
  const started = await request(`/games/${game.id}/boss-fight/start`, {}, host.token);
  assert.equal(started.body.data.hp, 160);
  await backdateFightStart(fightId, 120); // 让速率窗口有足够额度（模拟已经打了 2 分钟）

  await motion.sessionAction(hostSession, host.user.id, 'progress', { reps: 10 });
  let state = await fightState(game.id, host);
  assert.equal(state.hp, 150);
  const hostEntry = state.participants.find((p: any) => p.user_id === host.user.id);
  assert.equal(hostEntry.my_damage, 10);
  // 别人看不到我的伤害数字
  const playerView = await fightState(game.id, player);
  assert.ok(!('my_damage' in playerView.participants.find((p: any) => p.user_id === host.user.id)));
  assert.equal(playerView.participants.find((p: any) => p.user_id === player.user.id).my_damage, 0);

  // 重发同样的累计值：不重复计
  await motion.sessionAction(hostSession, host.user.id, 'progress', { reps: 10 });
  assert.equal((await fightState(game.id, host)).hp, 150);
  // 累计值变小：不倒扣
  await motion.sessionAction(hostSession, host.user.id, 'progress', { reps: 4 });
  assert.equal((await fightState(game.id, host)).hp, 150);

  // 紧接着跳增 15：速率窗口（2/秒）几乎为 0，先不入账，差额保留
  await motion.sessionAction(hostSession, host.user.id, 'progress', { reps: 25 });
  state = await fightState(game.id, host);
  assert.equal(state.hp, 150);
  assert.equal(state.participants.find((p: any) => p.user_id === host.user.id).my_damage, 10);
  // 10 秒后再报同样的累计值：窗口额度 10*2+3=23 ≥ 15，积压全部入账（不丢弃）
  await pool.query('UPDATE boss_fight_participants SET last_report_at = $3 WHERE fight_id = $1 AND user_id = $2',
    [fightId, host.user.id, isoAgo(10)]);
  await motion.sessionAction(hostSession, host.user.id, 'progress', { reps: 25 });
  state = await fightState(game.id, host);
  assert.equal(state.hp, 135);
  assert.equal(state.participants.find((p: any) => p.user_id === host.user.id).my_damage, 25);

  // 延迟自检有样本了
  const latency = await request(`/games/${game.id}/boss-fight/latency`, undefined, host.token);
  assert.equal(latency.status, 200);
  assert.ok(latency.body.data.samples >= 2, JSON.stringify(latency.body.data));
  assert.equal(typeof latency.body.data.processing_ms.p95, 'number');
});

test('link validation: wrong movement or non-camera session cannot be attached', async () => {
  const host = await account('boss-link-host'), player = await account('boss-link-player');
  const game = await liveGame(host, [player]);
  await request(`/games/${game.id}/boss-fight`, { movement: 'squat' }, host.token);
  await request(`/games/${game.id}/boss-fight/join`, {}, player.token);
  const wrongMovement = await cameraSession(player, 'push_up');
  assert.equal((await request(`/games/${game.id}/boss-fight/link-session`, { sessionId: wrongMovement }, player.token)).status, 400);
  await motion.sessionAction(wrongMovement, player.user.id, 'finish');
  const timer = await motion.createSession(player.user.id, { sportType: 'squat', source: 'timer' });
  assert.equal((await request(`/games/${game.id}/boss-fight/link-session`, { sessionId: timer.id }, player.token)).status, 400);
});

test('win: souvenir granted once per fighter, settle idempotent, training XP untouched', async () => {
  const host = await account('boss-win-host'), player = await account('boss-win-player');
  const game = await liveGame(host, [player]);
  const hostSession = await cameraSession(host);
  const playerSession = await cameraSession(player);
  const created = await request(`/games/${game.id}/boss-fight`, { movement: 'squat' }, host.token);
  const fightId = created.body.data.id;
  await request(`/games/${game.id}/boss-fight/join`, { sessionId: hostSession }, host.token);
  await request(`/games/${game.id}/boss-fight/join`, { sessionId: playerSession }, player.token);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, host.token);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, player.token);
  await request(`/games/${game.id}/boss-fight/start`, {}, host.token);
  await backdateFightStart(fightId, 120);
  await pool.query('UPDATE boss_fights SET hp = 8 WHERE id = $1', [fightId]);

  // player 先打 5 下，再正常结束自己的计数（XP 照常 reps*2）
  await motion.sessionAction(playerSession, player.user.id, 'progress', { reps: 5 });
  const playerFinish = await motion.sessionAction(playerSession, player.user.id, 'finish');
  assert.equal(playerFinish.xpEarned, 10);
  // host 补上最后 3 下 → 胜
  await motion.sessionAction(hostSession, host.user.id, 'progress', { reps: 3 });
  let state = await fightState(game.id, host);
  assert.equal(state.status, 'won');
  assert.equal(state.hp, 0);
  // player 的计数早已正常结束：胜局一落定就应已发
  const playerView = await fightState(game.id, player);
  assert.equal(playerView.my_reward.status, 'granted');
  // host 的还没结束：待发
  assert.equal(state.my_reward.status, 'pending');
  const hostFinish = await motion.sessionAction(hostSession, host.user.id, 'finish');
  assert.equal(hostFinish.xpEarned, 6);
  state = await fightState(game.id, host);
  assert.equal(state.my_reward.status, 'granted');

  // 幂等：重复结束、重复读状态，纪念物都只有一件，XP 不重发
  const again = await motion.sessionAction(hostSession, host.user.id, 'finish');
  assert.equal(again.xpEarned, 6);
  await fightState(game.id, host);
  await fightState(game.id, player);
  const souvenirs = (await pool.query('SELECT user_id, item_id FROM avatar_souvenirs ORDER BY user_id')).rows;
  assert.equal(souvenirs.length, 2);
  assert.ok(souvenirs.every((s: any) => s.item_id === 'kunkun_medal'));
  const hostState = await motion.trainingState(host.user.id);
  assert.equal(hostState.souvenirs.filter((s: any) => s.item_id === 'kunkun_medal').length, 1);
  const rewards = (await pool.query('SELECT status FROM boss_fight_rewards WHERE fight_id = $1', [fightId])).rows;
  assert.deepEqual(rewards.map((r: any) => r.status).sort(), ['granted', 'granted']);
});

test('escape on timeout: no souvenir, training XP kept in full', async () => {
  const host = await account('boss-esc-host'), player = await account('boss-esc-player');
  const game = await liveGame(host, [player]);
  const hostSession = await cameraSession(host);
  const created = await request(`/games/${game.id}/boss-fight`, { movement: 'squat', durationSec: 60 }, host.token);
  const fightId = created.body.data.id;
  await request(`/games/${game.id}/boss-fight/join`, { sessionId: hostSession }, host.token);
  await request(`/games/${game.id}/boss-fight/join`, {}, player.token);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, host.token);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, player.token);
  await request(`/games/${game.id}/boss-fight/start`, {}, host.token);
  await backdateFightStart(fightId, 30);
  await motion.sessionAction(hostSession, host.user.id, 'progress', { reps: 4 });
  assert.equal((await fightState(game.id, host)).hp, 12); // 60 秒局血量 20 * 1 * (2-1) * 0.8 = 16，打掉 4
  await pool.query('UPDATE boss_fights SET ends_at = $2 WHERE id = $1', [fightId, isoAgo(1)]);
  const state = await fightState(game.id, host);
  assert.equal(state.status, 'escaped');
  assert.equal(state.my_reward, null);
  const finish = await motion.sessionAction(hostSession, host.user.id, 'finish');
  assert.equal(finish.xpEarned, 8); // 输了训练 XP 照常拿
  const souvenirs = (await pool.query('SELECT * FROM avatar_souvenirs WHERE user_id = $1', [host.user.id])).rows;
  assert.equal(souvenirs.length, 0);
  const rewards = (await pool.query('SELECT * FROM boss_fight_rewards WHERE fight_id = $1', [fightId])).rows;
  assert.equal(rewards.length, 0);
});

test('mid-fight leave: damage stops, no penalty, souvenir eligibility survives if the session settles', async () => {
  const host = await account('boss-leave-host'), p1 = await account('boss-leave-p1'), p2 = await account('boss-leave-p2');
  const game = await liveGame(host, [p1, p2]);
  const hostSession = await cameraSession(host);
  const p2Session = await cameraSession(p2);
  const created = await request(`/games/${game.id}/boss-fight`, { movement: 'squat' }, host.token);
  const fightId = created.body.data.id;
  await request(`/games/${game.id}/boss-fight/join`, { sessionId: hostSession }, host.token);
  await request(`/games/${game.id}/boss-fight/join`, {}, p1.token);
  await request(`/games/${game.id}/boss-fight/join`, { sessionId: p2Session }, p2.token);
  for (const u of [host, p1, p2]) await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, u.token);
  const started = await request(`/games/${game.id}/boss-fight/start`, {}, host.token);
  assert.equal(started.body.data.max_hp, 320); // 3 人：20 * 10 * 2 * 0.8
  await backdateFightStart(fightId, 120);
  await motion.sessionAction(p2Session, p2.user.id, 'progress', { reps: 6 });
  assert.equal((await fightState(game.id, host)).hp, 314);
  // p2 中途退出：之后他的次数不再产生伤害
  const left = await request(`/games/${game.id}/boss-fight/leave`, {}, p2.token);
  assert.equal(left.status, 200);
  await pool.query('UPDATE boss_fight_participants SET last_report_at = $3 WHERE fight_id = $1 AND user_id = $2',
    [fightId, p2.user.id, isoAgo(10)]);
  await motion.sessionAction(p2Session, p2.user.id, 'progress', { reps: 12 });
  assert.equal((await fightState(game.id, host)).hp, 314);
  // 其余人打完：p2 的纪念物资格保留，计数正常结束即可领
  await pool.query('UPDATE boss_fights SET hp = 3 WHERE id = $1', [fightId]);
  await pool.query('UPDATE boss_fight_participants SET last_report_at = $3 WHERE fight_id = $1 AND user_id = $2',
    [fightId, host.user.id, isoAgo(10)]);
  await motion.sessionAction(hostSession, host.user.id, 'progress', { reps: 3 });
  assert.equal((await fightState(game.id, host)).status, 'won');
  await motion.sessionAction(p2Session, p2.user.id, 'finish');
  const p2View = await fightState(game.id, p2);
  assert.equal(p2View.my_reward.status, 'granted');
});

test('team size cap: seventh fighter cannot join', async () => {
  const host = await account('boss-cap-host');
  const members = [];
  for (let i = 0; i < 6; i++) members.push(await account('boss-cap-m' + i));
  const game = await liveGame(host, members);
  await request(`/games/${game.id}/boss-fight`, { movement: 'squat' }, host.token);
  for (let i = 0; i < 5; i++) {
    assert.equal((await request(`/games/${game.id}/boss-fight/join`, {}, members[i].token)).status, 200);
  }
  assert.equal((await request(`/games/${game.id}/boss-fight/join`, {}, members[5].token)).status, 409);
});

test('SR alternative unlock: ten tier-1 camera sessions unlock SR outfits without any 90+ score', async () => {
  const grinder = await account('boss-sr-grinder');
  for (let i = 0; i < 9; i++) {
    const id = await cameraSession(grinder);
    await motion.sessionAction(id, grinder.user.id, 'progress', { reps: 1 });
    await motion.sessionAction(id, grinder.user.id, 'finish');
  }
  let state = await motion.trainingState(grinder.user.id);
  assert.equal(state.srAlternative.tier1CameraSessions, 9);
  assert.equal(state.unlockedOutfits.sakura, false);
  const id = await cameraSession(grinder);
  await motion.sessionAction(id, grinder.user.id, 'progress', { reps: 1 });
  await motion.sessionAction(id, grinder.user.id, 'finish');
  state = await motion.trainingState(grinder.user.id);
  assert.equal(state.srAlternative.tier1CameraSessions, 10);
  assert.equal(state.srAlternative.unlocked, true);
  assert.equal(state.unlockedOutfits.sakura, true);
  assert.equal(state.unlockedOutfits.violet_court, true);

  // 老路径回归：3 次 90+ 仍然解锁
  const scorer = await account('boss-sr-scorer');
  for (let i = 0; i < 3; i++) {
    const sid = await cameraSession(scorer);
    await motion.sessionAction(sid, scorer.user.id, 'progress', {
      reps: 2, perfectReps: 2,
      scoreAccumulator: { count: 2, total: 190, depth: 190, stability: 190, trunk: 190, symmetry: 190 },
    });
    await motion.sessionAction(sid, scorer.user.id, 'finish');
  }
  const scorerState = await motion.trainingState(scorer.user.id);
  assert.equal(scorerState.unlockedOutfits.sakura, true);
});

test('regression: settle writes ended_at as the timestamp and settle_key as the key; the 24h grace really expires', async () => {
  const host = await account('boss-settle-host'), player = await account('boss-settle-player');
  const game = await liveGame(host, [player]);
  const hostSession = await cameraSession(host);
  const playerSession = await cameraSession(player);
  const created = await request(`/games/${game.id}/boss-fight`, { movement: 'squat' }, host.token);
  const fightId = created.body.data.id;
  await request(`/games/${game.id}/boss-fight/join`, { sessionId: hostSession }, host.token);
  await request(`/games/${game.id}/boss-fight/join`, { sessionId: playerSession }, player.token);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, host.token);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, player.token);
  await request(`/games/${game.id}/boss-fight/start`, {}, host.token);
  await backdateFightStart(fightId, 120);
  await motion.sessionAction(playerSession, player.user.id, 'progress', { reps: 5 });
  await pool.query('UPDATE boss_fights SET hp = 3 WHERE id = $1', [fightId]);
  await motion.sessionAction(hostSession, host.user.id, 'progress', { reps: 3 });
  assert.equal((await fightState(game.id, host)).status, 'won');

  // 字段内容：ended_at/settled_at 必须是可解析的时间戳，settle_key 必须是 "won:<fightId>"
  const row = (await pool.query('SELECT ended_at, settled_at, settle_key FROM boss_fights WHERE id = $1', [fightId])).rows[0];
  assert.ok(Number.isFinite(Date.parse(row.ended_at)), `ended_at should be a timestamp, got ${row.ended_at}`);
  assert.ok(Math.abs(Date.parse(row.ended_at) - Date.now()) < 120000, 'ended_at should be ~now');
  assert.equal(row.settled_at, row.ended_at);
  assert.equal(row.settle_key, `won:${fightId}`);

  // player 的计数还没结束：待发
  assert.equal((await fightState(game.id, player)).my_reward.status, 'pending');
  // 模拟 player 的计数在胜局 48 小时后才正常结束落库（迟到同步的真实形态）：
  // 宽限只有 24 小时，这时读状态必须把待发置为过期且不发纪念物
  const lateEnd = new Date(Date.parse(row.ended_at) + 48 * 3600000).toISOString();
  await pool.query("UPDATE sport_sessions SET status = 'finished', settled = 1, ended_at = $2 WHERE id = $1", [playerSession, lateEnd]);
  const playerView = await fightState(game.id, player);
  assert.equal(playerView.my_reward.status, 'expired');
  const playerSouvenirs = (await pool.query('SELECT * FROM avatar_souvenirs WHERE user_id = $1', [player.user.id])).rows;
  assert.equal(playerSouvenirs.length, 0);
  // 对照：host 在宽限内正常结束 → 照常发放
  await motion.sessionAction(hostSession, host.user.id, 'finish');
  assert.equal((await fightState(game.id, host)).my_reward.status, 'granted');
});

test('regression: a malformed clientTs telemetry field cannot steal a won fight', async () => {
  const host = await account('boss-ctsts-host'), player = await account('boss-ctsts-player');
  const game = await liveGame(host, [player]);
  const hostSession = await cameraSession(host);
  const created = await request(`/games/${game.id}/boss-fight`, { movement: 'squat', durationSec: 60 }, host.token);
  const fightId = created.body.data.id;
  await request(`/games/${game.id}/boss-fight/join`, { sessionId: hostSession }, host.token);
  await request(`/games/${game.id}/boss-fight/join`, {}, player.token);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, host.token);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, player.token);
  const started = await request(`/games/${game.id}/boss-fight/start`, {}, host.token);
  assert.equal(started.body.data.hp, 16); // 60 秒深蹲：20 * 1 * (2-1) * 0.8
  await backdateFightStart(fightId, 10); // 模拟已开打 10 秒，速率额度足够 16 下
  // Codex 复现：致命一击的上报里 clientTs 是个对象（路由 passthrough 会原样保留）
  await motion.sessionAction(hostSession, host.user.id, 'progress', { reps: 16, clientTs: {} });
  const state = await fightState(game.id, host);
  assert.equal(state.status, 'won');
  assert.equal(state.hp, 0);
  // 奖励账本已建：挂了计数的 host 待发、没挂计数的 player 直接过期
  const rewards = (await pool.query('SELECT user_id, status FROM boss_fight_rewards WHERE fight_id = $1', [fightId])).rows;
  assert.equal(rewards.length, 2);
  assert.equal(rewards.find((r: any) => r.user_id === host.user.id).status, 'pending');
  assert.equal(rewards.find((r: any) => r.user_id === player.user.id).status, 'expired');
  // 延迟采样照常落库，只是 client_ts 被安全地记为 NULL
  const latency = (await pool.query('SELECT client_ts FROM boss_fight_latency WHERE fight_id = $1', [fightId])).rows;
  assert.ok(latency.length >= 1);
  assert.ok(latency.every((r: any) => r.client_ts === null));
  await motion.sessionAction(hostSession, host.user.id, 'finish');
  assert.equal((await fightState(game.id, host)).my_reward.status, 'granted');
});

test('regression: mid-fight session re-binding keeps a single damage ledger', async () => {
  const host = await account('boss-rebind-host'), player = await account('boss-rebind-player');
  const game = await liveGame(host, [player]);
  const firstSession = await cameraSession(host);
  const created = await request(`/games/${game.id}/boss-fight`, { movement: 'squat' }, host.token);
  const fightId = created.body.data.id;
  await request(`/games/${game.id}/boss-fight/join`, { sessionId: firstSession }, host.token);
  await request(`/games/${game.id}/boss-fight/join`, {}, player.token);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, host.token);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, player.token);
  await request(`/games/${game.id}/boss-fight/start`, {}, host.token);
  await backdateFightStart(fightId, 120);
  await motion.sessionAction(firstSession, host.user.id, 'progress', { reps: 10 });
  let state = await fightState(game.id, host);
  assert.equal(state.hp, 150);
  assert.equal(state.participants.find((p: any) => p.user_id === host.user.id).my_damage, 10);

  // 战斗中把同一个计数再绑一次：基准不得把已入账的 10 下再扣一遍
  assert.equal((await request(`/games/${game.id}/boss-fight/link-session`, { sessionId: firstSession }, host.token)).status, 200);
  await pool.query('UPDATE boss_fight_participants SET last_report_at = $3 WHERE fight_id = $1 AND user_id = $2',
    [fightId, host.user.id, isoAgo(10)]);
  await motion.sessionAction(firstSession, host.user.id, 'progress', { reps: 15 });
  state = await fightState(game.id, host);
  assert.equal(state.hp, 145); // 新增的 5 下分毫不差地入账
  assert.equal(state.participants.find((p: any) => p.user_id === host.user.id).my_damage, 15);

  // 结束旧计数、换一个全新的计数：新计数的次数从第一下起就该产生伤害，不用先"偿还"旧账
  await motion.sessionAction(firstSession, host.user.id, 'finish');
  const secondSession = await cameraSession(host);
  assert.equal((await request(`/games/${game.id}/boss-fight/link-session`, { sessionId: secondSession }, host.token)).status, 200);
  await pool.query('UPDATE boss_fight_participants SET last_report_at = $3 WHERE fight_id = $1 AND user_id = $2',
    [fightId, host.user.id, isoAgo(10)]);
  await motion.sessionAction(secondSession, host.user.id, 'progress', { reps: 5 });
  state = await fightState(game.id, host);
  assert.equal(state.hp, 140);
  assert.equal(state.participants.find((p: any) => p.user_id === host.user.id).my_damage, 20);
});

test('regression: finishing a session drains the rate-cap backlog while the fight is live', async () => {
  const host = await account('boss-drain-host'), player = await account('boss-drain-player');
  const game = await liveGame(host, [player]);
  const hostSession = await cameraSession(host);
  const created = await request(`/games/${game.id}/boss-fight`, { movement: 'squat' }, host.token);
  const fightId = created.body.data.id;
  await request(`/games/${game.id}/boss-fight/join`, { sessionId: hostSession }, host.token);
  await request(`/games/${game.id}/boss-fight/join`, {}, player.token);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, host.token);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, player.token);
  await request(`/games/${game.id}/boss-fight/start`, {}, host.token);
  await backdateFightStart(fightId, 2); // 开打才 2 秒：实时窗口最多放行 floor(2*2)+3 = 7 下
  // 一次上报 10 下并直接结束：先入账 7 下，结束结算必须把剩下 3 下结清（不丢弃）
  const finish = await motion.sessionAction(hostSession, host.user.id, 'finish', { reps: 10 });
  assert.equal(finish.xpEarned, 20); // 训练 XP 照常按 10 次结算
  const state = await fightState(game.id, host);
  assert.equal(state.status, 'fighting');
  assert.equal(state.hp, 150);
  assert.equal(state.participants.find((p: any) => p.user_id === host.user.id).my_damage, 10);
});

test('avatar display plumbing: game members and end-summary attendees carry avatar + rarity', async () => {
  const host = await account('boss-avatar-host'), player = await account('boss-avatar-player');
  const game = await liveGame(host, [player]);
  const detail = await games.getGameDetail(game.id, host.user.id);
  for (const member of detail.members) {
    assert.ok(member.avatar, 'member should carry avatar');
    assert.equal(member.avatar.outfit, 'default');
    assert.equal(member.avatar.highest_rarity, 'N');
    assert.equal(member.avatar.highest_rarity_name, '日常');
  }
  await pool.query("UPDATE games SET status = 'completed', completed_at = NOW() WHERE id = $1", [game.id]);
  const summary = await games.getEndSummary(game.id, host.user.id);
  assert.equal(summary.attendees.length, 2);
  for (const attendee of summary.attendees) {
    assert.ok(attendee.avatar, 'attendee should carry avatar');
    assert.equal(attendee.avatar.highest_rarity_name, '日常');
  }
});
