import { pool } from '../db/pool';

/** 局成员关系表行数据接口 */
export interface GameMemberRow {
  id: number;
  game_id: number;
  user_id: number;
  joined_at: Date;
  left_at: Date | null;   // NULL 表示仍在局中
}

/** 成员列表项（含用户简要信息） */
export interface GameMemberWithUser {
  user_id: number;
  nickname: string;
  avatar_url: string;
  joined_at: Date;
}

/**
 * 局成员数据模型
 * 封装 game_members 表的所有 SQL 查询
 * 采用软删除模式（设置 left_at），支持退出后再加入
 */
export const GameMemberModel = {

  /**
   * 查询用户在某局的活跃记录（left_at IS NULL）
   */
  async findActiveByGameAndUser(gameId: number, userId: number): Promise<GameMemberRow | null> {
    const { rows } = await pool.query<GameMemberRow>(
      `SELECT * FROM game_members
       WHERE game_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [gameId, userId]
    );
    return rows[0] || null;
  },

  /**
   * 用户加入运动局（创建活跃成员记录）
   */
  async create(gameId: number, userId: number): Promise<GameMemberRow> {
    const { rows } = await pool.query<GameMemberRow>(
      `INSERT INTO game_members (game_id, user_id)
       VALUES ($1, $2)
       RETURNING *`,
      [gameId, userId]
    );
    return rows[0];
  },

  /**
   * 标记用户退出（设置 left_at）
   */
  async markLeft(id: number): Promise<void> {
    await pool.query(
      'UPDATE game_members SET left_at = NOW() WHERE id = $1',
      [id]
    );
  },

  /**
   * 获取某局所有活跃成员（含用户简要信息）
   */
  async listActiveByGame(gameId: number): Promise<GameMemberWithUser[]> {
    const { rows } = await pool.query<GameMemberWithUser>(
      `SELECT gm.user_id, u.nickname, u.avatar_url, gm.joined_at
       FROM game_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.game_id = $1 AND gm.left_at IS NULL
       ORDER BY gm.joined_at ASC`,
      [gameId]
    );
    return rows;
  },

  /**
   * 统计某局活跃成员数
   */
  async countActiveByGame(gameId: number): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM game_members WHERE game_id = $1 AND left_at IS NULL',
      [gameId]
    );
    return parseInt(rows[0].count, 10);
  },

  /**
   * 获取某局的所有成员（包括已退出的），用于通知等场景
   */
  async listAllActiveMembers(gameId: number): Promise<Pick<GameMemberRow, 'id' | 'user_id'>[]> {
    const { rows } = await pool.query<Pick<GameMemberRow, 'id' | 'user_id'>>(
      `SELECT id, user_id FROM game_members
       WHERE game_id = $1 AND left_at IS NULL`,
      [gameId]
    );
    return rows;
  },

  /**
   * 检查用户是否是某局的活跃成员
   */
  async isActiveMember(gameId: number, userId: number): Promise<boolean> {
    const { rows } = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM game_members
         WHERE game_id = $1 AND user_id = $2 AND left_at IS NULL
       ) as "exists"`,
      [gameId, userId]
    );
    return rows[0].exists;
  },
};
