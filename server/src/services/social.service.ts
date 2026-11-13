/**
 * 社交服务：好友 / 拉黑 / 邀请码 / 社交设置 / 举报闭环
 *
 * 规则（方案第三节、第五节）：
 * - 好友申请双向确认；拒绝静默（删行、不通知对方）；删除好友静默。
 * - 任意一方拉黑，另一方不能发申请；拉黑同时解除好友关系。
 * - 好友申请范围设置：anyone（默认）/ played_together（只接受一起练过的人）；
 *   通过邀请链接来的申请豁免范围限制（链接是本人分享出去的，等于同意）。
 * - 举报自动带证据快照；管理员处理后通知举报人；被处理的人可以申诉。
 */
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool';
import { NotFoundError, ForbiddenError, InvalidStateError, ValidationError } from '../utils/errors';
import { assertNoSensitiveWord } from '../utils/sensitive-words';
import * as NotificationService from './notification.service';
import {
  isBlockedEitherWay,
  hasBlocked,
  playedTogether,
} from './social-helpers';

export { isBlockedEitherWay, hasBlocked, areFriends, getFriendIds, getBlockedIds, relationshipStatus } from './social-helpers';

function parsePrefs(raw: unknown): string[] {
  try {
    const parsed = JSON.parse(String(raw || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function getUserRow(userId: number) {
  const { rows } = await pool.query(
    'SELECT id, nickname, avatar_url, department, sport_preferences, reward_streak FROM users WHERE id = $1',
    [userId],
  );
  return rows[0] || null;
}

// ================================================================
// 邀请码
// ================================================================

export async function ensureInviteCode(userId: number): Promise<string> {
  const { rows } = await pool.query<{ invite_code: string | null }>(
    'SELECT invite_code FROM users WHERE id = $1',
    [userId],
  );
  if (!rows[0]) throw new NotFoundError('用户不存在');
  if (rows[0].invite_code) return rows[0].invite_code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = 'mv' + randomUUID().replace(/-/g, '').slice(0, 16);
    const { rows: clash } = await pool.query('SELECT id FROM users WHERE invite_code = $1', [code]);
    if (clash.length > 0) continue;
    await pool.query('UPDATE users SET invite_code = $2 WHERE id = $1', [userId, code]);
    return code;
  }
  throw new InvalidStateError('邀请码生成失败，请再试一次');
}

export async function getMyInvite(userId: number) {
  const code = await ensureInviteCode(userId);
  const me = await getUserRow(userId);
  return {
    invite_code: code,
    invite_path: `/invite/${code}`,
    inviter: me
      ? { id: Number(me.id), nickname: me.nickname, avatar_url: me.avatar_url, department: me.department || '' }
      : null,
  };
}

/** 邀请链接确认页：只看邀请人公开资料，不创建任何东西 */
export async function previewInvite(inviteCode: string) {
  const { rows } = await pool.query(
    'SELECT id, nickname, avatar_url, department, sport_preferences FROM users WHERE invite_code = $1',
    [inviteCode],
  );
  if (!rows[0]) throw new NotFoundError('这个邀请链接已经不能用了');
  const row = rows[0];
  return {
    id: Number(row.id),
    nickname: row.nickname,
    avatar_url: row.avatar_url,
    department: row.department || '',
    sport_preferences: parsePrefs(row.sport_preferences),
  };
}

async function findUserByInviteCode(inviteCode: string): Promise<number | null> {
  const { rows } = await pool.query<{ id: number }>(
    'SELECT id FROM users WHERE invite_code = $1',
    [inviteCode],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

// ================================================================
// 社交设置
// ================================================================

export type FriendRequestScope = 'anyone' | 'played_together';

export async function getSocialSettings(userId: number): Promise<{ friend_request_scope: FriendRequestScope }> {
  const { rows } = await pool.query<{ friend_request_scope: string }>(
    'SELECT friend_request_scope FROM user_social_settings WHERE user_id = $1',
    [userId],
  );
  const scope = rows[0]?.friend_request_scope === 'played_together' ? 'played_together' : 'anyone';
  return { friend_request_scope: scope };
}

export async function updateSocialSettings(
  userId: number,
  input: { friend_request_scope?: string },
): Promise<{ friend_request_scope: FriendRequestScope }> {
  if (input.friend_request_scope !== undefined) {
    if (input.friend_request_scope !== 'anyone' && input.friend_request_scope !== 'played_together') {
      throw new ValidationError('好友申请范围只能选「谁都可以」或「只接受一起运动过的人」');
    }
    await pool.query(
      `INSERT INTO user_social_settings (user_id, friend_request_scope, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT(user_id) DO UPDATE SET friend_request_scope = $2, updated_at = NOW()`,
      [userId, input.friend_request_scope],
    );
  }
  return getSocialSettings(userId);
}

// ================================================================
// 好友
// ================================================================

export interface SendFriendRequestInput {
  userId?: number;
  inviteCode?: string;
  greeting?: string;
  source_game_id?: number;
}

export async function sendFriendRequest(me: number, input: SendFriendRequestInput) {
  let targetId: number | null = null;
  let viaInvite = false;
  if (input.inviteCode) {
    targetId = await findUserByInviteCode(input.inviteCode);
    if (!targetId) throw new NotFoundError('这个邀请链接已经不能用了');
    viaInvite = true;
  } else if (input.userId) {
    targetId = input.userId;
  }
  if (!targetId) throw new ValidationError('请告诉我们你想加谁为好友');
  if (targetId === me) throw new ValidationError('不能加自己为好友');

  const target = await getUserRow(targetId);
  if (!target) throw new NotFoundError('用户不存在');

  const greeting = (input.greeting || '').trim().slice(0, 100);
  assertNoSensitiveWord(greeting, '问候语');

  if (await isBlockedEitherWay(me, targetId)) {
    throw new ForbiddenError('你们之间暂时没法加好友');
  }

  const [lo, hi] = me < targetId ? [me, targetId] : [targetId, me];
  const { rows: existing } = await pool.query<{ id: number; status: string; requester_id: number }>(
    'SELECT id, status, requester_id FROM friends WHERE user_a = $1 AND user_b = $2',
    [lo, hi],
  );
  if (existing[0]) {
    if (existing[0].status === 'accepted') throw new InvalidStateError('你们已经是好友了');
    if (Number(existing[0].requester_id) === me) throw new InvalidStateError('你已经发过申请了，等对方回复吧');
    throw new InvalidStateError('对方已经向你发过申请，去看看申请列表吧');
  }

  // 对方的好友申请范围：只接受一起练过的人（邀请链接豁免）
  if (!viaInvite) {
    const settings = await getSocialSettings(targetId);
    if (settings.friend_request_scope === 'played_together' && !(await playedTogether(me, targetId))) {
      throw new ForbiddenError('对方只接受一起运动过的人加好友');
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO friends (requester_id, addressee_id, user_a, user_b, status, source_game_id, greeting, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'pending', $5, $6, NOW(), NOW()) RETURNING *`,
    [me, targetId, lo, hi, input.source_game_id || null, greeting],
  );

  const meRow = await getUserRow(me);
  await NotificationService.createAndNotify(targetId, 'friend_request', input.source_game_id || null, {
    nickname: meRow?.nickname || '有人',
  }).catch(() => {});

  return rows[0];
}

/** 收到的待处理申请 */
export async function listIncomingRequests(me: number) {
  const { rows } = await pool.query(
    `SELECT f.id, f.requester_id, f.greeting, f.source_game_id, f.created_at,
            u.nickname, u.avatar_url, u.department, u.sport_preferences
     FROM friends f JOIN users u ON u.id = f.requester_id
     WHERE f.addressee_id = $1 AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [me],
  );
  return rows.map((r: any) => ({
    id: Number(r.id),
    requester_id: Number(r.requester_id),
    greeting: r.greeting || '',
    source_game_id: r.source_game_id ? Number(r.source_game_id) : null,
    created_at: r.created_at,
    nickname: r.nickname,
    avatar_url: r.avatar_url,
    department: r.department || '',
    sport_preferences: parsePrefs(r.sport_preferences),
  }));
}

export async function acceptFriendRequest(me: number, requestId: number) {
  const { rows } = await pool.query<{ id: number; requester_id: number; addressee_id: number; status: string }>(
    'SELECT * FROM friends WHERE id = $1',
    [requestId],
  );
  const req = rows[0];
  if (!req || Number(req.addressee_id) !== me) throw new NotFoundError('这条好友申请不存在');
  if (req.status !== 'pending') throw new InvalidStateError('这条申请已经处理过了');
  if (await isBlockedEitherWay(me, Number(req.requester_id))) {
    throw new ForbiddenError('你们之间暂时没法加好友');
  }
  await pool.query(
    "UPDATE friends SET status = 'accepted', updated_at = NOW() WHERE id = $1",
    [requestId],
  );
  const meRow = await getUserRow(me);
  await NotificationService.createAndNotify(Number(req.requester_id), 'friend_accepted', null, {
    nickname: meRow?.nickname || '对方',
  }).catch(() => {});
  return { id: requestId, status: 'accepted' };
}

/** 拒绝申请：静默删除，不通知对方 */
export async function rejectFriendRequest(me: number, requestId: number) {
  const { rows } = await pool.query<{ addressee_id: number; status: string }>(
    'SELECT addressee_id, status FROM friends WHERE id = $1',
    [requestId],
  );
  if (!rows[0] || Number(rows[0].addressee_id) !== me) throw new NotFoundError('这条好友申请不存在');
  if (rows[0].status !== 'pending') throw new InvalidStateError('这条申请已经处理过了');
  await pool.query('DELETE FROM friends WHERE id = $1', [requestId]);
  return { id: requestId, status: 'rejected' };
}

export async function listFriends(me: number) {
  const { rows } = await pool.query(
    `SELECT f.id AS friend_row_id,
            CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END AS friend_id,
            u.nickname, u.avatar_url, u.department, u.sport_preferences, u.reward_streak,
            (SELECT MAX(COALESCE(s.ended_at, s.created_at)) FROM sport_sessions s WHERE s.user_id = (CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END)) AS last_sport_at,
            (SELECT COUNT(*) FROM games g
               JOIN game_members ma ON ma.game_id = g.id AND ma.user_id = $1 AND ma.left_at IS NULL
               JOIN game_members mb ON mb.game_id = g.id AND mb.user_id = (CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END) AND mb.left_at IS NULL
               WHERE g.status IN ('completed','archived')) AS together_count,
            (SELECT MAX(g2.start_time) FROM games g2
               JOIN game_members ma2 ON ma2.game_id = g2.id AND ma2.user_id = $1 AND ma2.left_at IS NULL
               JOIN game_members mb2 ON mb2.game_id = g2.id AND mb2.user_id = (CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END) AND mb2.left_at IS NULL
               WHERE g2.status IN ('completed','archived')) AS last_played_at
     FROM friends f
     JOIN users u ON u.id = (CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END)
     WHERE f.status = 'accepted' AND (f.user_a = $1 OR f.user_b = $1)
     ORDER BY last_played_at DESC, last_sport_at DESC`,
    [me],
  );
  return rows.map((r: any) => ({
    user_id: Number(r.friend_id),
    nickname: r.nickname,
    avatar_url: r.avatar_url,
    department: r.department || '',
    sport_preferences: parsePrefs(r.sport_preferences),
    streak: Number(r.reward_streak || 0),
    last_sport_at: r.last_sport_at || null,
    together_count: Number(r.together_count || 0),
    last_played_at: r.last_played_at || null,
  }));
}

/** 删除好友：静默，不通知对方 */
export async function deleteFriend(me: number, otherId: number) {
  const [lo, hi] = me < otherId ? [me, otherId] : [otherId, me];
  await pool.query(
    "DELETE FROM friends WHERE user_a = $1 AND user_b = $2 AND status = 'accepted'",
    [lo, hi],
  );
  return { deleted: true };
}

/** 上次一起运动的人：同过已完成的局、还不是好友、双方都没拉黑 */
export async function listRecentPartners(me: number) {
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.nickname, u.avatar_url, u.department, u.sport_preferences, u.reward_streak,
            COUNT(DISTINCT g.id) AS together_count, MAX(g.start_time) AS last_played_at
     FROM games g
     JOIN game_members mine ON mine.game_id = g.id AND mine.user_id = $1 AND mine.left_at IS NULL
     JOIN game_members theirs ON theirs.game_id = g.id AND theirs.user_id != $1 AND theirs.left_at IS NULL
     JOIN users u ON u.id = theirs.user_id
     WHERE g.status IN ('completed', 'archived')
       AND NOT EXISTS (SELECT 1 FROM friends f WHERE f.status = 'accepted'
         AND ((f.user_a = $1 AND f.user_b = u.id) OR (f.user_a = u.id AND f.user_b = $1)))
       AND NOT EXISTS (SELECT 1 FROM blocks b
         WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1))
     GROUP BY u.id
     ORDER BY last_played_at DESC
     LIMIT 50`,
    [me],
  );
  return rows.map((r: any) => ({
    user_id: Number(r.user_id),
    nickname: r.nickname,
    avatar_url: r.avatar_url,
    department: r.department || '',
    sport_preferences: parsePrefs(r.sport_preferences),
    streak: Number(r.reward_streak || 0),
    together_count: Number(r.together_count || 0),
    last_played_at: r.last_played_at || null,
  }));
}

// ================================================================
// 拉黑
// ================================================================

export async function blockUser(me: number, targetId: number) {
  if (targetId === me) throw new ValidationError('不能拉黑自己');
  const target = await getUserRow(targetId);
  if (!target) throw new NotFoundError('用户不存在');
  await pool.query(
    'INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, NOW()) ON CONFLICT(blocker_id, blocked_id) DO NOTHING',
    [me, targetId],
  );
  // 拉黑同时解除好友关系（含待处理申请）
  const [lo, hi] = me < targetId ? [me, targetId] : [targetId, me];
  await pool.query('DELETE FROM friends WHERE user_a = $1 AND user_b = $2', [lo, hi]);
  return { blocked: true };
}

export async function unblockUser(me: number, targetId: number) {
  await pool.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [me, targetId]);
  return { blocked: false };
}

export async function listBlocks(me: number) {
  const { rows } = await pool.query(
    `SELECT b.blocked_id AS user_id, b.created_at, u.nickname, u.avatar_url
     FROM blocks b JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
    [me],
  );
  return rows.map((r: any) => ({
    user_id: Number(r.user_id),
    nickname: r.nickname,
    avatar_url: r.avatar_url,
    created_at: r.created_at,
  }));
}

// ================================================================
// 举报闭环
// ================================================================

export type ReportTargetType = 'user' | 'message' | 'game';

export async function createReport(
  me: number,
  input: { target_type: ReportTargetType; target_id: string | number; reason?: string },
) {
  const targetId = String(input.target_id);
  let evidence: Record<string, unknown> = {};
  if (input.target_type === 'message') {
    const { rows } = await pool.query(
      `SELECT m.id, m.content, m.sender_id, m.game_id, m.created_at, u.nickname AS sender_nickname
       FROM chat_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = $1`,
      [Number(targetId)],
    );
    if (!rows[0]) throw new NotFoundError('这条消息不存在');
    evidence = { ...rows[0], id: Number((rows[0] as any).id), sender_id: Number((rows[0] as any).sender_id), game_id: Number((rows[0] as any).game_id) };
  } else if (input.target_type === 'game') {
    const { rows } = await pool.query(
      'SELECT id, host_id, sport_type, title, location, meeting_note, start_time, status FROM games WHERE id = $1',
      [Number(targetId)],
    );
    if (!rows[0]) throw new NotFoundError('这个局不存在');
    evidence = { ...rows[0], id: Number((rows[0] as any).id), host_id: Number((rows[0] as any).host_id) };
  } else if (input.target_type === 'user') {
    const target = await getUserRow(Number(targetId));
    if (!target) throw new NotFoundError('用户不存在');
    evidence = {
      id: Number(target.id), nickname: target.nickname, avatar_url: target.avatar_url,
      department: target.department || '', sport_preferences: parsePrefs(target.sport_preferences),
    };
  } else {
    throw new ValidationError('不知道你想举报什么，请再选一次');
  }

  const { rows } = await pool.query(
    `INSERT INTO reports (reporter_id, target_type, target_id, reason, evidence, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', NOW()) RETURNING *`,
    [me, input.target_type, targetId, (input.reason || '').slice(0, 500), JSON.stringify(evidence)],
  );
  return serializeReport(rows[0]);
}

function serializeReport(r: any) {
  let evidence: unknown = {};
  try { evidence = JSON.parse(r.evidence || '{}'); } catch { evidence = {}; }
  return {
    id: Number(r.id),
    reporter_id: Number(r.reporter_id),
    target_type: r.target_type,
    target_id: r.target_id,
    reason: r.reason || '',
    evidence,
    status: r.status,
    resolution_note: r.resolution_note || '',
    appeal: r.appeal || null,
    appeal_status: r.appeal_status || null,
    handled_by: r.handled_by ? Number(r.handled_by) : null,
    handled_at: r.handled_at || null,
    created_at: r.created_at,
  };
}

export async function listMyReports(me: number) {
  const { rows } = await pool.query(
    'SELECT * FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC LIMIT 100',
    [me],
  );
  return rows.map(serializeReport);
}

export async function listReportsForAdmin(status?: string) {
  const { rows } = status
    ? await pool.query('SELECT * FROM reports WHERE status = $1 ORDER BY created_at DESC LIMIT 200', [status])
    : await pool.query('SELECT * FROM reports ORDER BY created_at DESC LIMIT 200');
  return rows.map(serializeReport);
}

export async function resolveReport(
  adminId: number,
  reportId: number,
  input: { outcome: 'resolved' | 'insufficient'; note?: string },
) {
  if (input.outcome !== 'resolved' && input.outcome !== 'insufficient') {
    throw new ValidationError('处理结果只能选「已处理」或「证据不足」');
  }
  const { rows } = await pool.query('SELECT * FROM reports WHERE id = $1', [reportId]);
  if (!rows[0]) throw new NotFoundError('这条举报不存在');
  if (rows[0].status !== 'pending' && rows[0].status !== 'appealed') {
    throw new InvalidStateError('这条举报已经处理完了');
  }
  await pool.query(
    `UPDATE reports SET status = $2, resolution_note = $3, handled_by = $4, handled_at = NOW(),
       appeal_status = CASE WHEN appeal_status = 'pending' THEN 'rejected' ELSE appeal_status END
     WHERE id = $1`,
    [reportId, input.outcome, (input.note || '').slice(0, 500), adminId],
  );
  const { rows: updated } = await pool.query('SELECT * FROM reports WHERE id = $1', [reportId]);
  await NotificationService.createAndNotify(Number(rows[0].reporter_id), 'report_outcome', null, {
    outcome: input.outcome === 'resolved' ? '已处理' : '证据不足',
  }).catch(() => {});
  return serializeReport(updated[0]);
}

/**
 * 申诉：被处理的人（被举报的用户 / 消息发送者 / 局发起人）在已有处理结果后申诉。
 * 状态机：reports.status 保持原结果，appeal_status: pending → 管理员再次 resolve 时置 rejected，
 * 或管理员改判时直接更新 status（resolveReport 接受 appealed 状态并可改判）。
 * 简化：申诉后 status 置为 'appealed'，回到管理员队列。
 */
export async function appealReport(me: number, reportId: number, appealText: string) {
  const { rows } = await pool.query('SELECT * FROM reports WHERE id = $1', [reportId]);
  if (!rows[0]) throw new NotFoundError('这条举报不存在');
  const report = rows[0];
  let reportedUserId: number | null = null;
  if (report.target_type === 'user') reportedUserId = Number(report.target_id);
  else {
    try {
      const ev = JSON.parse(report.evidence || '{}');
      reportedUserId = ev.sender_id ? Number(ev.sender_id) : ev.host_id ? Number(ev.host_id) : null;
    } catch { reportedUserId = null; }
  }
  if (reportedUserId !== me) throw new ForbiddenError('只有被处理的人可以申诉');
  if (report.status !== 'resolved' && report.status !== 'insufficient') {
    throw new InvalidStateError('还没有处理结果，暂时不能申诉');
  }
  if (report.appeal_status === 'pending') throw new InvalidStateError('你已经申诉过了，等管理员再看一次吧');
  await pool.query(
    "UPDATE reports SET appeal = $2, appeal_status = 'pending', status = 'appealed' WHERE id = $1",
    [reportId, String(appealText || '').slice(0, 500)],
  );
  const { rows: updated } = await pool.query('SELECT * FROM reports WHERE id = $1', [reportId]);
  return serializeReport(updated[0]);
}
