/**
 * 奖励与签到服务
 *
 * 从 game.service 抽离，负责：
 *   - 签到时间窗校验
 *   - 用户奖励积分 / 等级 / 徽章 / 连续出勤
 *   - 退出 / 缺勤扣分
 *   - 局完成时批量奖励发放
 *
 * 设计原则：
 *   - 所有 DB 操作都接受 PoolClient（事务上下文）
 *   - 不直接调用 pushToUser / 通知；返回 CreateNotificationInput[] 供调用方发送
 *   - 常量集中定义在此，便于调整积分策略
 */
import { pool } from '../db/pool';
import type { PoolClient } from '../db/pool';
import { NotFoundError, InvalidStateError } from '../utils/errors';

// ================================================================
// 常量
// ================================================================

/** 发起人完成活动的奖励积分（签到即得） */
export const HOST_REWARD_POINTS = 5;

/** 普通成员完成活动的奖励积分（签到 + 确认出席） */
export const MEMBER_REWARD_POINTS = 3;

/** 开始前 2 小时内退出扣分 */
export const LEAVE_PENALTY_POINTS = 2;

/** 未签到扣分 */
export const NO_SHOW_PENALTY_POINTS = 3;

/** 签到提前开放时间（分钟） */
export const CHECK_IN_ADVANCE_MINUTES = 30;

/** 开始前多少时间退出免费（2 小时） */
export const FREE_LEAVE_WINDOW_MS = 2 * 60 * 60 * 1000;

/** 等级阈值（积分 → 等级） */
export const LEVEL_THRESHOLDS = [0, 5, 12, 24, 40, 60, 90];

/** 等级称号 */
const LEVEL_TITLES = [
  '新手球友',
  '校园活跃者',
  '运动熟人',
  '热血玩家',
  '活跃领队',
  '王牌组局者',
];

// ================================================================
// 工具函数
// ================================================================

function getRewardLevel(points: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (points >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    }
  }
  return level;
}

/** 等级 → 称号 */
export function getLevelTitle(level: number): string {
  if (level >= LEVEL_TITLES.length) return LEVEL_TITLES[LEVEL_TITLES.length - 1];
  return LEVEL_TITLES[level - 1] || LEVEL_TITLES[0];
}

interface BadgeStats {
  completed_games: number;
  hosted_completed_games: number;
  reward_streak: number;
}

function deriveBadges(stats: BadgeStats): string[] {
  const badges: string[] = [];
  if (stats.completed_games >= 1) badges.push('初次出局');
  if (stats.completed_games >= 5) badges.push('活跃玩家');
  if (stats.hosted_completed_games >= 3) badges.push('组局达人');
  if (stats.reward_streak >= 3) badges.push('连续出勤');
  return badges;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function formatLocalDateText(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function parseLocalDateText(dateText: string): Date {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getRewardDateText(input?: string | Date | null): string {
  const date = input ? new Date(input) : new Date();
  return formatLocalDateText(date);
}

function isNextCalendarDay(prevDateText: string, currentDateText: string): boolean {
  const prevDate = parseLocalDateText(prevDateText);
  prevDate.setDate(prevDate.getDate() + 1);
  return formatLocalDateText(prevDate) === currentDateText;
}

// ================================================================
// 公开工具
// ================================================================

/** 根据游戏时间和当前时间，判断是否需要扣分退出 */
export function getLeavePenaltyPoints(
  startTime: Date | string,
  now: Date = new Date(),
): number {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  return start.getTime() - now.getTime() <= FREE_LEAVE_WINDOW_MS
    ? LEAVE_PENALTY_POINTS
    : 0;
}

// ================================================================
// 签到时间窗
// ================================================================

export interface GameTiming {
  start_time: Date | string;
  end_time: Date | string | null;
}

/** 签到截止时间：优先 end_time，否则 start_time + 2 小时 */
export function getCheckInDeadline(game: GameTiming): Date {
  if (game.end_time) return new Date(game.end_time);
  const start = typeof game.start_time === 'string' ? new Date(game.start_time) : game.start_time;
  return new Date(start.getTime() + 2 * 60 * 60 * 1000);
}

/** 校验当前是否在签到窗口内 */
export function assertCheckInWindow(game: GameTiming): void {
  const now = new Date();
  const start = typeof game.start_time === 'string' ? new Date(game.start_time) : game.start_time;
  const openAt = new Date(start.getTime() - CHECK_IN_ADVANCE_MINUTES * 60 * 1000);
  const closeAt = getCheckInDeadline(game);
  if (now < openAt) {
    throw new InvalidStateError(`签到将于开始前${CHECK_IN_ADVANCE_MINUTES}分钟开放`);
  }
  if (now > closeAt) {
    throw new InvalidStateError('签到时间已截止');
  }
}

// ================================================================
// 内部类型
// ================================================================

interface RewardUserRow {
  id: number;
  reward_points: number;
  reward_level: number;
  reward_streak: number;
  completed_games: number;
  hosted_completed_games: number;
  reward_badges: string | null;
  last_rewarded_date: string | null;
}

// ================================================================
// 奖励 / 扣分（事务内）
// ================================================================

/** 更新用户奖励进度（事务内） */
export async function updateUserRewardProgress(
  client: PoolClient,
  userId: number,
  rewardPoints: number,
  isHostReward: boolean,
  rewardDateText: string,
): Promise<void> {
  const { rows } = await client.query<RewardUserRow>(
    `SELECT id, reward_points, reward_level, reward_streak, completed_games, hosted_completed_games, reward_badges, last_rewarded_date
     FROM users
     WHERE id = $1`,
    [userId],
  );
  if (!rows[0]) {
    throw new NotFoundError('用户不存在');
  }

  const current = rows[0];
  const totalPoints = Number(current.reward_points ?? 0) + rewardPoints;
  const completedGames = Number(current.completed_games ?? 0) + 1;
  const hostedCompletedGames = Number(current.hosted_completed_games ?? 0) + (isHostReward ? 1 : 0);
  let streak = Number(current.reward_streak ?? 0);
  const lastRewardedDate = current.last_rewarded_date || null;

  if (!lastRewardedDate) {
    streak = 1;
  } else if (lastRewardedDate === rewardDateText) {
    streak = Math.max(1, streak);
  } else if (isNextCalendarDay(lastRewardedDate, rewardDateText)) {
    streak += 1;
  } else {
    streak = 1;
  }

  const rewardLevel = getRewardLevel(totalPoints);
  const rewardBadges = JSON.stringify(
    deriveBadges({
      completed_games: completedGames,
      hosted_completed_games: hostedCompletedGames,
      reward_streak: streak,
    }),
  );

  await client.query(
    `UPDATE users
     SET reward_points = $2,
         reward_level = $3,
         reward_streak = $4,
         completed_games = $5,
         hosted_completed_games = $6,
         reward_badges = $7,
         last_rewarded_date = $8,
         updated_at = NOW()
     WHERE id = $1`,
    [
      userId,
      totalPoints,
      rewardLevel,
      streak,
      completedGames,
      hostedCompletedGames,
      rewardBadges,
      rewardDateText,
    ],
  );
}

/** 用户扣分（事务内） */
export async function applyUserPointPenalty(
  client: PoolClient,
  userId: number,
  penaltyPoints: number,
): Promise<void> {
  const { rows } = await client.query<RewardUserRow>(
    `SELECT id, reward_points, reward_level FROM users WHERE id = $1`,
    [userId],
  );
  if (!rows[0]) {
    throw new NotFoundError('用户不存在');
  }

  const current = rows[0];
  const totalPoints = Number(current.reward_points ?? 0) - penaltyPoints;
  const rewardLevel = getRewardLevel(totalPoints);

  await client.query(
    `UPDATE users
     SET reward_points = $2,
         reward_level = $3,
         updated_at = NOW()
     WHERE id = $1`,
    [userId, totalPoints, rewardLevel],
  );
}

// ================================================================
// 局完成时批量奖励（事务内）
// ================================================================

export interface GameForReward {
  id: number;
  host_id: number;
  title: string;
  completed_at: Date | string | null;
}

export interface MemberForReward {
  user_id: number;
  checked_in_at: string | null;
  attendance_confirmed_at: string | null;
  reward_granted_at: string | null;
}

export interface RewardNotification {
  user_id: number;
  type: 'reward_granted' | 'penalty_applied';
  title: string;
  content: string;
  game_id: number;
}

/**
 * 局完成时批量计算每个成员的奖励 / 扣分，返回待发通知列表。
 * 业务层负责在事务提交后逐条调用 createNotification。
 */
export async function awardGameCompletionRewards(
  client: PoolClient,
  game: GameForReward,
): Promise<RewardNotification[]> {
  const rewardDateText = getRewardDateText(game.completed_at || new Date());
  const notifications: RewardNotification[] = [];

  const { rows: members } = await client.query<MemberForReward>(
    `SELECT user_id, checked_in_at, attendance_confirmed_at, reward_granted_at
     FROM game_members
     WHERE game_id = $1 AND left_at IS NULL`,
    [game.id],
  );

  // 反刷分：至少需要 2 人签到才发放奖励
  const checkedInCount = members.filter((m) => m.checked_in_at).length;

  for (const member of members) {
    if (member.reward_granted_at) continue;
    const isHostReward = Number(member.user_id) === Number(game.host_id);
    const hasCheckedIn = Boolean(member.checked_in_at);
    const attendanceConfirmed = Boolean(member.attendance_confirmed_at);
    const eligible = isHostReward
      ? (hasCheckedIn && checkedInCount >= 2)
      : Boolean(hasCheckedIn && attendanceConfirmed && checkedInCount >= 2);

    if (!eligible) {
      if (!hasCheckedIn) {
        await applyUserPointPenalty(client, Number(member.user_id), NO_SHOW_PENALTY_POINTS);
        notifications.push({
          user_id: Number(member.user_id),
          type: 'penalty_applied',
          title: '缺勤扣分提醒',
          content: `你未在「${game.title}」完成签到，已扣除 ${NO_SHOW_PENALTY_POINTS} 积分`,
          game_id: game.id,
        });
      } else if (checkedInCount < 2) {
        // 只有一人签到，不奖励也不扣分——局无效
        console.log(`[Reward] game=${game.id} 仅 ${checkedInCount} 人签到，不发放奖励`);
      }
      continue;
    }

    const rewardPoints = isHostReward ? HOST_REWARD_POINTS : MEMBER_REWARD_POINTS;

    await client.query(
      `UPDATE game_members
       SET reward_points = $3,
           reward_granted_at = NOW()
       WHERE game_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [game.id, member.user_id, rewardPoints],
    );

    await updateUserRewardProgress(
      client,
      Number(member.user_id),
      rewardPoints,
      isHostReward,
      rewardDateText,
    );
    notifications.push({
      user_id: Number(member.user_id),
      type: 'reward_granted',
      title: '奖励已到账',
      content: `你在「${game.title}」完成活动，获得 ${rewardPoints} 积分奖励`,
      game_id: game.id,
    });
  }

  return notifications;
}

// ================================================================
// 用户上下文中（school_id, campus_id）
// ================================================================

export interface UserContext {
  school_id: number;
  campus_id: number;
}

export async function getUserContext(userId: number): Promise<UserContext> {
  const { rows } = await pool.query<UserContext>(
    `SELECT school_id, campus_id FROM users WHERE id = $1`,
    [userId],
  );
  if (!rows[0]) {
    throw new NotFoundError('用户不存在');
  }
  return {
    school_id: Number(rows[0].school_id ?? 1),
    campus_id: Number(rows[0].campus_id ?? 1),
  };
}