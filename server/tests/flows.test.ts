import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';

const temporary = mkdtempSync(path.join(tmpdir(), 'dajju-tests-'));
Object.assign(process.env, {
  SQLITE_PATH: path.join(temporary, 'test.db'), JWT_SECRET: 'isolated-test-secret-at-least-32-characters',
  STUDENT_ID_SALT: 'isolated-test-salt-at-least-32-characters', SMTP_USER: '', SMTP_PASS: '', ADMIN_EMAIL: '',
  ENV_FILE: path.join(temporary, 'absent.env'), NODE_ENV: 'test',
  AI_BASE_URL:'', AI_API_KEY:'', XIAOZHI_IDENTITY_MODE:'disabled',
});
const { pool, withTransaction, afterCommit } = require('../src/db');
const { AuthService } = require('../src/services/auth.service');
const { createCode } = require('../src/services/verify-code.service');
const { verifyToken, signToken } = require('../src/utils/jwt');
const games = require('../src/services/game.service');
const notifications = require('../src/services/notification.service');
const motion = require('../src/services/motion.service');
const { runCronTick } = require('../src/cron/state-machine');
const { server, io } = require('../src/app');
const { io: connect } = require('../../client/node_modules/socket.io-client');
let base: string;
let host: any, player1: any, player2: any;
const sockets: any[] = [];

test('four camera exercises settle by complete reps, demo stays zero and squat totals stay isolated', async () => {
  const owner=await account('camera-exercises'),other=await account('camera-other');
  const baseline=await motion.trainingState(owner.user.id);
  for(const sportType of ['squat','jumping_jack','high_knees','push_up']) {
    const started=await request('/sport-sessions',{sportType,source:'camera'},owner.token);
    assert.equal(started.status,200);const id=started.body.data.id;
    assert.equal((await request(`/sport-sessions/${id}/finish`,{reps:2},other.token)).status,404);
    const stats={reps:2,perfectReps:2,scoreAccumulator:{count:2,total:190,depth:190,stability:190,trunk:190,symmetry:190},correctionCounts:{body_alignment:1}};
    assert.equal((await request(`/sport-sessions/${id}/progress`,stats,owner.token)).status,200);
    await motion.sessionAction(id,owner.user.id,'pause');
    const restored=await motion.activeSession(owner.user.id);
    assert.equal(restored.reps,2);assert.equal(restored.metrics.formScore,95);assert.equal(restored.metrics.correctionCounts.body_alignment,1);
    await motion.sessionAction(id,owner.user.id,'resume');
    const finished=await motion.sessionAction(id,owner.user.id,'finish');assert.equal(finished.xpEarned,4);
    assert.equal((await motion.sessionAction(id,owner.user.id,'finish',{reps:999})).xpEarned,4);
    const demo=await motion.createSession(owner.user.id,{sportType,source:'demo'});
    assert.equal((await motion.sessionAction(demo.id,owner.user.id,'finish',{reps:20,formScore:100})).xpEarned,0);
    const zero=await motion.createSession(owner.user.id,{sportType,source:'camera'});
    assert.equal((await motion.sessionAction(zero.id,owner.user.id,'finish',{reps:0,formScore:100})).xpEarned,0);
  }
  const state=await motion.trainingState(owner.user.id);
  assert.equal(state.totalXp-baseline.totalXp,16);assert.equal(state.totalSquats,2);
  assert.equal(state.completedWorkoutCount,4);assert.equal(state.highScoreWorkoutCount,4);
  assert.equal(state.unlockedOutfits.violet_court,true);
  assert.equal(state.history.filter((s:any)=>s.source==='camera'&&s.reps===2).length,4);
  assert.equal((await motion.trainingState(other.user.id)).totalXp,0);
  await assert.rejects(motion.createSession(owner.user.id,{sportType:'burpee',source:'camera'}),/不支持/);
  await assert.rejects(motion.createSession(owner.user.id,{sportType:'toString',source:'demo'}),/不支持/);
});

test('camera metric merging survives pause, stale progress, rollback and concurrent finish',async()=>{
  const owner=await account('camera-merge');
  const row=await motion.createSession(owner.user.id,{sportType:'high_knees',source:'camera'});
  await assert.rejects(motion.createSession(owner.user.id,{id:row.id,sportType:'push_up',source:'camera'}),/不可更改/);
  await assert.rejects(motion.createSession(owner.user.id,{id:row.id,sportType:'high_knees',source:'demo'}),/不可更改/);
  const first={reps:1,formScore:90,perfectReps:1,formBreakdown:{depth:90,stability:85,trunk:95,symmetry:90}};
  await motion.sessionAction(row.id,owner.user.id,'progress',first);
  await motion.sessionAction(row.id,owner.user.id,'pause',{reps:2,scoreAccumulator:{count:2,total:180,depth:180,stability:170,trunk:190,symmetry:180}});
  await motion.sessionAction(row.id,owner.user.id,'resume');
  await motion.sessionAction(row.id,owner.user.id,'progress',{reps:1,formScore:10});
  let active=await motion.activeSession(owner.user.id);assert.equal(active.reps,2);assert.equal(active.metrics.formScore,90);assert.equal(active.metrics.perfectReps,1);
  await assert.rejects(motion.sessionAction(row.id,owner.user.id,'pause',{reps:2,scoreAccumulator:{count:2,total:999,depth:180,stability:170,trunk:190,symmetry:180}}),/评分累计/);
  active=await motion.activeSession(owner.user.id);assert.equal(active.status,'running');assert.equal(active.metrics.formScore,90);
  const results=await Promise.all([motion.sessionAction(row.id,owner.user.id,'finish'),motion.sessionAction(row.id,owner.user.id,'finish')]);
  assert.equal(results[0].xpEarned,4);assert.equal(results[1].xpEarned,4);assert.equal((await motion.trainingState(owner.user.id)).totalXp,4);
  const next=await motion.createSession(owner.user.id,{sportType:'push_up',source:'camera'});assert.equal((await motion.sessionAction(next.id,owner.user.id,'finish')).xpEarned,0);
});

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
function input(maxPlayers = 6, minutes = 120) {
  return { host_id: host.user.id, sport_type: 'basketball', campus_id: 1, location: '测试球场', max_players: maxPlayers, start_time: new Date(Date.now() + minutes * 60000).toISOString() };
}

test('new outfits share existing unlock rules, reject unauthorized choices and persist per account', async () => {
  const owner=await account('new-outfit-owner'), other=await account('new-outfit-other');
  const initial=await motion.trainingState(owner.user.id);
  for(const key of ['sea_runner','violet_court','sunlight_explorer','toString','__proto__']) {
    await assert.rejects(motion.updateAvatar(owner.user.id,{activeOutfit:key}),/未解锁/);
  }
  const demo=await motion.createSession(owner.user.id,{sportType:'squat',source:'demo'});
  await motion.sessionAction(demo.id,owner.user.id,'finish',{reps:100,formScore:100});
  assert.deepEqual((await motion.trainingState(owner.user.id)).unlockedOutfits,initial.unlockedOutfits);
  for(let i=0;i<3;i++) {
    const row=await motion.createSession(owner.user.id,{sportType:'squat',source:'camera'});
    await motion.sessionAction(row.id,owner.user.id,'finish',{reps:1,formScore:50});
  }
  let state=await motion.trainingState(owner.user.id);
  assert.equal(state.unlockedOutfits.sea_runner,true);assert.equal(state.unlockedOutfits.violet_court,false);
  for(let i=0;i<3;i++) {
    const row=await motion.createSession(owner.user.id,{sportType:'squat',source:'camera'});
    await motion.sessionAction(row.id,owner.user.id,'finish',{reps:i===2?500:1,formScore:95});
  }
  state=await motion.trainingState(owner.user.id);
  assert.equal(state.unlockedOutfits.sea_runner,state.unlockedOutfits.penguin);
  assert.equal(state.unlockedOutfits.violet_court,state.unlockedOutfits.sakura);
  assert.equal(state.unlockedOutfits.sunlight_explorer,state.unlockedOutfits.sunset_sakura);
  assert.equal(state.unlockedOutfits.sunlight_explorer,true);
  const saved=await request('/training/avatar',{avatarGender:'female',activeOutfit:'violet_court',seenOutfits:Object.keys(state.unlockedOutfits)},owner.token,'PATCH');
  assert.equal(saved.status,200);
  const persisted=await motion.trainingState(owner.user.id);
  assert.equal(persisted.activeOutfit,'violet_court');assert.equal(persisted.avatarGender,'female');
  assert.equal((await motion.trainingState(other.user.id)).activeOutfit,'default');
  assert.equal((await request('/training/avatar',{activeOutfit:'violet_court'},other.token,'PATCH')).status,403);
});
async function socketFor(token: string, gameId?: number) {
  const socket = connect(base, { autoConnect: false, auth: { token }, transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  const connected = once(socket, 'connect', { signal: AbortSignal.timeout(5000) }); socket.connect(); await connected;
  if (gameId) {
    const entered = once(socket, 'chat_mode', { signal: AbortSignal.timeout(5000) }); socket.emit('join_room', { gameId }); await entered;
  }
  return socket;
}
function send(socket: any, gameId: number, content: string): Promise<any> {
  return new Promise((resolve, reject) => socket.timeout(3000).emit('send_message', { gameId, content }, (error: any, reply: any) => error ? reject(error) : resolve(reply)));
}

before(async () => {
  await pool.query('SELECT 1');
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = 'http://127.0.0.1:' + server.address().port;
  host = await account('test-host'); player1 = await account('test-player1'); player2 = await account('test-player2');
});
after(async () => {
  sockets.forEach((socket) => socket.disconnect());
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

test('registration requires a valid unexpired code and grants activity access', async () => {
  const data = { email: 'registration@mails.jlu.edu.cn', nickname: '注册测试', password: 'TestPass123', campus_id: 1 };
  assert.equal((await request('/auth/register', data)).status, 400);
  assert.equal((await request('/auth/register', { ...data, verify_code: '000000' })).status, 400);
  const validCode = await createCode(data.email);
  const registered = await request('/auth/register', { ...data, verify_code: validCode });
  assert.equal(registered.status, 201); assert.equal(registered.body.data.user.email_verified, true);
  assert.equal(verifyToken(registered.body.data.token).email_verified, true);
  assert.equal((await request('/games', { ...input(), host_id: undefined }, registered.body.data.token)).status, 200);
  const game = await games.createGame(input());
  assert.equal((await request('/games/' + game.id + '/join', {}, registered.body.data.token)).status, 200);
  await assert.rejects(AuthService.register({ ...data, verify_code: validCode }), /已被注册/);
  const replayEmail = 'replay@mails.jlu.edu.cn', consumed = await createCode(replayEmail);
  await request('/verify/check', { email: replayEmail, code: consumed });
  assert.equal((await request('/auth/register', { ...data, email: replayEmail, verify_code: consumed })).status, 400);
  const expiryEmail = 'expired@mails.jlu.edu.cn', now = Date.now, expired = await createCode(expiryEmail);
  try {
    Date.now = () => now() + 6 * 60000;
    await assert.rejects(AuthService.register({ ...data, email: expiryEmail, verify_code: expired }), /验证码/);
  } finally { Date.now = now; }
});

test('profile edits persist preferences without changing growth or another account',async()=>{
  const before=await motion.trainingState(host.user.id);
  const result=await request('/users/me',{nickname:'运动资料测试',department:'测试院系',campus_id:1,sport_preferences:JSON.stringify(['running','basketball']),qq_email:''},host.token,'PUT');
  assert.equal(result.status,200);
  const saved=await request('/users/me',undefined,host.token);
  assert.equal(saved.body.data.nickname,'运动资料测试');
  assert.deepEqual(saved.body.data.sport_preferences,['running','basketball']);
  assert.equal((await motion.trainingState(host.user.id)).totalXp,before.totalXp);
  assert.deepEqual((await request('/users/me',undefined,player1.token)).body.data.sport_preferences,[]);
});

test('personal activity cards show XP growth instead of legacy points',async()=>{
  const owner=await account('personal-game-growth');
  await games.createGame({...input(),host_id:owner.user.id});
  const row=await motion.createSession(owner.user.id,{sportType:'squat',source:'camera'});
  await motion.sessionAction(row.id,owner.user.id,'finish',{reps:3});
  await pool.query('UPDATE users SET reward_points=99,reward_level=8 WHERE id=$1',[owner.user.id]);
  const response=await request('/users/me/games',undefined,owner.token);
  assert.equal(response.status,200);assert.equal(response.body.data[0].host_reward_points,6);assert.equal(response.body.data[0].host_reward_level,1);
});

test('missing profile fields are backed up and repaired without replacing motion data',async()=>{
  const copy=path.join(temporary,'profile-legacy.db');await pool.query('VACUUM INTO $1',[copy]);
  const legacy=new DatabaseSync(copy);legacy.exec('ALTER TABLE users DROP COLUMN sport_preferences');
  const motionBefore=legacy.prepare('SELECT * FROM motion_profiles ORDER BY user_id').all();legacy.close();
  const repair=spawnSync(process.execPath,['--import','tsx','-e',"require('./src/db').pool.query('SELECT 1').then(()=>process.exit(0)).catch(()=>process.exit(1))"],{cwd:process.cwd(),encoding:'utf8',timeout:10000,env:{...process.env,SQLITE_PATH:copy}});
  assert.equal(repair.status,0,repair.stderr);assert.match(repair.stdout,/迁移前备份/);
  assert.ok(readdirSync(path.join(temporary,'backups')).some(name=>name.startsWith('profile-legacy-pre-profile-')));
  const repaired=new DatabaseSync(copy,{readOnly:true});
  assert.ok((repaired.prepare('PRAGMA table_info(users)').all() as any[]).some(c=>c.name==='sport_preferences'));
  assert.deepEqual(repaired.prepare('SELECT * FROM motion_profiles ORDER BY user_id').all(),motionBefore);repaired.close();
});

test('existing unverified accounts receive a refreshed session', async () => {
  const existing = await account('legacy');
  await pool.query('UPDATE users SET email_verified = 0 WHERE id = $1', [existing.user.id]);
  const oldToken = signToken({ sub: existing.user.id, email: existing.user.email, email_verified: false });
  assert.equal((await request('/games', { ...input(), host_id: undefined }, oldToken)).status, 403);
  const response = await request('/auth/verify-email', { code: await createCode(existing.user.email) }, oldToken);
  assert.equal(response.status, 200); assert.equal(response.body.data.user.email_verified, true);
  assert.equal(verifyToken(response.body.data.token).email_verified, true);
  assert.equal((await request('/games', { ...input(), host_id: undefined }, response.body.data.token)).status, 200);
});

test('simultaneous joins succeed when capacity is available', async () => {
  const game = await games.createGame(input(3));
  await Promise.all([games.joinGame(game.id, player1.user.id), games.joinGame(game.id, player2.user.id)]);
  const detail = await games.getGameDetail(game.id);
  assert.equal(detail.game.member_count, 3); assert.equal(detail.members.length, 3); assert.equal(detail.game.status, 'full');
});

test('last slot competition, duplicates, leaving and cancellation preserve membership', async () => {
  const game = await games.createGame(input(2));
  const results = await Promise.allSettled([games.joinGame(game.id, player1.user.id), games.joinGame(game.id, player2.user.id)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const winner = results[0].status === 'fulfilled' ? player1 : player2;
  await assert.rejects(games.joinGame(game.id, winner.user.id), /已满员|已在该局/);
  await pool.query('UPDATE users SET reward_points=10 WHERE id=$1',[winner.user.id]);
  await games.leaveGame(game.id, winner.user.id);
  assert.equal((await pool.query('SELECT reward_points FROM users WHERE id=$1',[winner.user.id])).rows[0].reward_points,10);
  const left = await games.getGameDetail(game.id); assert.equal(left.game.member_count, 1); assert.equal(left.members.length, 1);
  await games.joinGame(game.id, winner.user.id);
  await assert.rejects(games.cancelGame(game.id, winner.user.id), /仅发起人/);
  await games.cancelGame(game.id, host.user.id);
  assert.equal((await games.getGameDetail(game.id)).game.status, 'cancelled');
  await assert.rejects(games.joinGame(game.id, player2.user.id), /不允许加入/);
});

test('rollback isolates concurrent readers, nested queries and post-commit failures', async () => {
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const original = (await pool.query('SELECT nickname FROM users WHERE id = $1', [host.user.id])).rows[0].nickname;
  const failing = withTransaction(async (client: any) => {
    await client.query('UPDATE users SET nickname = $1 WHERE id = $2', ['uncommitted', host.user.id]);
    await withTransaction(async () => { assert.equal((await pool.query('SELECT nickname FROM users WHERE id = $1', [host.user.id])).rows[0].nickname, 'uncommitted'); });
    entered(); await gate; throw new Error('rollback-probe');
  });
  const rejected = assert.rejects(failing, /rollback-probe/);
  await started;
  let readFinished = false;
  const reader = pool.query('SELECT nickname FROM users WHERE id = $1', [host.user.id]).then((result: any) => { readFinished = true; return result; });
  await new Promise((resolve) => setTimeout(resolve, 20)); assert.equal(readFinished, false);
  release(); await rejected; assert.equal((await reader).rows[0].nickname, original);
  await withTransaction(async (client: any) => {
    await client.query('UPDATE users SET department = $1 WHERE id = $2', ['committed', host.user.id]);
    afterCommit(async () => { throw new Error('intentional-side-effect-failure'); });
  });
  assert.equal((await pool.query('SELECT department FROM users WHERE id = $1', [host.user.id])).rows[0].department, 'committed');
  assert.ok((await games.createGame(input())).id);
});

test('chat persists, broadcasts to both accounts, reconnects and rejects invalid sends', async () => {
  const game = await games.createGame(input()); await games.joinGame(game.id, player1.user.id);
  const first = await socketFor(host.token, game.id), second = await socketFor(player1.token, game.id);
  const hostEvent = once(first, 'new_message'), memberEvent = once(second, 'new_message');
  const messageNotification = once(second, 'notification', { signal: AbortSignal.timeout(5000) });
  const reply = await send(first, game.id, '晚上球场见');
  assert.ok(reply.message.id); assert.ok(!Number.isNaN(Date.parse(reply.message.created_at)));
  assert.equal((await hostEvent)[0].id, reply.message.id); assert.equal((await memberEvent)[0].content, '晚上球场见');
  assert.match((await messageNotification)[0].content, /晚上球场见/);
  const history = await request('/games/' + game.id + '/messages', undefined, player1.token);
  assert.equal(history.body.data.messages[0].content, '晚上球场见');
  second.disconnect();
  const reconnected = await socketFor(player1.token, game.id);
  const received = once(reconnected, 'new_message'); await send(first, game.id, '重连后仍能收到');
  assert.equal((await received)[0].content, '重连后仍能收到');
  const latest = await request('/games/' + game.id + '/messages', undefined, player1.token);
  assert.equal(latest.body.data.messages[0].content, '重连后仍能收到');
  const older = await request('/games/' + game.id + '/messages?before_id=' + latest.body.data.messages[0].id, undefined, player1.token);
  assert.equal(older.body.data.messages[0].id, reply.message.id);
  assert.ok(latest.body.data.messages[0].id > reply.message.id);
  assert.match((await send(first, game.id, '')).error, /不能为空/);
  const outsider = await socketFor(player2.token);
  const denied = once(outsider, 'error', { signal: AbortSignal.timeout(5000) });
  outsider.emit('join_room', { gameId: game.id });
  assert.match((await denied)[0].message, /未加入/);
  assert.equal((await request('/games/' + game.id + '/messages', undefined, player2.token)).status, 403);
  assert.equal(io.sockets.adapter.rooms.get('game:' + game.id).has(outsider.id), false);
  assert.match((await send(outsider, game.id, '未加入发送')).error, /未加入/);
  await games.leaveGame(game.id, player1.user.id);
  assert.equal(io.sockets.adapter.rooms.get('game:' + game.id).has(reconnected.id), false);
  assert.equal((await request('/games/' + game.id + '/messages', undefined, player1.token)).status, 403);
});

test('account rooms deliver notifications to all authenticated sessions without a process-local presence index', async () => {
  const first = await socketFor(player2.token), second = await socketFor(player2.token);
  const outsider = await socketFor(host.token);
  const received: any[] = []; outsider.on('notification', (item: any) => received.push(item));
  const { redis } = require('../src/db'); await redis.del(`user:${player2.user.id}:sockets`);
  const firstEvent = once(first, 'notification', { signal: AbortSignal.timeout(5000) });
  const secondEvent = once(second, 'notification', { signal: AbortSignal.timeout(5000) });
  await games.createNotification({ user_id: player2.user.id, game_id: null, type: 'member_joined', title: '多会话通知', content: '仅接收者可见' });
  const [a, b] = await Promise.all([firstEvent, secondEvent]);
  assert.equal(a[0].title, '多会话通知'); assert.equal(a[0].id, b[0].id);
  assert.equal(received.length, 0);
});

test('notifications update unread counts idempotently', async () => {
  await notifications.markAllRead(player2.user.id);
  await games.createNotification({ user_id: player2.user.id, game_id: 1, type: 'member_joined', title: '测试通知', content: '测试' });
  assert.equal(await notifications.getUnreadCount(player2.user.id), 1);
  const { redis } = require('../src/db');
  await redis.set('notif:' + player2.user.id + ':unread', '999');
  assert.equal(await notifications.getUnreadCount(player2.user.id), 1);
  const list = await notifications.getNotifications(player2.user.id);
  const id = list.notifications.find((item: any) => !item.is_read).id;
  assert.equal((await request('/notifications/' + id + '/read', {}, player2.token, 'PUT')).status, 200);
  await notifications.markRead(id, player2.user.id);
  assert.equal(await notifications.getUnreadCount(player2.user.id), 0);
});

test('cron readiness, attendance and completion settle personal XP exactly once', async () => {
  const beforeHost = (await pool.query('SELECT reward_points FROM users WHERE id = $1', [host.user.id])).rows[0].reward_points;
  const beforePlayer = (await pool.query('SELECT reward_points FROM users WHERE id = $1', [player1.user.id])).rows[0].reward_points;
  const xpHost = (await motion.trainingState(host.user.id)).totalXp;
  const xpPlayer = (await motion.trainingState(player1.user.id)).totalXp;
  const game = await games.createGame(input(2, 10)); await games.joinGame(game.id, player1.user.id);
  const viewer = await socketFor(player1.token, game.id); const changed = once(viewer, 'game_update');
  await Promise.all([runCronTick(), runCronTick()]);
  assert.equal((await changed)[0].changes.status, 'ready');
  assert.equal((await games.getGameDetail(game.id)).game.status, 'ready');
  await assert.rejects(games.confirmAttendance(game.id, host.user.id, player1.user.id), /没有签到/);
  await Promise.all([games.checkInForGame(game.id, host.user.id), games.checkInForGame(game.id, player1.user.id)]);
  await assert.rejects(games.checkInForGame(game.id, player1.user.id), /已经签到/);
  await games.confirmAttendance(game.id, host.user.id, player1.user.id);
  await assert.rejects(games.startGameWithAuth(game.id, player1.user.id), /仅发起人/);
  await games.startGameWithAuth(game.id, host.user.id);
  const hostSession=await motion.createSession(host.user.id,{sportType:'basketball',source:'timer',gameId:game.id});
  const playerSession=await motion.createSession(player1.user.id,{sportType:'basketball',source:'timer',gameId:game.id});
  await pool.query('UPDATE sport_sessions SET effective_ms=$2,active_since=NULL WHERE id=$1',[hostSession.id,60000]);
  await pool.query('UPDATE sport_sessions SET effective_ms=$2,active_since=NULL WHERE id=$1',[playerSession.id,120000]);
  await games.completeGameWithAuth(game.id, host.user.id);
  await assert.rejects(games.completeGameWithAuth(game.id, host.user.id), /只能结束/);
  await assert.rejects(games.completeGameBySystem(game.id), /只能自动结束/);
  await runCronTick();
  assert.equal((await pool.query('SELECT reward_points FROM users WHERE id = $1', [host.user.id])).rows[0].reward_points, beforeHost);
  assert.equal((await pool.query('SELECT reward_points FROM users WHERE id = $1', [player1.user.id])).rows[0].reward_points, beforePlayer);
  assert.equal((await motion.trainingState(host.user.id)).totalXp,xpHost+2);
  assert.equal((await motion.trainingState(player1.user.id)).totalXp,xpPlayer+4);
  assert.equal((await motion.sessionAction(hostSession.id,host.user.id,'finish')).xpEarned,2);
  const completed = (await games.getGameDetail(game.id)).game;
  assert.ok(Math.abs(new Date(completed.completed_at).getTime() - Date.now()) < 5000);
  assert.match((await send(viewer, game.id, '已结束不能发送')).error, /只读/);
});

test('sport rates use only volume and round accumulated seconds', () => {
  for(const sport of ['basketball','badminton','soccer','volleyball','tennis','table_tennis']) assert.equal(motion.calculateXp(sport,90,500,'timer'),3);
  assert.equal(motion.calculateXp('running',40,0,'timer'),2);
  assert.equal(motion.calculateXp('swimming',60,0,'timer'),3);
  assert.equal(motion.calculateXp('fitness',59,0,'timer'),0);
  assert.equal(motion.calculateXp('custom',120,0,'timer'),2);
  assert.equal(motion.calculateXp('squat',300,20,'camera'),40);
  assert.equal(motion.calculateXp('squat',300,20,'demo'),0);
  assert.equal(motion.calculateXp('squat',300,0,'camera'),0);
});

test('personal timing excludes pauses, recovers and settles once across simultaneous requests', async()=>{
  const row=await motion.createSession(host.user.id,{sportType:'running',source:'timer'});
  await assert.rejects(motion.createSession(host.user.id,{sportType:'running',source:'timer'}),/已有运动/);
  await pool.query('UPDATE sport_sessions SET active_since=$2 WHERE id=$1',[row.id,new Date(Date.now()-20000).toISOString()]);
  const paused=await motion.sessionAction(row.id,host.user.id,'pause');assert.equal(paused.status,'paused');assert.ok(paused.effectiveSeconds>=20);
  const recovered=await request('/sport-sessions/active',undefined,host.token);assert.equal(recovered.body.data.id,row.id);
  const ms=(await pool.query('SELECT effective_ms FROM sport_sessions WHERE id=$1',[row.id])).rows[0].effective_ms;
  await motion.sessionAction(row.id,host.user.id,'pause');assert.equal((await pool.query('SELECT effective_ms FROM sport_sessions WHERE id=$1',[row.id])).rows[0].effective_ms,ms);
  await motion.sessionAction(row.id,host.user.id,'resume');
  await pool.query('UPDATE sport_sessions SET active_since=$2 WHERE id=$1',[row.id,new Date(Date.now()-20000).toISOString()]);
  const before=(await motion.trainingState(host.user.id)).totalXp;
  const finished=await Promise.all([motion.sessionAction(row.id,host.user.id,'finish'),motion.sessionAction(row.id,host.user.id,'finish')]);
  assert.equal(finished[0].xpEarned,2);assert.equal(finished[1].xpEarned,2);
  assert.equal((await motion.trainingState(host.user.id)).totalXp,before+2);
  assert.equal((await pool.query('SELECT * FROM xp_ledger WHERE session_id=$1',[row.id])).rowCount,1);
  const intervals=(await pool.query('SELECT * FROM sport_intervals WHERE session_id=$1 ORDER BY id',[row.id])).rows;
  assert.equal(intervals.length,2);
  assert.ok(intervals.every((i:any)=>i.ended_at && i.effective_ms>=20000));
  assert.equal(intervals.reduce((sum:number,i:any)=>sum+i.effective_ms,0),(await pool.query('SELECT effective_ms FROM sport_sessions WHERE id=$1',[row.id])).rows[0].effective_ms);
});

test('accounts own records and equipment; demo and empty camera sessions grant no XP or unlocks',async()=>{
  const before=await motion.trainingState(player2.user.id);
  const demo=await motion.createSession(player2.user.id,{sportType:'squat',source:'demo'});
  assert.equal((await request('/sport-sessions/'+demo.id+'/finish',{reps:100,formScore:100},host.token)).status,404);
  const result=await motion.sessionAction(demo.id,player2.user.id,'finish',{reps:100,formScore:100,image:'must-not-persist',visionInsights:['must-not-persist']});assert.equal(result.xpEarned,0);
  const empty=await motion.createSession(player2.user.id,{sportType:'squat',source:'camera'});
  await motion.sessionAction(empty.id,player2.user.id,'finish',{reps:0,formScore:100});
  const afterState=await motion.trainingState(player2.user.id);
  assert.equal(afterState.totalXp,before.totalXp);assert.equal(afterState.completedWorkoutCount,before.completedWorkoutCount);
  assert.equal(afterState.ownedEquipment.includes('sakura_gloves'),false);
  assert.equal(afterState.unlockedOutfits.penguin,false);
  assert.ok(!afterState.history[0].image);assert.ok(!afterState.history[0].visionInsights);
  await assert.rejects(motion.updateAvatar(player2.user.id,{activeOutfit:'penguin'}),/未解锁/);
  await assert.rejects(motion.updateAvatar(player2.user.id,{equipped:{gloves:'sakura_gloves'}}),/未解锁/);
  await assert.rejects(motion.updateAvatar(player2.user.id,{equipped:{shoes:'shiba_bottle'}}),/部位/);
  assert.equal((await motion.updateAvatar(player2.user.id,{avatarGender:'female',equipped:{head:'sunset_bandana'}})).avatarGender,'female');
  assert.equal((await motion.trainingState(host.user.id)).avatarGender,'male');
});

test('game timing requires check-in, clips on completion and serializes finish races',async()=>{
  const game=await games.createGame(input(3,10));await games.joinGame(game.id,player1.user.id);await games.joinGame(game.id,player2.user.id);
  await assert.rejects(motion.createSession(host.user.id,{sportType:'basketball',source:'timer',gameId:game.id}),/签到/);
  await runCronTick();await games.checkInForGame(game.id,host.user.id);await games.checkInForGame(game.id,player1.user.id);await games.checkInForGame(game.id,player2.user.id);
  await assert.rejects(motion.createSession(host.user.id,{sportType:'basketball',source:'timer',gameId:game.id}),/活动开始/);
  await games.confirmAttendance(game.id,host.user.id,player1.user.id);await games.startGameWithAuth(game.id,host.user.id);
  const records=await Promise.all([host,player1,player2].map(a=>motion.createSession(a.user.id,{sportType:'running',source:'timer',gameId:game.id})));
  for(const row of records)await pool.query('UPDATE sport_sessions SET effective_ms=60000,active_since=NULL WHERE id=$1',[row.id]);
  const before=(await motion.trainingState(host.user.id)).totalXp;
  await Promise.all([games.completeGameWithAuth(game.id,host.user.id),motion.sessionAction(records[0].id,host.user.id,'finish')]);
  assert.equal((await motion.trainingState(host.user.id)).totalXp,before+2);
  assert.equal((await motion.trainingState(player2.user.id)).sessions.find((s:any)=>s.id===records[2].id).xpEarned,0);
  assert.equal(await motion.activeSession(host.user.id),null);
  await assert.rejects(motion.sessionAction(records[0].id,host.user.id,'resume'),/已结算/);
  assert.equal((await motion.trainingState(host.user.id)).sessions.find((s:any)=>s.id===records[0].id).sportType,'basketball');
});

test('coach routes require login and preserve local fallback without external services',async()=>{
  assert.equal((await fetch(base+'/api/v1/auth/missing-route')).status,404);
  assert.equal((await fetch(base+'/uploads/missing-avatar.png')).status,404);
  const unauth=await fetch(base+'/ai/__status');assert.equal(unauth.status,401);
  const status=await fetch(base+'/ai/__status',{headers:{Authorization:'Bearer '+host.token}});assert.deepEqual(await status.json(),{configured:false,xiaozhiEnabled:false,xiaozhiMode:'disabled'});
  const device=await fetch(base+'/api/xiaozhi/device',{method:'POST',headers:{Authorization:'Bearer '+host.token}});assert.equal(device.status,503);
});

test('voice origins allow the local demo while retaining production and foreign-origin restrictions',()=>{
  const {isAllowedOrigin}=require('../src/xiaozhi/identity');
  for(const origin of ['http://localhost:3001','http://127.0.0.1:3001']) {
    assert.equal(isAllowedOrigin(origin,undefined,'development'),true);
    assert.equal(isAllowedOrigin(origin,undefined,'production'),false);
    assert.equal(isAllowedOrigin(origin,origin,'production'),true);
  }
  assert.equal(isAllowedOrigin('http://localhost:3001.evil.example',undefined,'development'),false);
  assert.equal(isAllowedOrigin(undefined,undefined,'development'),false);
});

test('HTTP coach proxy and separate authenticated voice WebSocket share the backend',async()=>{
  let received:any;
  const upstream=createServer((req,res)=>{
    let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
      received={url:req.url,authorization:req.headers.authorization,body:JSON.parse(body)};
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'保持节奏'}}]}));
    });
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  process.env.AI_BASE_URL='http://127.0.0.1:'+(upstream.address() as any).port+'/v1';process.env.AI_API_KEY='mock-upstream-key';
  try{
    const response=await fetch(base+'/ai/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+host.token,'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'继续吗？'}],stream:true,max_tokens:999})});
    assert.equal(response.status,200);assert.equal((await response.json() as any).choices[0].message.content,'保持节奏');
    assert.equal(received.url,'/v1/chat/completions');assert.equal(received.authorization,'Bearer mock-upstream-key');assert.equal(received.body.stream,false);assert.equal(received.body.max_tokens,120);
  }finally{process.env.AI_BASE_URL='';process.env.AI_API_KEY='';await new Promise<void>(resolve=>upstream.close(()=>resolve()));}
  const unauth=new WebSocket(base.replace('http:','ws:')+'/api/xiaozhi/socket');unauth.on('error',()=>{});
  const rejected=await new Promise<number>(resolve=>unauth.on('unexpected-response',(_req,res)=>{resolve(res.statusCode!);unauth.terminate();}));assert.equal(rejected,401);
  const authed=new WebSocket(base.replace('http:','ws:')+'/api/xiaozhi/socket',{headers:{Cookie:'motion_account='+host.token,Origin:base}});
  const [code]=await once(authed,'close',{signal:AbortSignal.timeout(5000)});assert.equal(code,4403);
});

test('invalid database paths stop startup with a nonzero exit', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'src/app.ts'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, SQLITE_PATH: temporary, PORT: '0' },
  });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /数据库初始化失败/);
});

test('abnormal voice disconnects cannot crash the backend and the next bridge still works',async()=>{
  const {attachXiaozhi,upstreamCloseCode}=require('../src/xiaozhi/socket');
  const {createDeviceIdentity,encryptIdentity,IDENTITY_COOKIE}=require('../src/xiaozhi/identity');
  for(const code of [0,999,1004,1005,1006,1015,2999,5000,1000.5])assert.equal(upstreamCloseCode(code),1012);
  for(const code of [1000,1001,1011,1012,4401,4403])assert.equal(upstreamCloseCode(code),code);
  const upstreamHttp=createServer(),bridgeHttp=createServer();
  const upstreamWs=new WebSocketServer({server:upstreamHttp});
  let attempts=0;
  upstreamWs.on('connection',ws=>{
    if(++attempts===1)return ws.terminate();
    ws.on('message',(data,binary)=>ws.send(data,{binary}));
  });
  upstreamHttp.listen(0,'127.0.0.1');await once(upstreamHttp,'listening');
  const upstreamUrl='ws://127.0.0.1:'+(upstreamHttp.address() as any).port;
  const bridgeWs=attachXiaozhi(bridgeHttp,async()=>({websocket:{url:upstreamUrl,token:'test-voice-token'}}));
  bridgeHttp.listen(0,'127.0.0.1');await once(bridgeHttp,'listening');
  const bridgeBase='http://127.0.0.1:'+(bridgeHttp.address() as any).port;
  const oldMode=process.env.XIAOZHI_IDENTITY_MODE,oldOrigins=process.env.XIAOZHI_ALLOWED_ORIGINS;
  process.env.XIAOZHI_IDENTITY_MODE='personal';process.env.XIAOZHI_ALLOWED_ORIGINS=bridgeBase;
  const identity={...createDeviceIdentity(),userId:host.user.id,activated:true};
  const options={headers:{Origin:bridgeBase,Cookie:`motion_account=${host.token}; ${IDENTITY_COOKIE}=${encryptIdentity(identity)}`}};
  let browser:WebSocket|undefined;
  try{
    browser=new WebSocket(bridgeBase.replace('http:','ws:')+'/api/xiaozhi/socket',options);
    const [code]=await once(browser,'close',{signal:AbortSignal.timeout(5000)});assert.equal(code,1012);
    assert.equal((await fetch(base+'/ai/__status',{headers:{Authorization:'Bearer '+host.token}})).status,200);
    browser=new WebSocket(bridgeBase.replace('http:','ws:')+'/api/xiaozhi/socket',options);
    const echoed=new Promise<string>((resolve,reject)=>{
      browser!.on('error',reject);browser!.on('message',data=>{
        const text=data.toString();if(text.includes('"bridge":"ready"'))browser!.send('voice-bridge-recovered');else resolve(text);
      });
    });
    assert.equal(await Promise.race([echoed,new Promise((_,reject)=>{const timeout=setTimeout(()=>reject(new Error('voice echo timed out')),5000);timeout.unref()})]),'voice-bridge-recovered');
    const closed=once(browser,'close');browser.close(1000);await closed;
    assert.equal(attempts,2);
  }finally{
    browser?.terminate();
    process.env.XIAOZHI_IDENTITY_MODE=oldMode;
    if(oldOrigins===undefined)delete process.env.XIAOZHI_ALLOWED_ORIGINS;else process.env.XIAOZHI_ALLOWED_ORIGINS=oldOrigins;
    for(const ws of upstreamWs.clients)ws.terminate();for(const ws of bridgeWs.clients)ws.terminate();
    await Promise.all([new Promise<void>(resolve=>upstreamWs.close(()=>resolve())),new Promise<void>(resolve=>bridgeWs.close(()=>resolve()))]);
    await Promise.all([new Promise<void>(resolve=>upstreamHttp.close(()=>resolve())),new Promise<void>(resolve=>bridgeHttp.close(()=>resolve()))]);
  }
});

test('incremental motion migration backs up and preserves legacy accounts and activities',async()=>{
  const copy=path.join(temporary,'legacy.db');
  await pool.query('VACUUM INTO $1',[copy]);
  const legacy=new DatabaseSync(copy);
  legacy.exec('DROP TABLE xp_ledger; DROP TABLE sport_intervals; DROP TABLE sport_sessions; DROP TABLE motion_profiles;');
  const usersBefore=legacy.prepare('SELECT COUNT(*) AS n FROM users').get() as any;
  const gamesBefore=legacy.prepare('SELECT COUNT(*) AS n FROM games').get() as any;
  legacy.close();
  const migrated=spawnSync(process.execPath,['--import','tsx','-e',"require('./src/db').pool.query('SELECT 1').then(()=>process.exit(0)).catch(()=>process.exit(1))"],{
    cwd:process.cwd(),encoding:'utf8',timeout:10000,env:{...process.env,SQLITE_PATH:copy},
  });
  assert.equal(migrated.status,0,migrated.stderr);
  assert.match(migrated.stdout,/迁移前备份/);
  assert.ok(readdirSync(path.join(temporary,'backups')).some(name=>name.startsWith('legacy-pre-motion-')));
  const db=new DatabaseSync(copy,{readOnly:true});
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM users').get() as any).n,usersBefore.n);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM games').get() as any).n,gamesBefore.n);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM motion_profiles').get() as any).n,0);
  db.close();
});
