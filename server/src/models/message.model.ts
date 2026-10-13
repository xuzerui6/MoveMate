import { pool } from '../db/pool';

/** 聊天消息表行数据接口 */
export interface MessageRow {
  id: number;
  game_id: number;
  sender_id: number;
  content: string;
  created_at: Date;
}

/** 创建消息时需要的字段 */
export interface CreateMessageData {
  game_id: number;
  sender_id: number;
  content: string;
}

/** 消息列表查询参数 */
export interface ListMessagesOptions {
  game_id: number;
  before_id?: number;   // 游标翻页：取此 ID 之前的消息
  limit?: number;        // 默认 50
}

/**
 * 聊天消息数据模型
 * 封装 chat_messages 表的所有 SQL 查询
 */
export const MessageModel = {

  /**
   * 根据 ID 查找消息
   */
  async findById(id: number): Promise<MessageRow | null> {
    const { rows } = await pool.query<MessageRow>(
      'SELECT * FROM chat_messages WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  },

  /**
   * 创建聊天消息，返回完整记录
   */
  async create(data: CreateMessageData): Promise<MessageRow> {
    const { rows } = await pool.query<MessageRow>(
      `INSERT INTO chat_messages (game_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.game_id, data.sender_id, data.content]
    );
    return rows[0];
  },

  /**
   * 获取指定局的聊天消息列表（游标翻页）
   * 默认按时间倒序取最近 50 条
   */
  async listByGame(opts: ListMessagesOptions): Promise<MessageRow[]> {
    const limit = opts.limit ?? 50;

    if (opts.before_id) {
      // 游标翻页：取指定 ID 之前的消息
      const { rows } = await pool.query<MessageRow>(
        `SELECT * FROM chat_messages
         WHERE game_id = $1 AND id < $2
         ORDER BY created_at DESC, id DESC
         LIMIT $3`,
        [opts.game_id, opts.before_id, limit]
      );
      // 按时间升序返回（方便前端展示）
      return rows.reverse();
    }

    // 首次加载：取最近的消息
    const { rows } = await pool.query<MessageRow>(
      `SELECT * FROM chat_messages
       WHERE game_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [opts.game_id, limit]
    );
    return rows.reverse();
  },
};
