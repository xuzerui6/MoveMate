import { pool, PoolClient, withTransaction, afterCommit } from '../db';
import { redis } from '../db/index';
import { settleGameSessions, progress } from './motion.service';
import {
  getUserContext,
  getCheckInDeadline,
  assertCheckInWindow,
  CHECK_IN_ADVANCE_MINUTES,
} from './reward.service';
import {
  NotFoundError,
  InvalidStateError,
  InvalidTransitionError,
  GameFullError,
  AlreadyJoinedError,
  NotMemberError,
  HostCannotLeaveError,
  ForbiddenError,
} from '../utils/errors';
import { pushToUser, broadcastToGame, removeUserFromGame } from '../websocket/notification.handler';

// ================================================================
// 类型定义
// ================================================================

/** 运动局 7 种状态 */
export type GameStatus =
  | 'recruiting'
  | 'full'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'archived'
  | 'cancelled';

/** 运动类型枚举 */
export type SportType = string;

/** 局标签 */
export type GameTag =
  | 'casual'
  | 'beginner_friendly'
  | 'competitive'
  | 'relaxed';

/** 数据库 games 行 */
export interface GameRow {
  id: number;
  host_id: number;
  school_id: number;
  campus_id: number;
  venue_id: number | null;
  sport_type: SportType;
  title: string;
  location: string;
  school_name?: string;
  campus_name?: string;
  venue_name?: string;
  venue_name_snapshot?: string;
  meeting_note?: string;
  max_players: number;
  start_time: Date;
  end_time: Date | null;
  completed_at: Date | null;
  status: GameStatus;
  tag: GameTag | null;
  member_count: number;
  is_host?: boolean;
  is_member?: boolean;
  created_at: Date;
  updated_at: Date;
  creator_name?: string;
  host_reward_level?: number;
  host_reward_points?: number;
}

/** 创建局输入 */
export interface CreateGameInput {
  host_id: number;
  sport_type: SportType;
  title?: string;
  campus_id: number;
  venue_id?: number;
  location?: string;
  meeting_note?: string;
  max_players: number;
  start_time: string; // ISO 8601
  end_time?: string;
  tag?: GameTag;
}

/** 大厅列表查询参数 */
export interface ListGamesQuery {
  sport_type?: SportType;
  status?: GameStatus;
  campus_id?: number;
  scope?: 'campus' | 'school';
  date?: string;
  page?: number;
  page_size?: number;
  sort_by?: 'start_time' | 'created_at' | 'member_count';
}

/** 大厅列表返回 */
export interface ListGamesResult {
  games: GameRow[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

/** 局详情返回 */
export interface GameDetailResult {
  game: GameRow;
  members: Array<{
    user_id: number;
    nickname: string;
    avatar_url: string;
    reward_level?: number;
    total_reward_points?: number;
    joined_at: Date;
    checked_in_at?: Date | null;
    attendance_confirmed_at?: Date | null;
    reward_points?: number;
    reward_granted_at?: Date | null;
  }>;
  is_member: boolean;
  is_host: boolean;
}

/** 成员行 */
export interface MemberRow {
  user_id: number;
  nickname: string;
  avatar_url: string;
  reward_level?: number;
  total_reward_points?: number;
  joined_at: Date;
  checked_in_at?: Date | null;
  attendance_confirmed_at?: Date | null;
  reward_points?: number;
  reward_granted_at?: Date | null;
}

interface UserContext {
  school_id: number;
  campus_id: number;
}

interface VenueContext {
  id: number;
  school_id: number;
  campus_id: number;
  name: string;
}

interface CampusContext {
  id: number;
  school_id: number;
  name: string;
}

interface RewardUserRow {
  id: number;
  reward_points: number;
  reward_level: number;
  reward_streak: number;
  completed_games: number;
  hosted_completed_games: number;
  reward_badges: string;
  last_rewarded_date?: string | null;
}

// ================================================================
// 状态转换白名单 —— 只有此处列出的转换合法
// 参考 backend-design.md §3.1 状态流转图
// ================================================================
export const VALID_TRANSITIONS: Record<GameStatus, GameStatus[]> = {
  recruiting: ['recruiting', 'full', 'ready', 'cancelled'],
  // recruiting → full：成员加入后满员
  // recruiting → ready：定时任务推进（距开始 ≤30分钟）
  // recruiting → cancelled：发起人取消或超时自动取消

  full: ['recruiting', 'full', 'ready', 'cancelled'],
  // full → recruiting：成员退出导致不满员（回退）
  // full → ready：定时任务推进（距开始 ≤30分钟）
  // full → cancelled：发起人取消或超时

  ready: ['recruiting', 'in_progress', 'cancelled'],
  // ready → recruiting：成员退出（即将开始回退规则）
  // ready → in_progress：到达开始时间，定时任务推进
  // ready → cancelled：发起人取消或超时

  in_progress: ['completed'],
  // in_progress → completed：发起人确认结束或超时自动结束

  completed: ['archived'],
  // completed → archived：结束 24 小时后，定时任务自动归档

  archived: [],
  // 终态，不可再转换

  cancelled: [],
  // 终态，不可再转换
};

/**
 * 运动名称中文映射
 */
const SPORT_NAMES: Record<string, string> = {
  basketball: '篮球',
  badminton: '羽毛球',
  running: '跑步',
  fitness: '健身',
  soccer: '足球',
  volleyball: '排球',
  tennis: '网球',
  table_tennis: '乒乓球',
  swimming: '游泳',
  roller_skating: '轮滑',
  skateboarding: '滑板',
};


// ================================================================
// 辅助函数
// ================================================================

/**
 * 将数据库行转为 GameRow（确保类型正确）
 */
function toGameRow(row: any): GameRow {
  return {
    id: Number(row.id),
    host_id: Number(row.host_id),
    school_id: Number(row.school_id ?? 1),
    campus_id: Number(row.campus_id ?? 1),
    venue_id: row.venue_id != null ? Number(row.venue_id) : null,
    sport_type: row.sport_type,
    title: row.title,
    location: row.location,
    school_name: row.school_name || undefined,
    campus_name: row.campus_name || undefined,
    venue_name: row.venue_name || undefined,
    venue_name_snapshot: row.venue_name_snapshot || undefined,
    meeting_note: row.meeting_note || undefined,
    max_players: Number(row.max_players),
    start_time: new Date(row.start_time),
    end_time: row.end_time ? new Date(row.end_time) : null,
    completed_at: row.completed_at ? new Date(row.completed_at) : null,
    status: row.status,
    tag: row.tag || null,
    member_count: Number(row.member_count),
    is_host: Boolean(row.is_host),
    is_member: Boolean(row.is_member),
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    creator_name: row.creator_name || undefined,
    host_reward_level: progress(Number(row.host_reward_points || 0)).level,
    host_reward_points: row.host_reward_points != null ? Number(row.host_reward_points) : undefined,
  };
}

/**
 * 自动生成局标题：如 "篮球局"
 */
function generateTitle(sportType: SportType): string {
  const normalized = sportType?.trim() || '运动';
  const name = SPORT_NAMES[normalized] || normalized;
  return `${name}局`;
}

function parseBadgeList(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * 获取场地上下文（创建局时校验场地合法性）
 */
async function getVenueContext(venueId: number): Promise<VenueContext> {
  const { rows } = await pool.query<VenueContext>(
    `SELECT id, school_id, campus_id, name FROM venues WHERE id = $1 AND is_active = 1`,
    [venueId],
  );
  if (rows.length === 0) {
    throw new NotFoundError('场地不存在');
  }
  return {
    id: Number(rows[0].id),
    school_id: Number(rows[0].school_id),
    campus_id: Number(rows[0].campus_id),
    name: rows[0].name,
  };
}

/**
 * 获取校区上下文（创建局时校验校区合法性）
 */
async function getCampusContext(campusId: number): Promise<CampusContext> {
  const { rows } = await pool.query<CampusContext>(
    `SELECT id, school_id, name FROM campuses WHERE id = $1 AND is_active = 1`,
    [campusId],
  );
  if (rows.length === 0) {
    throw new NotFoundError('校区不存在');
  }
  return {
    id: Number(rows[0].id),
    school_id: Number(rows[0].school_id),
    name: rows[0].name,
  };
}
// 核心转换函数
// ================================================================

/**
 * transitionGame() —— 核心状态转换
 *
 * 所有状态变更必须经过此函数，确保：
 * 1. 转换在白名单内
 * 2. 业务校验通过
 * 3. 更新 DB
 * 4. 事务完成后触发副作用（通知）
 *
 * @param gameId    运动局 ID
 * @param to        目标状态
 * @param client    可选：外部传入的事务客户端（用于在外部事务内调用）
 * @returns         更新后的 GameRow
 */
export async function transitionGame(
  gameId: number,
  to: GameStatus,
  client?: PoolClient,
): Promise<GameRow> {
  return withTransaction(async (db) => {
    if (client && client !== db) throw new Error("Transaction client mismatch");

    // 1. 锁定行并读取当前状态
    const { rows } = await db.query<GameRow>(
      `SELECT * FROM games WHERE id = $1 FOR UPDATE`,
      [gameId],
    );
    if (rows.length === 0) {
      throw new NotFoundError('运动局不存在');
    }

    const game = toGameRow(rows[0]);
    const from = game.status;

    // 2. 校验转换合法性（白名单校验）
    if (!VALID_TRANSITIONS[from].includes(to)) {
      throw new InvalidTransitionError(`非法状态转换: ${from} → ${to}`);
    }

    // 3. 更新数据库
    const extraFields: string[] = [];

    // completed 状态需要记录 completed_at
    if (to === 'completed') {
      extraFields.push('completed_at = NOW()');
    }

    const extraSQL = extraFields.length > 0 ? `, ${extraFields.join(', ')}` : '';

    const { rows: updatedRows } = await db.query(
      `UPDATE games SET status = $2, updated_at = NOW()${extraSQL} WHERE id = $1 RETURNING *`,
      [gameId, to],
    );

    const updated = toGameRow(updatedRows[0]);



    // 4. 同事务保存通知记录；网络推送在提交后执行。
    await handleTransitionSideEffects(updated, from, to);
    afterCommit(() => notifyGameChanged(gameId));

    return updated;
  });
}

// ================================================================
// 业务操作函数
// ================================================================

/**
 * createGame() —— 创建运动局
 *
 */
export async function createGame(input: CreateGameInput): Promise<GameRow> {
  return withTransaction(async (client) => {

    const sportType = input.sport_type.trim();
    const title = input.title || generateTitle(sportType);
    const userContext = await getUserContext(input.host_id);
    const campus = await getCampusContext(input.campus_id);
    if (campus.school_id !== userContext.school_id) {
      throw new ForbiddenError('只能在当前学校内发起运动局');
    }

    const manualLocation = input.location?.trim() || '';
    let venueId: number | null = null;
    let venueNameSnapshot = '';
    let location = manualLocation;

    if (input.venue_id) {
      const venue = await getVenueContext(input.venue_id);
      if (venue.school_id !== userContext.school_id) {
        throw new ForbiddenError('只能在当前学校内发起运动局');
      }
      if (venue.campus_id !== input.campus_id) {
        throw new InvalidStateError('所选场地与校区不匹配');
      }
      venueId = venue.id;
      venueNameSnapshot = venue.name;
      if (!location) {
        location = venue.name;
      }
    } else if (!location) {
      throw new InvalidStateError('请选择场地或手动输入场地名称');
    }

    if (!venueNameSnapshot) {
      venueNameSnapshot = location;
    }
    const meetingNote = input.meeting_note?.trim() || '';

    // 插入运动局
    const { rows: gameRows } = await client.query(
      `INSERT INTO games (
         host_id, school_id, campus_id, venue_id, venue_name_snapshot,
         sport_type, title, location, meeting_note, max_players, start_time, end_time, status, tag, member_count
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'recruiting', $13, 1)
       RETURNING *`,
      [
        input.host_id,
        userContext.school_id,
        input.campus_id,
        venueId,
        venueNameSnapshot,
        sportType,
        title,
        location,
        meetingNote,
        input.max_players,
        input.start_time,
        input.end_time || null,
        input.tag || null,
      ],
    );

    // 发起人自动加入成员列表
    await client.query(
      `INSERT INTO game_members (game_id, user_id, joined_at) VALUES ($1, $2, NOW())`,
      [gameRows[0].id, input.host_id],
    );

    afterCommit(() => notifyGameChanged(gameRows[0].id));
    return toGameRow(gameRows[0]);
  });
}

/**
 * joinGame() —— 加入运动局
 *
 * 事务 + SELECT FOR UPDATE 行锁 + 校验状态/人数/重复加入
 * + 更新 member_count + 满员状态变更 + 通知发起人
 */
export async function joinGame(
  gameId: number,
  userId: number,
): Promise<{ game: GameRow; member_count: number }> {
  return withTransaction(async (client) => {

    // --- SELECT FOR UPDATE 行锁，防止超员并发 ---
    // 阻塞其他并发事务对同一行加锁，确保串行校验 member_count
    const { rows } = await client.query(
      `SELECT * FROM games WHERE id = $1 FOR UPDATE`,
      [gameId],
    );
    if (rows.length === 0) {
      throw new NotFoundError('运动局不存在');
    }

    const game = toGameRow(rows[0]);

    // --- 校验状态：只有 recruiting/full 可加入 ---
    if (game.status !== 'recruiting' && game.status !== 'full') {
      throw new InvalidStateError(`当前状态"${game.status}"不允许加入`);
    }

    // --- 校验人数：已满员拒绝 ---
    if (game.member_count >= game.max_players) {
      throw new GameFullError();
    }

    // --- 校验重复加入 ---
    const { rows: existingMembers } = await client.query(
      `SELECT id FROM game_members WHERE game_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [gameId, userId],
    );
    if (existingMembers.length > 0) {
      throw new AlreadyJoinedError();
    }

    // --- 写入成员记录 ---
    await client.query(
      `INSERT INTO game_members (game_id, user_id, joined_at) VALUES ($1, $2, NOW())`,
      [gameId, userId],
    );

    // --- 更新计数 + 满员状态变更 ---
    const newCount = game.member_count + 1;
    const newStatus: GameStatus = newCount >= game.max_players ? 'full' : game.status;

    const { rows: updatedRows } = await client.query(
      `UPDATE games SET member_count = $2, status = $3, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [gameId, newCount, newStatus],
    );
    const updated = toGameRow(updatedRows[0]);

    await (async () => {
      // --- 同事务保存通知；提交后推送 ---
      // 通知发起人：有人加入
      const { rows: joinerRows } = await pool.query(
        `SELECT nickname FROM users WHERE id = $1`, [userId],
      );
      const joinerName = joinerRows[0]?.nickname || '某用户';

      await createNotification({
        user_id: game.host_id,
        type: 'member_joined',
        title: '新成员加入',
        content: `${joinerName} 加入了你的「${updated.title}」`,
        game_id: gameId,
      });
      await createNotification({
        user_id: userId,
        type: 'member_joined',
        title: '加入成功',
        content: `你已加入「${updated.title}」`,
        game_id: gameId,
      });

      // 满员时额外通知发起人
      if (newStatus === 'full') {
        await createNotification({
          user_id: game.host_id,
          type: 'game_full',
          title: '局已满员',
          content: `你的「${updated.title}」已满员`,
          game_id: gameId,
        });
      }
    })();

    afterCommit(() => notifyGameChanged(gameId, 'member_change'));
    return { game: updated, member_count: newCount };
  });
}

/**
 * leaveGame() —— 退出运动局
 *
 * 事务 + 校验（发起人不能退出）+ 满员回退 / 即将开始回退 + 通知
 */
export async function leaveGame(
  gameId: number,
  userId: number,
): Promise<{ game: GameRow; member_count: number }> {
  return withTransaction(async (client) => {

    // --- SELECT FOR UPDATE 锁定行 ---
    const { rows } = await client.query(
      `SELECT * FROM games WHERE id = $1 FOR UPDATE`,
      [gameId],
    );
    if (rows.length === 0) {
      throw new NotFoundError('运动局不存在');
    }

    const game = toGameRow(rows[0]);

    // --- 校验状态：仅 recruiting / full / ready 可退出 ---
    if (game.status !== 'recruiting' && game.status !== 'full' && game.status !== 'ready') {
      throw new InvalidStateError(`当前状态"${game.status}"不允许退出`);
    }

    // --- 发起人不能退出 ---
    if (game.host_id === userId) {
      throw new HostCannotLeaveError();
    }

    // --- 校验是否在局中 ---
    const { rows: memberRows } = await client.query(
      `SELECT id FROM game_members WHERE game_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [gameId, userId],
    );
    if (memberRows.length === 0) {
      throw new NotMemberError();
    }

    // --- 标记退出 ---
    await client.query(
      `UPDATE game_members SET left_at = NOW() WHERE game_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [gameId, userId],
    );
    afterCommit(() => removeUserFromGame(gameId, userId));


    // --- 更新计数 + 回退状态判定 ---
    const newCount = game.member_count - 1;
    const newStatus: GameStatus = leaveStatus(game.status, newCount, game.max_players);

    const { rows: updatedRows } = await client.query(
      `UPDATE games SET member_count = $2, status = $3, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [gameId, newCount, newStatus],
    );
    const updated = toGameRow(updatedRows[0]);

    await (async () => {
      // --- 同事务保存通知；提交后推送 ---
      const shouldNotify = game.status === 'full' || game.status === 'ready';
      if (shouldNotify) {
        const { rows: leaverRows } = await pool.query(
          `SELECT nickname FROM users WHERE id = $1`, [userId],
        );
        const leaverName = leaverRows[0]?.nickname || '某用户';

        if (game.status === 'full') {
          // 满员回退：通知发起人有空位
          await createNotification({
            user_id: game.host_id,
            type: 'member_left',
            title: '成员退出',
            content: `${leaverName} 退出了「${updated.title}」，该局已重新展示在大厅`,
            game_id: gameId,
          });
        }

        if (game.status === 'ready') {
          // 即将开始回退：通知发起人
          await createNotification({
            user_id: game.host_id,
            type: 'member_left',
            title: '成员退出',
            content: `${leaverName} 退出了即将开始的「${updated.title}」，局已退回招募状态`,
            game_id: gameId,
          });
        }
      }

    })();

    afterCommit(() => notifyGameChanged(gameId, 'member_change'));
    return { game: updated, member_count: newCount };
  });
}

export async function checkInForGame(
  gameId: number,
  userId: number,
): Promise<{ checked_in_at: string }> {
  return withTransaction(async (client) => {

    const { rows } = await client.query(
      `SELECT * FROM games WHERE id = $1 FOR UPDATE`,
      [gameId],
    );
    if (rows.length === 0) {
      throw new NotFoundError('运动局不存在');
    }

    const game = toGameRow(rows[0]);
    if (game.status !== 'ready' && game.status !== 'in_progress') {
      throw new InvalidStateError('当前状态不可签到');
    }
    assertCheckInWindow(game);

    const { rows: memberRows } = await client.query<{ checked_in_at?: string | null }>(
      `SELECT checked_in_at
       FROM game_members
       WHERE game_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [gameId, userId],
    );
    if (!memberRows[0]) {
      throw new NotMemberError();
    }
    if (memberRows[0].checked_in_at) {
      throw new InvalidStateError('你已经签到过了');
    }

    const { rows: updatedRows } = await client.query<{ checked_in_at: string }>(
      `UPDATE game_members
       SET checked_in_at = NOW()
       WHERE game_id = $1 AND user_id = $2 AND left_at IS NULL
       RETURNING checked_in_at`,
      [gameId, userId],
    );

    afterCommit(() => notifyGameChanged(gameId, 'member_change'));
    return { checked_in_at: updatedRows[0]?.checked_in_at };
  });
}

export async function confirmAttendance(
  gameId: number,
  hostUserId: number,
  memberUserId: number,
): Promise<{ confirmed: boolean }> {
  return withTransaction(async (client) => {

    const { rows } = await client.query(
      `SELECT * FROM games WHERE id = $1 FOR UPDATE`,
      [gameId],
    );
    if (rows.length === 0) {
      throw new NotFoundError('运动局不存在');
    }

    const game = toGameRow(rows[0]);
    if (game.host_id !== hostUserId) {
      throw new ForbiddenError('仅发起人可确认到场');
    }
    if (game.status !== 'ready' && game.status !== 'in_progress') {
      throw new InvalidStateError('当前状态不可确认到场');
    }

    const { rows: memberRows } = await client.query<{
      checked_in_at?: string | null;
      attendance_confirmed_at?: string | null;
    }>(
      `SELECT checked_in_at, attendance_confirmed_at
       FROM game_members
       WHERE game_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [gameId, memberUserId],
    );
    if (!memberRows[0]) {
      throw new NotMemberError();
    }
    if (!memberRows[0].checked_in_at) {
      throw new InvalidStateError('对方还没有签到');
    }
    if (memberRows[0].attendance_confirmed_at) {
      throw new InvalidStateError('该成员已确认到场');
    }

    await client.query(
      `UPDATE game_members
       SET attendance_confirmed_at = NOW()
       WHERE game_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [gameId, memberUserId],
    );

    afterCommit(() => notifyGameChanged(gameId, 'member_change'));
    return { confirmed: true };
  });
}

/**
 * leaveStatus() —— 退出后的状态判定
 *
 * full → recruiting：满员变不满，回退到招募
 * ready → recruiting：即将开始回退规则（PRD §3.3）
 * 其他保持不变
 */
function leaveStatus(
  currentStatus: GameStatus,
  newCount: number,
  maxPlayers: number,
): GameStatus {
  // 满员回退：人数掉到上限以下 → 回到招募状态
  if (currentStatus === 'full' && newCount < maxPlayers) {
    return 'recruiting';
  }
  // 即将开始回退：有人退出 → 退回招募状态重新等待
  if (currentStatus === 'ready') {
    return 'recruiting';
  }
  return currentStatus;
}

/**
 * cancelGame() —— 取消运动局（仅发起人）
 *
 * 状态校验 + 通知所有成员
 */
export async function cancelGame(
  gameId: number,
  userId: number,
): Promise<GameRow> {
  return withTransaction(async (client) => {

    const { rows } = await client.query(
      `SELECT * FROM games WHERE id = $1 FOR UPDATE`,
      [gameId],
    );
    if (rows.length === 0) {
      throw new NotFoundError('运动局不存在');
    }

    const game = toGameRow(rows[0]);

    // --- 仅发起人 ---
    if (game.host_id !== userId) {
      throw new ForbiddenError('仅发起人可取消该局');
    }

    // --- 状态校验：仅 recruiting / full / ready 可取消 ---
    if (game.status !== 'recruiting' && game.status !== 'full' && game.status !== 'ready') {
      throw new InvalidStateError(
        game.status === 'in_progress'
          ? '已开始的局不可取消'
          : `当前状态"${game.status}"不允许取消`,
      );
    }

    // --- 更新状态 ---
    const { rows: updatedRows } = await client.query(
      `UPDATE games SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [gameId],
    );
    const updated = toGameRow(updatedRows[0]);

    await (async () => {
      // --- 同事务保存所有成员通知 ---
      const { rows: allMembers } = await pool.query(
        `SELECT gm.user_id, u.nickname
      FROM game_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.game_id = $1 AND gm.left_at IS NULL AND gm.user_id != $2`,
        [gameId, userId],
      );

      for (const member of allMembers) {
        await createNotification({
          user_id: member.user_id,
          type: 'game_cancelled',
          title: '局已取消',
          content: `你加入的「${updated.title}」已被发起人取消`,
          game_id: gameId,
        });
      }
    })();

    afterCommit(() => notifyGameChanged(gameId));
    return updated;
  });
}

/**
 * startGameWithAuth() —— 带权限校验的确认开始
 */
export async function startGameWithAuth(
  gameId: number,
  userId: number,
): Promise<GameRow> {
  return withTransaction(async (client) => {

    const { rows } = await client.query(
      `SELECT * FROM games WHERE id = $1 FOR UPDATE`,
      [gameId],
    );
    if (rows.length === 0) {
      throw new NotFoundError('运动局不存在');
    }

    const game = toGameRow(rows[0]);

    if (game.host_id !== userId) {
      throw new ForbiddenError('仅发起人可确认开始');
    }

    if (game.status !== 'ready') {
      throw new InvalidStateError('只能开始即将开始的局');
    }

    if (game.member_count < 2) {
      throw new InvalidStateError('至少需要 2 人参与才能开始活动');
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE games SET status = 'in_progress', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [gameId],
    );
    const updated = toGameRow(updatedRows[0]);

    await (async () => {
      const { rows: members } = await pool.query<{ user_id: number }>(
        `SELECT user_id FROM game_members WHERE game_id = $1 AND left_at IS NULL`,
        [gameId],
      );
      for (const member of members) {
        await createNotification({
          user_id: Number(member.user_id),
          type: 'game_ready',
          title: '活动已开始',
          content: `你加入的「${updated.title}」已开始，祝玩得开心！`,
          game_id: gameId,
        });
      }
    })();

    afterCommit(() => notifyGameChanged(gameId));
    return updated;
  });
}

/**
 * completeGameWithAuth() —— 带权限校验的确认结束
 */
export async function completeGameWithAuth(
  gameId: number,
  userId: number,
): Promise<GameRow> {
  return withTransaction(async (client) => {

    const { rows } = await client.query(
      `SELECT * FROM games WHERE id = $1 FOR UPDATE`,
      [gameId],
    );
    if (rows.length === 0) {
      throw new NotFoundError('运动局不存在');
    }

    const game = toGameRow(rows[0]);

    // --- 仅发起人 ---
    if (game.host_id !== userId) {
      throw new ForbiddenError('仅发起人可确认结束');
    }

    // --- 状态校验 ---
    if (game.status !== 'in_progress') {
      throw new InvalidStateError('只能结束进行中的局');
    }

    // --- 更新状态 ---
    const { rows: updatedRows } = await client.query(
      `UPDATE games SET status = 'completed', completed_at = $2, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [gameId,new Date().toISOString()],
    );
    const updated = toGameRow(updatedRows[0]);

    const notifications = await settleGameSessions(updated);

    await (async () => {
      for (const notification of notifications) {
        await createNotification(notification);
      }
    })();

    afterCommit(() => notifyGameChanged(gameId));
    return updated;
  });
}

export async function completeGameBySystem(gameId: number): Promise<GameRow> {
  return withTransaction(async (client) => {

    const { rows } = await client.query(
      `SELECT * FROM games WHERE id = $1 FOR UPDATE`,
      [gameId],
    );
    if (rows.length === 0) {
      throw new NotFoundError('运动局不存在');
    }

    const game = toGameRow(rows[0]);
    if (game.status !== 'in_progress') {
      throw new InvalidStateError('只能自动结束进行中的局');
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE games SET status = 'completed', completed_at = $2, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [gameId,new Date().toISOString()],
    );
    const updated = toGameRow(updatedRows[0]);
    const notifications = await settleGameSessions(updated);

    await (async () => {
      for (const notification of notifications) {
        await createNotification(notification);
      }
    })();

    afterCommit(() => notifyGameChanged(gameId));
    return updated;
  });
}

// ================================================================
// 查询操作
// ================================================================

/**
 * listGames() —— 大厅列表
 *
 * 默认只返回 recruiting / full 状态的局
 * 满员局排在非满员局后面
 * 按 start_time 升序（最近即将开始的排前面）
 */
export async function listGames(query: ListGamesQuery, requestUserId?: number): Promise<ListGamesResult> {
  const {
    sport_type,
    status,
    campus_id,
    scope = 'campus',
    date,
    page = 1,
    page_size = 20,
    sort_by = 'start_time',
  } = query;
  const userContext = requestUserId ? await getUserContext(requestUserId) : null;

  // 构建筛选条件
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (userContext?.school_id) {
    conditions.push(`g.school_id = $${paramIdx++}`);
    params.push(userContext.school_id);
  }

  // 默认只展示 recruiting 和 full
  if (status) {
    conditions.push(`g.status = $${paramIdx++}`);
    params.push(status);
  } else {
    conditions.push(`g.status IN ('recruiting', 'full', 'ready')`);
  }

  const targetCampusId = campus_id || userContext?.campus_id;
  if (scope !== 'school' && targetCampusId) {
    conditions.push(`g.campus_id = $${paramIdx++}`);
    params.push(targetCampusId);
  }

  if (sport_type) {
    conditions.push(`g.sport_type = $${paramIdx++}`);
    params.push(sport_type);
  }

  if (date) {
    const startOfDay = new Date(`${date}T00:00:00`);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    conditions.push(`g.start_time >= $${paramIdx++} AND g.start_time < $${paramIdx++}`);
    params.push(startOfDay.toISOString(), endOfDay.toISOString());
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  // 排序：本校区优先 → 满员局排在后面 → 按排序字段
  let orderClause: string;
  const campusPriority = userContext?.campus_id
    ? `CASE WHEN g.campus_id = ${Number(userContext.campus_id)} THEN 0 ELSE 1 END, `
    : '';
  switch (sort_by) {
    case 'created_at':
      orderClause = `${campusPriority}CASE WHEN g.status = 'full' THEN 1 ELSE 0 END, g.created_at ASC`;
      break;
    case 'member_count':
      orderClause = `${campusPriority}CASE WHEN g.status = 'full' THEN 1 ELSE 0 END, g.member_count DESC`;
      break;
    case 'start_time':
    default:
      orderClause = `${campusPriority}CASE WHEN g.status = 'full' THEN 1 ELSE 0 END, g.start_time ASC`;
      break;
  }

  // 分页
  const offset = (page - 1) * page_size;

  // 统计总数
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) AS total FROM games g ${whereClause}`,
    params,
  );
  const total = parseInt(countRows[0].total, 10);

  // 查询列表
  const { rows: gameRows } = await pool.query(
    `SELECT
       g.*,
       s.name AS school_name,
       c.name AS campus_name,
       COALESCE(v.name, g.venue_name_snapshot) AS venue_name,
       u.nickname AS creator_name,
       u.reward_level AS host_reward_level,
       COALESCE(mp.total_xp,0) AS host_reward_points,
       CASE WHEN g.host_id = $${paramIdx} THEN 1 ELSE 0 END AS is_host,
       CASE
         WHEN g.host_id = $${paramIdx} THEN 1
         WHEN EXISTS (
           SELECT 1
           FROM game_members gm_self
           WHERE gm_self.game_id = g.id
             AND gm_self.user_id = $${paramIdx}
             AND gm_self.left_at IS NULL
         ) THEN 1
         ELSE 0
       END AS is_member
     FROM games g
     LEFT JOIN schools s ON s.id = g.school_id
     LEFT JOIN campuses c ON c.id = g.campus_id
     LEFT JOIN venues v ON v.id = g.venue_id
     LEFT JOIN users u ON u.id = g.host_id
     LEFT JOIN motion_profiles mp ON mp.user_id=u.id
     ${whereClause}
     ORDER BY ${orderClause}
     LIMIT $${paramIdx + 1} OFFSET $${paramIdx + 2}`,
    [...params, requestUserId || 0, page_size, offset],
  );

  const games = gameRows.map(toGameRow);

  return {
    games,
    pagination: {
      page,
      page_size,
      total,
      total_pages: Math.ceil(total / page_size),
    },
  };
}

/**
 * getGameDetail() —— 局详情 + 成员列表
 *
 * 返回局的全部字段、活跃成员列表、当前用户是否在局中、是否是发起人
 */
export async function getGameDetail(
  gameId: number,
  requestUserId?: number,
): Promise<GameDetailResult> {
  // 查询局信息
  const { rows: gameRows } = await pool.query(
    `SELECT
       g.*,
       s.name AS school_name,
       c.name AS campus_name,
       COALESCE(v.name, g.venue_name_snapshot) AS venue_name
     FROM games g
     LEFT JOIN schools s ON s.id = g.school_id
     LEFT JOIN campuses c ON c.id = g.campus_id
     LEFT JOIN venues v ON v.id = g.venue_id
     WHERE g.id = $1`,
    [gameId],
  );
  if (gameRows.length === 0) {
    throw new NotFoundError('运动局不存在');
  }

  const game = toGameRow(gameRows[0]);

  // 查询活跃成员列表（含用户信息）
  const { rows: memberRows } = await pool.query<MemberRow>(
    `SELECT gm.user_id, u.nickname, u.avatar_url,
            u.reward_level, COALESCE(mp.total_xp,0) AS total_reward_points,
            COALESCE(ss.xp,0) AS session_xp,
            gm.joined_at,
            gm.checked_in_at, gm.attendance_confirmed_at, gm.reward_points, gm.reward_granted_at
     FROM game_members gm
     JOIN users u ON u.id = gm.user_id
     LEFT JOIN motion_profiles mp ON mp.user_id=u.id
     LEFT JOIN sport_sessions ss ON ss.game_id=gm.game_id AND ss.user_id=gm.user_id
     WHERE gm.game_id = $1 AND gm.left_at IS NULL
     ORDER BY gm.joined_at ASC`,
    [gameId],
  );

  // 判断当前用户是否在局中 / 是否是发起人
  const userId = requestUserId || 0;
  const is_host = userId === game.host_id;
  const is_member = is_host || memberRows.some((m) => m.user_id === userId);

  return {
    game,
    members: memberRows.map((m) => ({
      user_id: m.user_id,
      nickname: m.nickname,
      avatar_url: m.avatar_url,
      reward_level: progress(Number(m.total_reward_points || 0)).level,
      session_xp: Number((m as any).session_xp || 0),
      total_reward_points: Number(m.total_reward_points ?? 0),
      joined_at: m.joined_at,
      checked_in_at: m.checked_in_at ? new Date(m.checked_in_at) : null,
      attendance_confirmed_at: m.attendance_confirmed_at ? new Date(m.attendance_confirmed_at) : null,
      reward_points: Number(m.reward_points ?? 0),
      reward_granted_at: m.reward_granted_at ? new Date(m.reward_granted_at) : null,
    })),
    is_member,
    is_host,
  };
}

// ================================================================
// 通知辅助
// ================================================================

interface CreateNotificationInput {
  user_id: number;
  type:
  | 'member_joined'
  | 'member_left'
  | 'game_ready'
  | 'new_message'
  | 'game_cancelled'
  | 'game_full'
  | 'check_in_reminder'
  | 'reward_granted'
  | 'penalty_applied';
  title: string;
  content: string;
  game_id: number;
}


/**
 * 创建通知记录（写入 notifications 表）
 * 通知记录与业务共用事务；网络发送失败不会回滚已提交的数据。
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  await withTransaction(async () => {
    const { rows } = await pool.query<{ id: number; created_at: string }>(
      `INSERT INTO notifications (user_id, type, title, content, game_id, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, NOW()) RETURNING id, created_at`,
      [input.user_id, input.type, input.title, input.content, input.game_id],
    );
    const created = rows[0];
    afterCommit(async () => {
      await redis.incr(`notif:${input.user_id}:unread`).catch(() => {});
      await pushToUser(input.user_id, {
        id: Number(created.id), type: input.type, title: input.title, content: input.content,
        gameId: input.game_id, createdAt: created.created_at,
      });
    });
  });
}

// ================================================================
// 状态转换副作用处理
// ================================================================

/**
 * 状态转换完成后触发副作用（通知等）
 * 此函数在事务 commit 之后调用，失败不影响业务数据
 */
async function handleTransitionSideEffects(
  game: GameRow,
  from: GameStatus,
  to: GameStatus,
): Promise<void> {
  // ready → in_progress：通知所有参与者局已开始
  if (from === 'ready' && to === 'in_progress') {
    const { rows: members } = await pool.query(
      `SELECT user_id FROM game_members WHERE game_id = $1 AND left_at IS NULL`,
      [game.id],
    );
    for (const m of members) {
      await createNotification({
        user_id: m.user_id,
        type: 'game_ready',
        title: '局即将开始',
        content: `你加入的「${game.title}」已开始，祝玩得开心！`,
        game_id: game.id,
      });
    }
  }

  // recruiting/full → cancelled（由定时任务触发）
  // 通知已在 cron 层单独处理，这里不做重复通知
}

/** Broadcast committed data so other viewers can refresh their member list. */
export async function notifyGameChanged(gameId: number, event: 'game_update' | 'member_change' = 'game_update'): Promise<void> {
  const { rows } = await pool.query('SELECT status, member_count FROM games WHERE id = $1', [gameId]);
  if (rows[0]) broadcastToGame(gameId, event, { gameId, changes: rows[0] });
}
