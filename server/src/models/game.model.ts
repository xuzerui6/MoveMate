import { pool } from '../db/pool';
import type { SportType, GameStatus, GameTag } from '../utils/validator';

/** 运动局表行数据接口 */
export interface GameRow {
  id: number;
  host_id: number;
  sport_type: SportType;
  title: string;
  location: string;
  max_players: number;
  start_time: Date;
  end_time: Date | null;
  completed_at: Date | null;
  status: GameStatus;
  tag: GameTag | null;
  member_count: number;
  created_at: Date;
  updated_at: Date;
}

/** 创建运动局时需要的字段 */
export interface CreateGameData {
  host_id: number;
  sport_type: SportType;
  title: string;
  location: string;
  max_players: number;
  start_time: Date;
  tag?: GameTag;
}

/** 列表查询过滤参数 */
export interface ListGamesFilter {
  sport_type?: SportType;
  status?: GameStatus;
  page: number;
  page_size: number;
  sort_by?: 'start_time' | 'created_at';
}

/** 分页结果 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/**
 * 运动局数据模型
 * 封装 games 表的所有 SQL 查询，使用参数化查询防注入
 */
export const GameModel = {

  /**
   * 根据 ID 查找运动局
   */
  async findById(id: number): Promise<GameRow | null> {
    const { rows } = await pool.query<GameRow>(
      'SELECT * FROM games WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  },

  /**
   * 根据 ID 查找运动局（带行锁，用于事务内并发控制）
   * 必须在事务中使用，否则锁立即释放
   */
  async findByIdForUpdate(id: number): Promise<GameRow | null> {
    const { rows } = await pool.query<GameRow>(
      'SELECT * FROM games WHERE id = $1 FOR UPDATE',
      [id]
    );
    return rows[0] || null;
  },

  /**
   * 创建运动局，返回完整记录
   */
  async create(data: CreateGameData): Promise<GameRow> {
    const { rows } = await pool.query<GameRow>(
      `INSERT INTO games (host_id, sport_type, title, location, max_players, start_time, tag)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [data.host_id, data.sport_type, data.title, data.location, data.max_players, data.start_time, data.tag ?? null]
    );
    return rows[0];
  },

  /**
   * 分页查询运动局列表（大厅）
   * 默认只返回 recruiting 和 full 状态的局，按 start_time 升序
   */
  async list(filter: ListGamesFilter): Promise<PaginatedResult<GameRow>> {
    const { sport_type, status, page, page_size, sort_by = 'start_time' } = filter;
    const offset = (page - 1) * page_size;

    // 动态构建 WHERE 条件
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // 默认仅展示 recruiting 和 full
    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    } else {
      conditions.push(`status = $${paramIndex++}`);
      params.push('recruiting');
      conditions.push(`status = $${paramIndex++}`);
      params.push('full');
      // 使用 IN 替代 OR
      conditions.length = 0; // 重置
      conditions.push(`status IN ($${paramIndex++}, $${paramIndex++})`);
      params.push('recruiting', 'full');
    }

    if (sport_type) {
      conditions.push(`sport_type = $${paramIndex++}`);
      params.push(sport_type);
    }

    // 排序：满员局排在后面
    const orderClause = sort_by === 'created_at'
      ? `CASE WHEN status = 'full' THEN 1 ELSE 0 END, created_at ASC`
      : `CASE WHEN status = 'full' THEN 1 ELSE 0 END, start_time ASC`;

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询总数
    const countResult = await pool.query<{ total: string }>(
      `SELECT COUNT(*) as total FROM games ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // 查询分页数据
    const { rows } = await pool.query<GameRow>(
      `SELECT * FROM games ${whereClause}
       ORDER BY ${orderClause}
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, page_size, offset]
    );

    return {
      items: rows,
      total,
      page,
      page_size,
      total_pages: Math.ceil(total / page_size),
    };
  },

  /**
   * 更新运动局状态（用于状态机流转）
   * extra 可选：同时更新其他字段（如 completed_at, member_count）
   */
  async updateStatus(
    id: number,
    status: GameStatus,
    extra?: Partial<Pick<GameRow, 'completed_at' | 'end_time' | 'member_count'>>
  ): Promise<GameRow | null> {
    const setClauses: string[] = [`status = '${status}'`]; // 枚举值安全注入（来自代码常量）
    const params: any[] = [];
    let paramIndex = 1;

    // 动态附加字段更新
    if (extra?.completed_at !== undefined) {
      setClauses.push(`completed_at = $${paramIndex++}`);
      params.push(extra.completed_at);
    }
    if (extra?.end_time !== undefined) {
      setClauses.push(`end_time = $${paramIndex++}`);
      params.push(extra.end_time);
    }
    if (extra?.member_count !== undefined) {
      setClauses.push(`member_count = $${paramIndex++}`);
      params.push(extra.member_count);
    }

    params.push(id);

    const { rows } = await pool.query<GameRow>(
      `UPDATE games SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );
    return rows[0] || null;
  },

  /**
   * 批量更新状态（用于定时任务）
   * 根据条件批量修改，返回受影响行数
   */
  async batchUpdateStatus(
    fromStatuses: GameStatus[],
    toStatus: GameStatus,
    timeCondition: string,
    timeValue: Date
  ): Promise<GameRow[]> {
    const placeholders = fromStatuses.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await pool.query<GameRow>(
      `UPDATE games SET status = $${fromStatuses.length + 1}, updated_at = NOW()
       WHERE status IN (${placeholders})
         AND start_time <= $${fromStatuses.length + 2}
       RETURNING *`,
      [...fromStatuses, toStatus, timeValue]
    );
    return rows;
  },
};
