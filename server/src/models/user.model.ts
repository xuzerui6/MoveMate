import { pool } from '../db/pool';

/** 用户表行数据接口 */
export interface UserRow {
  id: number;
  nickname: string;
  email: string;
  password_hash: string;
  avatar_url: string;
  department: string;
  student_id: string;
  email_verified: boolean;
  school_id: number;
  campus_id: number;
  reward_points: number;
  reward_level: number;
  reward_streak: number;
  completed_games: number;
  hosted_completed_games: number;
  reward_badges: string;
  last_rewarded_date?: string | null;
  qq_email: string;
  sport_preferences: string;
  is_admin: number;
  school_name?: string;
  campus_name?: string;
  created_at: Date;
  updated_at: Date;
}

/** 创建用户时需要的字段 */
export interface CreateUserData {
  nickname: string;
  email: string;
  password_hash: string;
  student_id: string;
  school_id: number;
  campus_id: number;
  department?: string;
  qq_email?: string;
}

/** 更新用户资料时允许修改的字段 */
export interface UpdateUserData {
  nickname?: string;
  avatar_url?: string;
  department?: string;
  campus_id?: number;
  sport_preferences?: string;
  qq_email?: string;
}

/**
 * 用户数据模型
 * 封装 users 表的所有 SQL 查询，使用参数化查询防注入
 */
export const UserModel = {

  /**
   * 根据 ID 查找用户
   */
  async findById(id: number): Promise<UserRow | null> {
    const { rows } = await pool.query<UserRow>(
      `SELECT u.*, s.name AS school_name, c.name AS campus_name
       FROM users u
       LEFT JOIN schools s ON s.id = u.school_id
       LEFT JOIN campuses c ON c.id = u.campus_id
       WHERE u.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  /**
   * 根据邮箱查找用户
   */
  async findByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await pool.query<UserRow>(
      `SELECT u.*, s.name AS school_name, c.name AS campus_name
       FROM users u
       LEFT JOIN schools s ON s.id = u.school_id
       LEFT JOIN campuses c ON c.id = u.campus_id
       WHERE u.email = $1`,
      [email]
    );
    return rows[0] || null;
  },

  /**
   * 根据学号查找用户
   */
  async findByStudentId(studentId: string): Promise<UserRow | null> {
    const { rows } = await pool.query<UserRow>(
      `SELECT u.*, s.name AS school_name, c.name AS campus_name
       FROM users u
       LEFT JOIN schools s ON s.id = u.school_id
       LEFT JOIN campuses c ON c.id = u.campus_id
       WHERE u.student_id = $1`,
      [studentId]
    );
    return rows[0] || null;
  },

  /**
   * 创建新用户，返回完整用户记录
   */
  async create(data: CreateUserData): Promise<UserRow> {
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (nickname, email, password_hash, student_id, school_id, campus_id, department, qq_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        data.nickname,
        data.email,
        data.password_hash,
        data.student_id,
        data.school_id,
        data.campus_id,
        data.department || '',
        data.qq_email || '',
      ]
    );
    return this.findById(rows[0].id) as Promise<UserRow>;
  },

  /**
   * 更新用户资料（部分字段可选）
   * 使用 COALESCE 实现可选更新：传 NULL 则保留原值
   */
  async update(id: number, data: UpdateUserData): Promise<UserRow | null> {
    const { rows } = await pool.query<UserRow>(
      `UPDATE users SET
         nickname = COALESCE($2, nickname),
         avatar_url = COALESCE($3, avatar_url),
         department = COALESCE($4, department),
         campus_id = COALESCE($5, campus_id),
         sport_preferences = COALESCE($6, sport_preferences),
         qq_email = COALESCE($7, qq_email)
       WHERE id = $1
       RETURNING *`,
      [id, data.nickname ?? null, data.avatar_url ?? null, data.department ?? null, data.campus_id ?? null, data.sport_preferences ?? null, data.qq_email ?? null]
    );
    if (!rows[0]) return null;
    return this.findById(rows[0].id);
  },

  /**
   * 更新邮箱验证状态
   */
  async updateEmailVerified(id: number, verified: boolean): Promise<void> {
    await pool.query(
      'UPDATE users SET email_verified = $2 WHERE id = $1',
      [id, verified]
    );
  },

  /**
   * 更新密码
   */
  async updatePassword(id: number, passwordHash: string): Promise<void> {
    await pool.query(
      'UPDATE users SET password_hash = $2 WHERE id = $1',
      [id, passwordHash]
    );
  },
};
