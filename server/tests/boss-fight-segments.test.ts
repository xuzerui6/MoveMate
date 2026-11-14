/**
 * 组队打怪二期 · 约定段模式服务端回归（设计稿 2026-11-14 定稿）。
 * 覆盖：模板定格、门禁、去单点、段账本、收场补记、确认/补确认、首胜纪念共用。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

const temporary = mkdtempSync(path.join(tmpdir(), 'dajju-boss-seg-tests-'));
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
const BossFight = require('../src/services/boss-fight.service');
const Segments = require('../src/utils/boss-segments');
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
async function liveGame(host: any, members: any[], sportType = 'basketball') {
  const game = await games.createGame({
    host_id: host.user.id, sport_type: sportType, campus_id: 1, location: '测试球场', max_players: 20,
    start_time: new Date(Date.now() + 48 * 3600000).toISOString(),
  });
  for (const member of members) await games.joinGame(game.id, member.user.id);
  await pool.query("UPDATE games SET status = 'in_progress' WHERE id = $1", [game.id]);
  await pool.query('UPDATE game_members SET checked_in_at = NOW() WHERE game_id = $1', [game.id]);
  return game;
}
async function fightState(gameId: number, viewer: any) {
  const res = await request(`/games/${gameId}/boss-fight`, undefined, viewer.token);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
}
/** 建一场段模式打怪并走到开打（host + 1 名队员，全员准备，队员点开打——去单点） */
async function startedSegmentFight(host: any, player: any, sportType = 'basketball', createBody: any = {}) {
  const game = await liveGame(host, [player], sportType);
  const created = await request(`/games/${game.id}/boss-fight`, { mode: 'segments', bossId: 'aoye_yanshi', ...createBody }, host.token);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal((await request(`/games/${game.id}/boss-fight/join`, {}, player.token)).status, 200);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, host.token);
  await request(`/games/${game.id}/boss-fight/ready`, { ready: true }, player.token);
  const started = await request(`/games/${game.id}/boss-fight/start`, {}, player.token);
  assert.equal(started.status, 200, JSON.stringify(started.body));
  return { game, fight: started.body.data };
}

before(async () => {
  await pool.query('SELECT 1');
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { await new Promise<void>((resolve) => io.close(() => resolve())); });

test('segment templates follow the approved table and never scale with team size inputs', () => {
  const expected: Record<string, number> = {
    basketball: 4, soccer: 3, badminton: 4, volleyball: 4, tennis: 6,
    table_tennis: 6, swimming: 4, running: 4, roller_skating: 4, skateboarding: 4,
  };
  for (const [sport, segments] of Object.entries(expected)) {
    assert.equal(Segments.resolveSegmentContract(sport).segmentsTotal, segments, sport);
  }
  // 通用模板兜底没有专属模板的运动
  for (const sport of ['dance', 'taekwondo', 'skiing', 'anything-else']) {
    const contract = Segments.resolveSegmentContract(sport);
    assert.equal(contract.templateId, 'generic', sport);
    assert.equal(contract.segmentsTotal, 4, sport);
    assert.match(contract.segmentLabel, /15 分钟/);
  }
  // 篮球两种打法写死、二选一
  assert.match(Segments.resolveSegmentContract('basketball').segmentLabel, /10 分钟/);
  assert.match(Segments.resolveSegmentContract('basketball', { segmentFormat: 'points21' }).segmentLabel, /21 分/);
  // 健身段模式动作清单写死
  const fit = Segments.resolveSegmentContract('fitness', { segmentMovement: 'seg_push_up' });
  assert.equal(fit.segmentsTotal, 4);
  assert.match(fit.segmentLabel, /俯卧撑/);
  assert.match(fit.segmentLabel, /15 次/);
});

test('availability gate: unopened bosses are rejected in both modes, opened one passes', async () => {
  const host = await account('seg-gate-host'), player = await account('seg-gate-player');
  const game = await liveGame(host, [player]);
  const seg = await request(`/games/${game.id}/boss-fight`, { mode: 'segments', bossId: 'suiyue_shoumo' }, host.token);
  assert.equal(seg.status, 400, JSON.stringify(seg.body));
  assert.match(seg.body.message, /还没开放/);
  const cam = await request(`/games/${game.id}/boss-fight`, { movement: 'squat', bossId: 'ziye_zhong' }, host.token);
  assert.equal(cam.status, 400, JSON.stringify(cam.body));
  assert.match(cam.body.message, /还没开放/);
  const ok = await request(`/games/${game.id}/boss-fight`, { mode: 'segments', bossId: 'aoye_yanshi' }, host.token);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.data.boss_id, 'aoye_yanshi');
  // 正式版谱系口径（与一期门禁一致，优先于预览线）：未知 bossId 回落默认怪
  // kunkun（目录显式标 fight），不报错；预览线原断言为 400，在此按正式版改。
  const unknownGame = await liveGame(host, [player]);
  const unknown = await request(`/games/${unknownGame.id}/boss-fight`, { mode: 'segments', bossId: 'no_such_boss' }, host.token);
  assert.equal(unknown.status, 200, JSON.stringify(unknown.body));
  assert.equal(unknown.body.data.boss_id, 'kunkun');
});

test('create: basketball segment fight snapshots the contract; fitness defaults stay camera without explicit mode', async () => {
  const host = await account('seg-create-host'), player = await account('seg-create-player');
  const game = await liveGame(host, [player]);
  // 非发起人不能发起
  assert.equal((await request(`/games/${game.id}/boss-fight`, { mode: 'segments' }, player.token)).status, 403);
  const created = await request(`/games/${game.id}/boss-fight`, { mode: 'segments', segmentFormat: 'points21', bossId: 'aoye_yanshi' }, host.token);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const data = created.body.data;
  assert.equal(data.mode, 'segments');
  assert.equal(data.template_id, 'basketball');
  assert.equal(data.segment_format, 'points21');
  assert.equal(data.segments_total, 4);
  assert.match(data.segment_label, /21 分/);
  assert.equal(data.duration_sec, 0);
  // 一期客户端口径不变：带 movement、不带 mode → 摄像头模式（健身局同理）
  const fitGame = await liveGame(host, [player], 'fitness');
  const cam = await request(`/games/${fitGame.id}/boss-fight`, { movement: 'squat' }, host.token);
  assert.equal(cam.status, 200, JSON.stringify(cam.body));
  assert.equal(cam.body.data.mode, 'camera');
  assert.equal(cam.body.data.movement, 'squat');
});

test('segment flow: anyone records, full completion wins, confirmed participant gets the shared souvenir once', async () => {
  const host = await account('seg-flow-host'), player = await account('seg-flow-player');
  const { game, fight } = await startedSegmentFight(host, player);
  assert.equal(fight.status, 'fighting');
  assert.equal(fight.max_hp, 4);
  assert.equal(fight.hp, 4);
  assert.equal(fight.ends_at, null);
  // 房主记一段、队员记一段：不挑人
  const after1 = await request(`/games/${game.id}/boss-fight/segment`, {}, host.token);
  assert.equal(after1.status, 200, JSON.stringify(after1.body));
  assert.equal(after1.body.data.segments_done, 1);
  assert.equal(after1.body.data.hp, 3);
  const after2 = await request(`/games/${game.id}/boss-fight/segment`, {}, player.token);
  assert.equal(after2.body.data.segments_done, 2);
  assert.equal(after2.body.data.segments.length, 2);
  assert.equal(after2.body.data.segments[1].recorded_by, player.user.id);
  // 队员先确认参加（只管自己），然后把剩下两段记满 → 打赢
  assert.equal((await request(`/games/${game.id}/boss-fight/confirm-participation`, {}, player.token)).status, 200);
  await request(`/games/${game.id}/boss-fight/segment`, {}, player.token);
  const won = await request(`/games/${game.id}/boss-fight/segment`, {}, host.token);
  assert.equal(won.status, 200, JSON.stringify(won.body));
  assert.equal(won.body.data.status, 'won');
  assert.equal(won.body.data.segments_done, 4);
  // 打赢后再记段被拒
  assert.equal((await request(`/games/${game.id}/boss-fight/segment`, {}, host.token)).status, 409);
  // 队员已确认 → 纪念到手；房主没确认 → 先没有，补确认后才有（同一份纪念，只发一次）
  const playerView = await fightState(game.id, player);
  assert.equal(playerView.my_reward?.status, 'granted', JSON.stringify(playerView.my_reward));
  const souvenirs = await pool.query('SELECT * FROM avatar_souvenirs WHERE user_id = $1', [player.user.id]);
  assert.equal(souvenirs.rows.length, 1);
  assert.equal(souvenirs.rows[0].item_id, 'aoye_yanshi_medal');
  const hostView = await fightState(game.id, host);
  assert.notEqual(hostView.my_reward?.status, 'granted');
  const madeUp = await request(`/games/${game.id}/boss-fight/confirm-participation`, {}, host.token);
  assert.equal(madeUp.status, 200, JSON.stringify(madeUp.body));
  const hostAfter = await fightState(game.id, host);
  assert.equal(hostAfter.my_reward?.status, 'granted', JSON.stringify(hostAfter.my_reward));
  const hostSouvenirs = await pool.query('SELECT * FROM avatar_souvenirs WHERE user_id = $1', [host.user.id]);
  assert.equal(hostSouvenirs.rows.length, 1);
  // 补确认不改段数、不改胜负
  assert.equal(hostAfter.segments_done, 4);
  assert.equal(hostAfter.status, 'won');
});

test('wrap-up settle: topping up segments wins; settling short lets it escape with the rest', async () => {
  const host = await account('seg-wrap-host'), player = await account('seg-wrap-player');
  const first = await startedSegmentFight(host, player);
  await request(`/games/${first.game.id}/boss-fight/segment`, {}, host.token);
  // 只记了 1 段，收场时如实填 1 → 逃走，剩 3 格
  const escaped = await request(`/games/${first.game.id}/boss-fight/settle-segments`, { segmentsDone: 1 }, player.token);
  assert.equal(escaped.status, 200, JSON.stringify(escaped.body));
  assert.equal(escaped.body.data.status, 'escaped');
  assert.equal(escaped.body.data.segments_done, 1);
  assert.equal(escaped.body.data.hp, 3);
  // 逃走不发纪念
  const rewards = await pool.query('SELECT * FROM boss_fight_rewards WHERE fight_id = $1', [first.fight.id]);
  assert.equal(rewards.rows.length, 0);

  const second = await startedSegmentFight(host, player);
  await request(`/games/${second.game.id}/boss-fight/segment`, {}, host.token);
  // 往下填（比已记的少）被拒
  assert.equal((await request(`/games/${second.game.id}/boss-fight/settle-segments`, { segmentsDone: 0 }, host.token)).status, 400);
  // 补记到满 → 打赢，补记的段来源是 wrapup
  const won = await request(`/games/${second.game.id}/boss-fight/settle-segments`, { segmentsDone: 99 }, player.token);
  assert.equal(won.status, 200, JSON.stringify(won.body));
  assert.equal(won.body.data.status, 'won');
  assert.equal(won.body.data.segments_done, 4);
  assert.equal(won.body.data.segments.filter((s: any) => s.source === 'wrapup').length, 3);
  // 结算后再结算被拒
  assert.equal((await request(`/games/${second.game.id}/boss-fight/settle-segments`, { segmentsDone: 4 }, host.token)).status, 409);
});

test('participation confirmation never blocks: settle works with nobody confirmed; record note is personal and inert', async () => {
  const host = await account('seg-free-host'), player = await account('seg-free-player');
  const { game } = await startedSegmentFight(host, player, 'running');
  // 谁都没确认参加，队员照样能收场结算
  const settled = await request(`/games/${game.id}/boss-fight/settle-segments`, { segmentsDone: 2 }, player.token);
  assert.equal(settled.status, 200, JSON.stringify(settled.body));
  assert.equal(settled.body.data.status, 'escaped');
  // 自愿记录：只能结算后填，只落在自己名下
  const noted = await request(`/games/${game.id}/boss-fight/record-note`, { km: 2.5, minutes: 40 }, player.token);
  assert.equal(noted.status, 200, JSON.stringify(noted.body));
  const mine = noted.body.data.participants.find((p: any) => p.user_id === player.user.id);
  assert.equal(mine.record_km, 2.5);
  assert.equal(mine.record_minutes, 40);
  const other = noted.body.data.participants.find((p: any) => p.user_id === host.user.id);
  assert.equal(other.record_km, null);
  // 局外人确认参加被拒
  const outsider = await account('seg-free-outsider');
  assert.equal((await request(`/games/${game.id}/boss-fight/confirm-participation`, {}, outsider.token)).status, 403);
});

test('segment mode rejects camera-only operations and vice versa', async () => {
  const host = await account('seg-mix-host'), player = await account('seg-mix-player');
  const { game } = await startedSegmentFight(host, player, 'swimming');
  // 段模式里挂计数会被动作校验挡下（没有约定动作）
  const cam = await liveGame(host, [player], 'fitness');
  await request(`/games/${cam.id}/boss-fight`, { movement: 'squat' }, host.token);
  assert.equal((await request(`/games/${cam.id}/boss-fight/segment`, {}, host.token)).status, 409);
  // 游泳段模式：模板是每人 200 米、4 格
  const state = await fightState(game.id, host);
  assert.equal(state.template_id, 'swimming');
  assert.equal(state.segments_total, 4);
  assert.match(state.segment_label, /200 米/);
  assert.match(state.total_label, /800 米/);
});
