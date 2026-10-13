/**
 * 通知服务
 *
 * 核心职责：创建通知、模板填充、DB 持久化、Redis 未读计数、WebSocket 实时推送。
 *
 * 通知类型（6 种）：
 *   member_joined   - 有人加入你的局
 *   member_left     - 有人退出（满员回退场景）
 *   game_starting   - 局即将开始（距开始 ≤ 30 分钟）
 *   game_cancelled  - 局已取消
 *   new_message     - 局内新消息（有 5 分钟节流）
 *   game_full       - 局已满员
 */
import { pool } from '../db/pool';
import { redis } from '../db/index';
import { pushToUser } from '../websocket/notification.handler';

// ----------------------------------------------------------------
// 类型定义
// ----------------------------------------------------------------

/** 通知类型枚举 */
export type NotificationType =
  | 'member_joined'
  | 'member_left'
  | 'game_ready'
  | 'game_starting'
  | 'game_cancelled'
  | 'new_message'
  | 'game_full'
  | 'check_in_reminder'
  | 'reward_granted'
  | 'penalty_applied';

/** 通知记录（数据库行映射） */
export interface NotificationRow {
  id: number;
  user_id: number;
  type: NotificationType;
  title: string;
  content: string;
  game_id: number | null;
  is_read: boolean;
  created_at: string;
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ----------------------------------------------------------------
// 通知模板（文案来自 backend-design.md §4.2）
// 字段映射：title=简短标题, content=模板内容（含 {placeholder} 占位符）
// ----------------------------------------------------------------

interface Template {
  title: string;
  content: string;
}

const TEMPLATES: Record<NotificationType, Template> = {
  member_joined: {
    title: '新成员加入',
    content: '{joiner_nickname} 加入了你的「{game_title}」',
  },
  member_left: {
    title: '成员退出',
    content: '{leaver_nickname} 退出了「{game_title}」，该局已重新展示在大厅',
  },
  game_ready: {
    title: '活动已开始',
    content: '你加入的「{game_title}」已开始，祝玩得开心！',
  },
  game_starting: {
    title: '局即将开始',
    content: '你加入的「{game_title}」将在 30 分钟后开始，记得准时参加！',
  },
  game_cancelled: {
    title: '局已取消',
    content: '你加入的「{game_title}」已被取消',
  },
  new_message: {
    title: '新消息',
    // content_preview 截断到 50 字符
    content: '{sender_nickname}：{content_preview}',
  },
  game_full: {
    title: '局已满员',
    content: '你的「{game_title}」已满员',
  },
  check_in_reminder: {
    title: '签到提醒',
    content: '你加入的「{game_title}」将在 30 分钟后开始，记得点击“我已到场”完成签到',
  },
  reward_granted: {
    title: '奖励已到账',
    content: '你在「{game_title}」完成活动，奖励已到账',
  },
  penalty_applied: {
    title: '扣分提醒',
    content: '你在「{game_title}」触发了活动扣分规则，请留意出勤',
  },
};

// ----------------------------------------------------------------
// 工具函数
// ----------------------------------------------------------------

/**
 * 填充模板中的占位符
 * 例如 fillTemplate('{joiner_nickname} 加入了「{game_title}」', { joiner_nickname: '张三', game_title: '篮球局' })
 *  → '张三 加入了「篮球局」'
 */
function fillTemplate(template: string, context: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => context[key] ?? `{${key}}`);
}

/**
 * 截断文本到指定长度（用于 new_message 通知的消息预览）
 */
function truncateText(text: string, maxLen: number = 50): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

// ----------------------------------------------------------------
// 核心函数：创建通知并推送
// ----------------------------------------------------------------

/**
 * 创建通知并尝试实时推送
 *
 * 流程：
 * 1. 根据 type 查找模板，用 context 填充 title 和 content
 * 2. 写入 notifications 表
 * 3. Redis 未读计数 +1（key: notif:{userId}:unread）
 * 4. 尝试 WebSocket 实时推送（用户离线则静默跳过，通知已持久化）
 *
 * @param userId  - 接收通知的用户 ID
 * @param type    - 通知类型
 * @param gameId  - 关联的局 ID（可为 null）
 * @param context - 模板填充上下文，如 { joiner_nickname: '张三', game_title: '篮球局' }
 * @returns 创建的通知记录
 */
export async function createAndNotify(
  userId: number,
  type: NotificationType,
  gameId: number | null,
  context: Record<string, string>,
): Promise<NotificationRow> {
  const template = TEMPLATES[type];
  if (!template) {
    throw new Error(`未知的通知类型: ${type}`);
  }

  // 1. 填充模板
  const title = fillTemplate(template.title, context);

  // 对 new_message 类型，截断预览文本到 50 字符
  const contentContext = { ...context };
  if (type === 'new_message' && context.content_preview) {
    contentContext.content_preview = truncateText(context.content_preview, 50);
  }
  const content = fillTemplate(template.content, contentContext);

  // 2. 写入数据库
  const result = await pool.query<NotificationRow>(
    `INSERT INTO notifications (user_id, type, title, content, game_id, is_read, created_at)
     VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
     RETURNING id, user_id, type, title, content, game_id, is_read,
              created_at`,
    [userId, type, title, content, gameId],
  );
  const notification = result.rows[0];

  // 3. Redis 未读计数 +1
  redis.incr(`notif:${userId}:unread`).catch((err: Error) => {
    console.error(`[NotificationService] Redis incr 失败 (userId=${userId}):`, err.message);
  });

  // 4. 尝试 WebSocket 实时推送
  pushToUser(userId, {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    content: notification.content,
    gameId: notification.game_id,
    createdAt: notification.created_at,
  });

  return notification;
}

// ----------------------------------------------------------------
// 查询接口
// ----------------------------------------------------------------

/**
 * 获取用户的通知列表（分页，按时间倒序）
 *
 * @returns 通知列表 + 未读数 + 分页信息
 */
export async function getNotifications(
  userId: number,
  page: number = 1,
  pageSize: number = 20,
): Promise<{ notifications: NotificationRow[]; unreadCount: number; pagination: { page: number; pageSize: number; total: number; totalPages: number } }> {
  
  const offset = (page - 1) * pageSize;

  // 并行查询：通知列表 + 总数 + 未读数
  const [notifResult, countResult, unreadCount] = await Promise.all([
    pool.query<NotificationRow>(
      `SELECT id, user_id, type, title, content, game_id, is_read,
              created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, pageSize, offset],
    ),
    pool.query<{ total: string }>(
      'SELECT COUNT(*) AS total FROM notifications WHERE user_id = $1',
      [userId],
    ),
    getUnreadCount(userId),
  ]);

  const total = parseInt(countResult.rows[0].total, 10);

  
  return {
    notifications: notifResult.rows,
    unreadCount,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ----------------------------------------------------------------
// 已读管理
// ----------------------------------------------------------------

/**
 * 标记单条通知为已读
 *
 * @param notificationId - 通知 ID
 * @param userId          - 当前用户 ID（防止越权操作他人通知）
 */
export async function markRead(notificationId: number, userId: number): Promise<void> {
  const result = await pool.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE id = $1 AND user_id = $2 AND is_read = FALSE`,
    [notificationId, userId],
  );

  if (result.rowCount > 0) await recalcUnread(userId);
}

/**
 * 全部标记为已读
 * 使用数据库 UPDATE 批量操作 + 删除 Redis 未读计数 key
 */
export async function markAllRead(userId: number): Promise<void> {
  await pool.query(
    `UPDATE notifications
     SET is_read = TRUE
     WHERE user_id = $1 AND is_read = FALSE`,
    [userId],
  );

  // 清空 Redis 未读计数器
  redis.del(`notif:${userId}:unread`).catch(() => {});
}

/**
 * 批量删除通知
 */
export async function deleteByIds(userId: number, ids: number[]): Promise<{ deleted: number }> {
  if (ids.length === 0) return { deleted: 0 };
  const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
  const result = await pool.query(
    `DELETE FROM notifications WHERE user_id = $1 AND id IN (${placeholders})`,
    [userId, ...ids],
  );
  // 重置 Redis 未读计数器（无法精确计算剩余未读数，统一重新计算）
  await recalcUnread(userId);
  return { deleted: result.rowCount ?? 0 };
}

async function recalcUnread(userId: number): Promise<void> {
  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*) as n FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [userId],
    );
    const count = Number((rows[0] as any).n);
    redis.set(`notif:${userId}:unread`, count).catch(() => {});
  } catch {
    // ignore
  }
}

/**
 * 清除所有通知
 */
export async function clearAll(userId: number): Promise<{ deleted: number }> {
  const result = await pool.query(
    'DELETE FROM notifications WHERE user_id = $1',
    [userId],
  );
  redis.del(`notif:${userId}:unread`).catch(() => {});
  return { deleted: result.rowCount ?? 0 };
}

/**
 * 获取未读通知数量
 * 优先从 Redis 读取（热数据），降级时查询数据库
 */
export async function getUnreadCount(userId: number): Promise<number> {
  // The local memory cache is lost on restart. SQLite remains authoritative.
  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [userId],
  );
  const dbCount = parseInt(result.rows[0].count, 10);

  // 回填 Redis（最终一致性）
  redis.set(`notif:${userId}:unread`, dbCount).catch(() => {});

  return dbCount;
}

/**
 * 跨视频同步未读计数（当 Redis 和 DB 不一致时，用 DB 纠正 Redis）
 * 可在用户登录时调用一次
 */
export async function syncUnreadCount(userId: number): Promise<number> {
  const result = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [userId],
  );
  const dbCount = parseInt(result.rows[0].count, 10);
  await redis.set(`notif:${userId}:unread`, dbCount);
  return dbCount;
}
