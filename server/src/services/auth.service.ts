import bcrypt from 'bcrypt';
import { UserModel, CreateUserData } from '../models/user.model';
import { signToken } from '../utils/jwt';
import { pool } from '../db/pool';
import {
  validateNickname,
  validateEmail,
  validatePassword,
} from '../utils/validator';
import { hashStudentId } from '../utils/hash';
import { ValidationError, NotFoundError, AppError } from '../utils/errors';
import { isAllowedEmail, verifyCode } from './verify-code.service';
import { withTransaction } from '../db';

/** 注册请求参数 */
export interface RegisterInput {
  verify_code: string;
  nickname: string;
  email: string;
  password: string;
  student_id: string;
  campus_id: number;
  department?: string;
  qq_email?: string;
}

/** 登录请求参数 */
export interface LoginInput {
  email: string;
  password: string;
}

/** 认证返回结构：用户安全资料 + JWT token */
export interface AuthResult {
  user: {
    id: number;
    nickname: string;
    email: string;
    avatar_url: string;
    department: string;
    email_verified: boolean;
    school_id: number;
    campus_id: number;
    reward_points: number;
    reward_level: number;
    reward_streak: number;
    completed_games: number;
    hosted_completed_games: number;
    reward_badges: string[];
    school_name?: string;
    campus_name?: string;
    created_at: Date;
  };
  token: string;
}

/** bcrypt 哈希轮数 */
const SALT_ROUNDS = 10;


/**
 * 从 UserRow 提取对外安全的用户资料（不含 password_hash 和 student_id）
 */
function toSafeUser(row: {
  id: number;
  nickname: string;
  email: string;
  avatar_url: string;
  department: string;
  email_verified: boolean;
  is_admin: number;
  school_id: number;
  campus_id: number;
  reward_points: number;
  reward_level: number;
  reward_streak: number;
  completed_games: number;
  hosted_completed_games: number;
  reward_badges: string;
  school_name?: string;
  campus_name?: string;
  sport_preferences?: string;
  created_at: Date;
}) {
  return {
    id: row.id,
    nickname: row.nickname,
    email: row.email,
    avatar_url: row.avatar_url,
    department: row.department,
    email_verified: row.email_verified,
    is_admin: !!row.is_admin,
    school_id: row.school_id,
    campus_id: row.campus_id,
    reward_points: Number(row.reward_points ?? 0),
    reward_level: Number(row.reward_level ?? 1),
    reward_streak: Number(row.reward_streak ?? 0),
    completed_games: Number(row.completed_games ?? 0),
    hosted_completed_games: Number(row.hosted_completed_games ?? 0),
    reward_badges: (() => {
      try {
        return JSON.parse(row.reward_badges || '[]');
      } catch {
        return [];
      }
    })(),
    sport_preferences: (() => {
      try {
        return JSON.parse(row.sport_preferences || '[]');
      } catch {
        return [];
      }
    })(),
    school_name: row.school_name,
    campus_name: row.campus_name,
    created_at: row.created_at,
  };
}

async function resolveSchoolByCampus(campusId: number): Promise<number> {
  const { rows } = await pool.query<{ school_id: number }>(
    'SELECT school_id FROM campuses WHERE id = $1 AND is_active = 1',
    [campusId]
  );
  if (!rows[0]) {
    throw new ValidationError('所选校区不存在');
  }
  return Number(rows[0].school_id);
}

/**
 * 认证服务
 * 处理注册、登录、邮箱验证、Token 刷新
 */
export const AuthService = {

  /**
   * 用户注册
   * 1. 校验输入字段
   * 2. 检查邮箱唯一性
   * 3. bcrypt 哈希密码 + SHA256 脱敏学号
   * 4. 写入数据库
   * 5. 签发 JWT 并返回
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    // 输入校验
    validateNickname(input.nickname);
    validateEmail(input.email);
    validatePassword(input.password);

    // 强制校园邮箱：注册邮箱必须与验证码发送规则一致（@mails.jlu.edu.cn / @jlu.edu.cn）
    if (!isAllowedEmail(input.email)) {
      throw new ValidationError('仅支持校园邮箱注册（@mails.jlu.edu.cn 或 @jlu.edu.cn）');
    }

    const studentId = input.student_id?.trim() || '';
    const campusId = Number(input.campus_id);
    if (!Number.isInteger(campusId) || campusId <= 0) {
      throw new ValidationError('请选择所属校区');
    }

    // 邮箱唯一性检查
    const email = input.email.trim().toLowerCase();
    const existing = await UserModel.findByEmail(email);
    if (existing) {
      throw new AppError(40001, '该邮箱已被注册', 409);
    }

    // 密码哈希 + 学号脱敏
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const studentIdHashed = hashStudentId(studentId);
    const schoolId = await resolveSchoolByCampus(campusId);

    // 创建用户
    const createData: CreateUserData = {
      nickname: input.nickname.trim(),
      email,
      password_hash: passwordHash,
      student_id: studentIdHashed,
      school_id: schoolId,
      campus_id: campusId,
      department: input.department?.trim(),
      qq_email: input.qq_email?.trim() || '',
    };
    // Consume the code in its own transaction so failed attempts survive registration rollback.
    if (!await verifyCode(email, input.verify_code)) throw new ValidationError('验证码错误或已过期');
    const user = await withTransaction(async () => {
      if (await UserModel.findByEmail(email)) throw new AppError(40001, '该邮箱已被注册', 409);
      const created = await UserModel.create(createData);
      await UserModel.updateEmailVerified(created.id, true);
      return (await UserModel.findById(created.id))!;
    });

    // 签发 JWT
    const token = signToken({
      sub: user.id,
      email: user.email,
      email_verified: user.email_verified,
    });

    return {
      user: toSafeUser(user),
      token,
    };
  },

  /**
   * 用户登录
   * 1. 查找用户
   * 2. 校验密码
   * 3. 签发 JWT 并返回
   */
  async login(input: LoginInput): Promise<AuthResult> {

    validateEmail(input.email);
    validatePassword(input.password);

    const user = await UserModel.findByEmail(input.email.trim().toLowerCase());
    if (!user) {
      throw new NotFoundError('邮箱或密码错误');
    }

    // bcrypt 密码比对
    const valid = await bcrypt.compare(input.password, user.password_hash);
    if (!valid) {
      throw new NotFoundError('邮箱或密码错误');
    }

    // 签发 JWT
    const token = signToken({
      sub: user.id,
      email: user.email,
      email_verified: user.email_verified,
    });

    return {
      user: toSafeUser(user),
      token,
    };
  },

  /**
   * 验证校园邮箱
   * 校验验证码后更新 email_verified 状态
   * (MVP 阶段验证码比对逻辑由上层路由处理)
   */
  async verifyEmail(userId: number): Promise<AuthResult> {
    await UserModel.updateEmailVerified(userId, true);
    const user = await UserModel.findById(userId);
    if (!user) throw new NotFoundError('用户不存在');
    return { user: toSafeUser(user), token: signToken({ sub: user.id, email: user.email, email_verified: true }) };
  },

  /**
   * 刷新 JWT Token
   * 重新签发一个新的 7 天有效期 token
   */
  async refreshToken(userId: number): Promise<string> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new NotFoundError('用户不存在');
    }

    return signToken({
      sub: user.id,
      email: user.email,
      email_verified: user.email_verified,
    });
  },
};
