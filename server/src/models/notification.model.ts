import { pool } from '../db/pool';
import type { NotificationType } from '../utils/validator';

/** 通知表行数据接口 */
export interface NotificationRow {
  id: number;
  user_id: number;
  type: NotificationType;
  title: string;
  content: string;
  game_id: number | null;
  is_read: boolean;
  created_at: Date;
}

/** 创建通知时需要的字段 */
export interface CreateNotificationData {
  user_id: number;
  type: NotificationType;
  title: string;
  content: string;
  game_id?: number;
}

/** 通知列表查询参数 */
export interface ListNotificationsOptions {
  user_id: number;
  page: number;
  page_size: number;
}

/** 通知列表返回结构 */
export interface NotificationListResult {
  notifications: NotificationRow[];
  unread_count: number;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/**
 * 通知数据模型
 * 封装 notifications 表的所有 SQL 查询
 */
export const NotificationModel = {

  /**
   * 根据 ID 查找通知
   */
  async findById(id: number): Promise<NotificationRow | null> {
    const { rows } = await pool.query<NotificationRow>(
      'SELECT * FROM notifications WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  },

  /**
   * 创建通知，返回完整记录
   */
  async create(data: CreateNotificationData): Promise<NotificationRow> {
    const { rows } = await pool.query<NotificationRow>(
      `INSERT INTO notifications (user_id, type, title, content, game_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.user_id, data.type, data.title, data.content, data.game_id ?? null]
    );
    return rows[0];
  },

  /**
   * 批量创建通知（同一类型的多条通知分别插入）
   */
  async bulkCreate(notifications: CreateNotificationData[]): Promise<NotificationRow[]> {
    if (notifications.length === 0) return [];

    // 构建批量 INSERT 语句
    const values: any[] = [];
    const placeholders: string[] = [];
    let i = 0;
    for (const n of notifications) {
      const base = i * 5;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
      values.push(n.user_id, n.type, n.title, n.content, n.game_id ?? null);
      i++;
    }

    const { rows } = await pool.query<NotificationRow>(
      `INSERT INTO notifications (user_id, type, title, content, game_id)
       VALUES ${placeholders.join(', ')}
       RETURNING *`,
      values
    );
    return rows;
  },

  /**
   * 分页获取用户通知列表，同时返回未读数
   */
  async listByUser(opts: ListNotificationsOptions): Promise<NotificationListResult> {
    const { user_id, page, page_size } = opts;
    const offset = (page - 1) * page_size;

    // 并行查询：通知列表 + 未读数 + 总数
    const [listResult, unreadResult, countResult] = await Promise.all([
      pool.query<NotificationRow>(
        `SELECT * FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [user_id, page_size, offset]
      ),
      pool.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
        [user_id]
      ),
      pool.query<{ total: string }>(
        'SELECT COUNT(*) as total FROM notifications WHERE user_id = $1',
        [user_id]
      ),
    ]);

    const total = parseInt(countResult.rows[0].total, 10);
    const unread_count = parseInt(unreadResult.rows[0].count, 10);

    return {
      notifications: listResult.rows,
      unread_count,
      total,
      page,
      page_size,
      total_pages: Math.ceil(total / page_size) || 1,
    };
  },

  /**
   * 标记单条通知为已读（仅允许通知的接收者操作）
   */
  async markRead(id: number, userId: number): Promise<void> {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
  },

  /**
   * 标记用户所有通知为已读
   */
  async markAllRead(userId: number): Promise<void> {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );
  },
};
