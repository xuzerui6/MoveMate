/**
 * 社交关系底层查询（只依赖数据库，供 game/chat/user 等服务共用，避免循环引用）
 */
import { pool } from '../db/pool';

/** a 是否拉黑了 b */
export async function hasBlocked(a: number, b: number): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT id FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [a, b],
  );
  return rows.length > 0;
}

/** 任意一方拉黑了另一方 */
export async function isBlockedEitherWay(a: number, b: number): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT id FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
    [a, b],
  );
  return rows.length > 0;
}

/** 我拉黑的用户 ID 集合 */
export async function getBlockedIds(userId: number): Promise<Set<number>> {
  const { rows } = await pool.query<{ blocked_id: number }>(
    'SELECT blocked_id FROM blocks WHERE blocker_id = $1',
    [userId],
  );
  return new Set(rows.map((r) => Number(r.blocked_id)));
}

/** 两人是否已是好友（accepted） */
export async function areFriends(a: number, b: number): Promise<boolean> {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const { rows } = await pool.query(
    "SELECT id FROM friends WHERE user_a = $1 AND user_b = $2 AND status = 'accepted'",
    [lo, hi],
  );
  return rows.length > 0;
}

/** 我的好友 ID 集合（accepted） */
export async function getFriendIds(userId: number): Promise<Set<number>> {
  const { rows } = await pool.query<{ user_a: number; user_b: number }>(
    "SELECT user_a, user_b FROM friends WHERE status = 'accepted' AND (user_a = $1 OR user_b = $1)",
    [userId],
  );
  const ids = new Set<number>();
  for (const r of rows) {
    ids.add(Number(r.user_a) === userId ? Number(r.user_b) : Number(r.user_a));
  }
  return ids;
}

/** 我和某人的关系状态：none / pending_out / pending_in / friends / blocked_by_me / blocked_me */
export async function relationshipStatus(
  me: number,
  other: number,
): Promise<'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked_by_me' | 'blocked_me'> {
  if (await hasBlocked(me, other)) return 'blocked_by_me';
  if (await hasBlocked(other, me)) return 'blocked_me';
  const [lo, hi] = me < other ? [me, other] : [other, me];
  const { rows } = await pool.query<{ status: string; requester_id: number }>(
    'SELECT status, requester_id FROM friends WHERE user_a = $1 AND user_b = $2',
    [lo, hi],
  );
  if (!rows[0]) return 'none';
  if (rows[0].status === 'accepted') return 'friends';
  return Number(rows[0].requester_id) === me ? 'pending_out' : 'pending_in';
}

/** 两人一起完成过的局数 + 最近一次时间（双方都参加且局已完成） */
export async function togetherStats(
  a: number,
  b: number,
): Promise<{ count: number; last_played_at: string | null }> {
  const { rows } = await pool.query<{ n: number; last_at: string | null }>(
    `SELECT COUNT(*) AS n, MAX(g.start_time) AS last_at
     FROM games g
     JOIN game_members ma ON ma.game_id = g.id AND ma.user_id = $1 AND ma.left_at IS NULL
     JOIN game_members mb ON mb.game_id = g.id AND mb.user_id = $2 AND mb.left_at IS NULL
     WHERE g.status IN ('completed', 'archived')`,
    [a, b],
  );
  return { count: Number(rows[0]?.n || 0), last_played_at: rows[0]?.last_at || null };
}

/** 是否一起练过（参加过同一个已完成的局） */
export async function playedTogether(a: number, b: number): Promise<boolean> {
  const stats = await togetherStats(a, b);
  return stats.count > 0;
}
