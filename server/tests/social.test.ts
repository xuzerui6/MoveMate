import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

const temporary = mkdtempSync(path.join(tmpdir(), 'dajju-social-tests-'));
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
const notifications = require('../src/services/notification.service');
const Social = require('../src/services/social.service');
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
function gameInput(hostId: number, extra: Record<string, unknown> = {}, minutes = 60 * 48) {
  return {
    host_id: hostId, sport_type: 'basketball', campus_id: 1, location: '测试球场', max_players: 6,
    start_time: new Date(Date.now() + minutes * 60000).toISOString(), ...extra,
  };
}
async function notifTypes(userId: number): Promise<string[]> {
  const result = await notifications.getNotifications(userId, 1, 50);
  return result.notifications.map((n: any) => n.type);
}
async function makeFriends(a: any, b: any) {
  const sent = await request('/friends/requests', { userId: b.user.id }, a.token);
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const incoming = await request('/friends/requests', undefined, b.token);
  const reqRow = incoming.body.data.requests.find((r: any) => r.requester_id === a.user.id);
  assert.ok(reqRow, 'b should see the incoming request');
  const accepted = await request(`/friends/requests/${reqRow.id}/accept`, {}, b.token);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
}

before(async () => {
  await pool.query('SELECT 1');
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { await new Promise<void>((resolve) => io.close(() => resolve())); });

test('friend request → accept flow, list fields, reject is silent, delete is silent', async () => {
  const a = await account('soc-flow-a'), b = await account('soc-flow-b'), c = await account('soc-flow-c');
  // 申请带问候
  const sent = await request('/friends/requests', { userId: b.user.id, greeting: '下次一起打球' }, a.token);
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.ok((await notifTypes(b.user.id)).includes('friend_request'));
  // 重复申请被拒
  assert.equal((await request('/friends/requests', { userId: b.user.id }, a.token)).status, 409);
  // 接受
  const incoming = await request('/friends/requests', undefined, b.token);
  const reqRow = incoming.body.data.requests.find((r: any) => r.requester_id === a.user.id);
  assert.equal(reqRow.greeting, '下次一起打球');
  assert.equal((await request(`/friends/requests/${reqRow.id}/accept`, {}, b.token)).status, 200);
  assert.ok((await notifTypes(a.user.id)).includes('friend_accepted'));
  const listA = await request('/friends', undefined, a.token);
  assert.equal(listA.body.data.friends.length, 1);
  assert.equal(listA.body.data.friends[0].user_id, b.user.id);
  assert.ok('together_count' in listA.body.data.friends[0]);
  assert.ok('sport_preferences' in listA.body.data.friends[0]);

  // 拒绝静默：c 拒绝 a 后，a 不应收到任何新通知
  await request('/friends/requests', { userId: c.user.id }, a.token);
  const beforeTypes = await notifTypes(a.user.id);
  const incomingC = await request('/friends/requests', undefined, c.token);
  const reqC = incomingC.body.data.requests.find((r: any) => r.requester_id === a.user.id);
  assert.equal((await request(`/friends/requests/${reqC.id}/reject`, {}, c.token)).status, 200);
  assert.deepEqual(await notifTypes(a.user.id), beforeTypes);
  assert.equal((await request('/friends', undefined, c.token)).body.data.friends.length, 0);

  // 删除好友静默
  const beforeB = await notifTypes(b.user.id);
  assert.equal((await request(`/friends/${b.user.id}`, undefined, a.token, 'DELETE')).status, 200);
  assert.equal((await request('/friends', undefined, a.token)).body.data.friends.length, 0);
  assert.deepEqual(await notifTypes(b.user.id), beforeB);
});

test('invite code: preview shows inviter, request via code works, scope played_together blocks strangers but not invite links', async () => {
  const owner = await account('soc-invite-owner'), stranger = await account('soc-invite-stranger');
  const mine = await request('/users/me/invite', undefined, owner.token);
  assert.equal(mine.status, 200);
  assert.ok(mine.body.data.invite_code);
  const preview = await request('/friends/invite-preview', { inviteCode: mine.body.data.invite_code }, stranger.token);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data.inviter.id, owner.user.id);
  assert.equal(preview.body.data.inviter.nickname, owner.user.nickname);

  // owner 设置为只接受一起练过的人
  const settings = await request('/users/me/social-settings', { friend_request_scope: 'played_together' }, owner.token, 'PUT');
  assert.equal(settings.status, 200, JSON.stringify(settings.body));
  assert.equal(settings.body.data.friend_request_scope, 'played_together');
  // 陌生人直接申请 → 拒绝
  assert.equal((await request('/friends/requests', { userId: owner.user.id }, stranger.token)).status, 403);
  // 走邀请链接 → 豁免，可以申请
  assert.equal((await request('/friends/requests', { inviteCode: mine.body.data.invite_code }, stranger.token)).status, 200);
});

test('block prevents friend request, game join and invite; chat masking and profile reduction apply', async () => {
  const host = await account('soc-block-host'), p = await account('soc-block-p');
  await makeFriends(host, p);
  const game = await games.createGame(gameInput(host.user.id));
  // 先正常加入并聊天
  await games.joinGame(game.id, p.user.id);
  const msg = await request(`/games/${game.id}/messages`, { content: '大家好我是p' }, p.token);
  assert.equal(msg.status, 201, JSON.stringify(msg.body));
  const seenBefore = await request(`/games/${game.id}/messages`, undefined, host.token);
  assert.ok(seenBefore.body.data.messages.some((m: any) => m.content === '大家好我是p' && !m.masked));

  // host 拉黑 p
  assert.equal((await request('/blocks', { userId: p.user.id }, host.token)).status, 200);
  // 好友关系被解除
  assert.equal((await request('/friends', undefined, host.token)).body.data.friends.length, 0);
  // p 不能再发好友申请
  assert.equal((await request('/friends/requests', { userId: host.user.id }, p.token)).status, 403);
  // p 不能加入 host 的新局
  const game2 = await games.createGame(gameInput(host.user.id));
  await assert.rejects(games.joinGame(game2.id, p.user.id), /没法加入/);
  // 邀请被跳过（已不是好友 + 拉黑）
  const invite = await request(`/games/${game2.id}/invites`, { userIds: [p.user.id] }, host.token);
  assert.equal(invite.body.data.invited.length, 0);
  assert.equal(invite.body.data.skipped.length, 1);
  // 聊天屏蔽：host 看不到 p 的发言内容
  const seenAfter = await request(`/games/${game.id}/messages`, undefined, host.token);
  const maskedMsg = seenAfter.body.data.messages.find((m: any) => m.sender_id === p.user.id);
  assert.equal(maskedMsg.masked, true);
  assert.equal(maskedMsg.content, '');
  // p 自己看自己的消息不受影响
  const seenSelf = await request(`/games/${game.id}/messages`, undefined, p.token);
  assert.ok(seenSelf.body.data.messages.some((m: any) => m.content === '大家好我是p'));
  // 资料卡降级：只剩昵称头像
  const card = await request(`/users/public/${p.user.id}`, undefined, host.token);
  assert.equal(card.body.data.department, '');
  assert.deepEqual(card.body.data.sport_preferences, []);
  assert.ok(!('recent_games' in card.body.data));
  // 解除拉黑后可重新申请
  assert.equal((await request(`/blocks/${p.user.id}`, undefined, host.token, 'DELETE')).status, 200);
  assert.equal((await request('/friends/requests', { userId: host.user.id }, p.token)).status, 200);
});

test('friends game hidden from lobby and non-friends, visible to friends, fill_open lists it publicly', async () => {
  const host = await account('soc-fg-host'), friend = await account('soc-fg-friend'), stranger = await account('soc-fg-stranger');
  await makeFriends(host, friend);
  const created = await request('/games', {
    sport_type: 'badminton', campus_id: 1, location: '羽毛球馆', max_players: 4,
    start_time: new Date(Date.now() + 48 * 3600000).toISOString(), visibility: 'friends',
  }, host.token);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const gameId = created.body.data.game.id;
  assert.equal(created.body.data.game.visibility, 'friends');

  // 大厅看不到
  const lobby = await request('/games', undefined, stranger.token);
  assert.ok(!lobby.body.data.games.some((g: any) => g.id === gameId));
  // 非好友详情 404、加入 403
  assert.equal((await request(`/games/${gameId}`, undefined, stranger.token)).status, 404);
  assert.equal((await request(`/games/${gameId}/join`, {}, stranger.token)).status, 403);
  // 好友动态流能看到、详情能看、能加入
  const feed = await request('/games/friends-feed', undefined, friend.token);
  assert.ok(feed.body.data.games.some((g: any) => g.id === gameId));
  assert.equal((await request(`/games/${gameId}`, undefined, friend.token)).status, 200);
  assert.equal((await request(`/games/${gameId}/join`, {}, friend.token)).status, 200);

  // 开放补位后大厅可见，陌生人也能加入
  const fill = await request(`/games/${gameId}/fill`, { open: true }, host.token);
  assert.equal(fill.status, 200, JSON.stringify(fill.body));
  const lobby2 = await request('/games', undefined, stranger.token);
  assert.ok(lobby2.body.data.games.some((g: any) => g.id === gameId));
  assert.equal((await request(`/games/${gameId}/join`, {}, stranger.token)).status, 200);
});

test('game invite notification carries remaining slots snapshot', async () => {
  const host = await account('soc-inv-host'), friend = await account('soc-inv-friend');
  await makeFriends(host, friend);
  const created = await request('/games', {
    sport_type: 'tennis', campus_id: 1, location: '网球场', max_players: 6,
    start_time: new Date(Date.now() + 48 * 3600000).toISOString(),
  }, host.token);
  const gameId = created.body.data.game.id;
  const invite = await request(`/games/${gameId}/invites`, { userIds: [friend.user.id] }, host.token);
  assert.equal(invite.status, 200, JSON.stringify(invite.body));
  assert.deepEqual(invite.body.data.invited, [friend.user.id]);
  const result = await notifications.getNotifications(friend.user.id, 1, 50);
  const notif = result.notifications.find((n: any) => n.type === 'game_invite' && n.game_id === gameId);
  assert.ok(notif, 'friend should receive game_invite');
  assert.match(notif.content, /还剩 5 个位置/);
});

test('remove member: neutral notice, 24h anti-rejoin, 30-minute lockout', async () => {
  const host = await account('soc-rm-host'), member = await account('soc-rm-member');
  const game = await games.createGame(gameInput(host.user.id, {}, 60 * 72));
  await games.joinGame(game.id, member.user.id);
  const removed = await request(`/games/${game.id}/members/${member.user.id}/remove`, {}, host.token);
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.ok((await notifTypes(member.user.id)).includes('member_removed'));
  // 留痕
  const { rows } = await pool.query('SELECT * FROM game_removals WHERE game_id = $1 AND user_id = $2', [game.id, member.user.id]);
  assert.equal(rows.length, 1);
  // 24h 内不能重进
  await assert.rejects(games.joinGame(game.id, member.user.id), /24 小时/);
  // 把留痕时间改到 25 小时前 → 可以重进
  await pool.query("UPDATE game_removals SET created_at = datetime('now', '-25 hours') WHERE game_id = $1", [game.id]);
  const rejoined = await games.joinGame(game.id, member.user.id);
  assert.equal(rejoined.member_count, 2);

  // 30 分钟内开局的局不能请人
  const soon = await games.createGame(gameInput(host.user.id, {}, 20));
  await games.joinGame(soon.id, member.user.id);
  const locked = await request(`/games/${soon.id}/members/${member.user.id}/remove`, {}, host.token);
  assert.ok(locked.status >= 400, JSON.stringify(locked.body));
  assert.match(locked.body.message, /30 分钟/);
});

test('report lifecycle: snapshot evidence, admin resolve notifies reporter, reported user can appeal', async () => {
  const host = await account('soc-rp-host'), sender = await account('soc-rp-sender'), admin = await account('soc-rp-admin');
  await pool.query('UPDATE users SET is_admin = 1 WHERE id = $1', [admin.user.id]);
  const game = await games.createGame(gameInput(host.user.id));
  await games.joinGame(game.id, sender.user.id);
  const msg = await request(`/games/${game.id}/messages`, { content: '这是一条会被举报的消息' }, sender.token);
  const messageId = msg.body.data.message.id;

  const created = await request('/reports', { target_type: 'message', target_id: messageId, reason: '内容不合适' }, host.token);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const report = created.body.data.report;
  assert.equal(report.status, 'pending');
  assert.equal(report.evidence.content, '这是一条会被举报的消息');
  assert.equal(report.evidence.sender_id, sender.user.id);

  // 普通用户看不到管理员队列
  assert.equal((await request('/admin/reports', undefined, host.token)).status, 403);
  const queue = await request('/admin/reports?status=pending', undefined, admin.token);
  assert.ok(queue.body.data.reports.some((r: any) => r.id === report.id));

  const resolved = await request(`/admin/reports/${report.id}/resolve`, { outcome: 'resolved', note: '已处理' }, admin.token);
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
  assert.equal(resolved.body.data.report.status, 'resolved');
  assert.ok((await notifTypes(host.user.id)).includes('report_outcome'));
  const mine = await request('/reports/mine', undefined, host.token);
  assert.equal(mine.body.data.reports[0].status, 'resolved');

  // 被举报人申诉 → 回到队列（appealed）
  const appeal = await request(`/reports/${report.id}/appeal`, { appeal: '这句话是玩笑' }, sender.token);
  assert.equal(appeal.status, 200, JSON.stringify(appeal.body));
  assert.equal(appeal.body.data.report.status, 'appealed');
  assert.equal(appeal.body.data.report.appeal_status, 'pending');
  // 管理员改判/维持都可以再次 resolve
  const resolved2 = await request(`/admin/reports/${report.id}/resolve`, { outcome: 'insufficient', note: '证据不足' }, admin.token);
  assert.equal(resolved2.body.data.report.status, 'insufficient');
  // 无关的人不能申诉
  assert.equal((await request(`/reports/${report.id}/appeal`, { appeal: 'x' }, host.token)).status, 403);
});

test('completed game: recent partners, end-summary friendship status and my stats, rebook clones +7d and invites without auto-join', async () => {
  const host = await account('soc-end-host'), player = await account('soc-end-player');
  const game = await games.createGame(gameInput(host.user.id, {}, 60 * 24));
  await games.joinGame(game.id, player.user.id);
  // 直接把局置为已完成并写一条运动记录（模拟结算后的状态）
  await pool.query("UPDATE games SET status = 'completed', completed_at = NOW() WHERE id = $1", [game.id]);
  await pool.query(
    `INSERT INTO sport_sessions (id, user_id, game_id, sport_type, source, status, effective_ms, reps, xp, settled, created_at)
     VALUES ($1, $2, $3, 'basketball', 'game', 'finished', 1800000, 0, 7, 1, NOW())`,
    ['social-test-session-1', host.user.id, game.id],
  );

  // 上次一起运动的人：包含 player
  const partners = await request('/friends/recent-partners', undefined, host.token);
  assert.ok(partners.body.data.partners.some((p: any) => p.user_id === player.user.id && p.together_count >= 1));

  // 结束页
  const summary = await request(`/games/${game.id}/end-summary`, undefined, host.token);
  assert.equal(summary.status, 200, JSON.stringify(summary.body));
  const attendee = summary.body.data.attendees.find((a: any) => a.user_id === player.user.id);
  assert.equal(attendee.friendship_status, 'none');
  assert.equal(summary.body.data.my_stats.xp, 7);
  assert.equal(summary.body.data.rebooked_game_id, null);
  // 非成员看不到结束页
  const outsider = await account('soc-end-outsider');
  assert.equal((await request(`/games/${game.id}/end-summary`, undefined, outsider.token)).status, 403);

  // 约下周再练
  const rebooked = await request(`/games/${game.id}/rebook`, {}, host.token);
  assert.equal(rebooked.status, 200, JSON.stringify(rebooked.body));
  const newGame = rebooked.body.data.game;
  const diffDays = (new Date(newGame.start_time).getTime() - new Date(game.start_time).getTime()) / 86400000;
  assert.ok(Math.abs(diffDays - 7) < 0.01, `expected +7d, got ${diffDays}`);
  // player 收到邀请但没有被自动加入
  const result = await notifications.getNotifications(player.user.id, 1, 50);
  assert.ok(result.notifications.some((n: any) => n.type === 'game_invite' && n.game_id === newGame.id));
  const detail = await games.getGameDetail(newGame.id, player.user.id);
  assert.equal(detail.is_member, false);
  // player 自己点加入 = 确认
  assert.equal((await request(`/games/${newGame.id}/join`, {}, player.token)).status, 200);
  // 不能重复约
  assert.equal((await request(`/games/${game.id}/rebook`, {}, host.token)).status, 409);
  const summary2 = await request(`/games/${game.id}/end-summary`, undefined, host.token);
  assert.equal(summary2.body.data.rebooked_game_id, newGame.id);
});

test('sensitive words block nickname, greeting, game fields and chat with a plain-language error', async () => {
  const a = await account('soc-sw-a'), b = await account('soc-sw-b');
  const nick = await request('/users/me', { nickname: '加微信一起玩' }, a.token, 'PUT');
  assert.ok(nick.status >= 400, JSON.stringify(nick.body));
  assert.match(nick.body.message, /不太合适的词/);
  const greeting = await request('/friends/requests', { userId: b.user.id, greeting: '加微信聊' }, a.token);
  assert.ok(greeting.status >= 400);
  assert.match(greeting.body.message, /不太合适的词/);
  const gameCreate = await request('/games', {
    sport_type: 'running', campus_id: 1, location: '操场', max_players: 4,
    start_time: new Date(Date.now() + 48 * 3600000).toISOString(), meeting_note: '到场加微信进群',
  }, a.token);
  assert.ok(gameCreate.status >= 400, JSON.stringify(gameCreate.body));
  assert.match(gameCreate.body.message, /不太合适的词/);
  const game = await games.createGame(gameInput(a.user.id));
  await games.joinGame(game.id, b.user.id);
  const chat = await request(`/games/${game.id}/messages`, { content: '大家加微信继续聊' }, b.token);
  assert.ok(chat.status >= 400, JSON.stringify(chat.body));
  assert.match(chat.body.message, /不太合适的词/);
});

test('share link returns in-app path and respects friends-game visibility', async () => {
  const host = await account('soc-share-host'), stranger = await account('soc-share-stranger');
  const game = await games.createGame(gameInput(host.user.id));
  const link = await request(`/games/${game.id}/share-link`, undefined, stranger.token);
  assert.equal(link.status, 200);
  assert.equal(link.body.data.path, `/games/${game.id}`);
});

test('join and leave leave system tips in the game chat', async () => {
  const host = await account('soc-tip-host'), guest = await account('soc-tip-guest');
  const game = await games.createGame(gameInput(host.user.id));
  await games.joinGame(game.id, guest.user.id);
  const afterJoin = await request(`/games/${game.id}/messages`, undefined, host.token);
  assert.equal(afterJoin.status, 200, JSON.stringify(afterJoin.body));
  const joinTip = afterJoin.body.data.messages.find((m: any) => m.kind === 'system');
  assert.ok(joinTip, 'joining should leave a system tip');
  assert.match(joinTip.content, /加入了本局/);
  assert.ok(joinTip.content.includes(guest.user.nickname), 'tip names the joiner');
  await games.leaveGame(game.id, guest.user.id);
  const afterLeave = await request(`/games/${game.id}/messages`, undefined, host.token);
  const leaveTip = afterLeave.body.data.messages.find((m: any) => m.kind === 'system' && /离开了本局/.test(m.content));
  assert.ok(leaveTip, 'leaving should leave a system tip for the remaining members');
  // 普通发言不受影响：kind 默认 user
  const said = await request(`/games/${game.id}/messages`, { content: '大家好' }, host.token);
  assert.equal(said.status, 201, JSON.stringify(said.body));
  const afterSay = await request(`/games/${game.id}/messages`, undefined, host.token);
  const userMsg = afterSay.body.data.messages.find((m: any) => m.content === '大家好');
  assert.equal(userMsg.kind, 'user');
});
