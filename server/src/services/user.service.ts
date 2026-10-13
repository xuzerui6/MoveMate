import { UserModel, UpdateUserData } from '../models/user.model';
import { NotFoundError } from '../utils/errors';
import { validateNickname } from '../utils/validator';

/** 用户安全资料（不含敏感字段） */
export interface UserProfile {
  id: number;
  nickname: string;
  email: string;
  qq_email: string;
  avatar_url: string;
  department: string;
  email_verified: boolean;
  is_admin: boolean;
  school_id: number;
  campus_id: number;
  reward_points: number;
  reward_level: number;
  reward_streak: number;
  completed_games: number;
  hosted_completed_games: number;
  reward_badges: string[];
  sport_preferences: string[];
  school_name?: string;
  campus_name?: string;
  created_at: Date;
}

/** 用户公开资料（对外展示用） */
export interface PublicProfile {
  id: number;
  nickname: string;
  avatar_url: string;
  department: string;
}

/** 更新资料请求参数 */
export interface UpdateProfileInput {
  nickname?: string;
  avatar_url?: string;
  department?: string;
  campus_id?: number;
  sport_preferences?: string;
  qq_email?: string;
}

/**
 * 从 UserRow 提取安全资料（去除 password_hash 和 student_id）
 */
function toProfile(row: {
  id: number;
  nickname: string;
  email: string;
  qq_email?: string;
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
  sport_preferences?: string;
  school_name?: string;
  campus_name?: string;
  created_at: Date;
}): UserProfile {
  return {
    id: row.id,
    nickname: row.nickname,
    email: row.email,
    qq_email: row.qq_email || '',
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

/**
 * 用户服务
 * 处理用户资料的读取和更新
 */
export const UserService = {

  /**
   * 获取当前用户完整资料（含 email_verified 状态）
   */
  async getProfile(userId: number): Promise<UserProfile> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new NotFoundError('用户不存在');
    }
    return toProfile(user);
  },

  /**
   * 更新当前用户资料
   * 仅允许修改 nickname, avatar_url, department
   */
  async updateProfile(userId: number, input: UpdateProfileInput): Promise<UserProfile> {
    // 校验昵称（如果提供了）
    if (input.nickname !== undefined) {
      validateNickname(input.nickname);
    }

    // 校验 QQ 邮箱格式（如果提供了）
    if (input.qq_email !== undefined) {
      const trimmed = input.qq_email.trim();
      // 允许清空 QQ 邮箱
      if (trimmed === '') {
        input.qq_email = '';
      } else {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
          throw new Error('QQ邮箱格式不正确');
        }
        input.qq_email = trimmed;
      }
    }

    // 校验院系长度（如果提供了）
    if (input.department !== undefined && input.department.length > 100) {
      input.department = input.department.slice(0, 100);
    }

    const updateData: UpdateUserData = {};
    if (input.nickname !== undefined) updateData.nickname = input.nickname.trim();
    if (input.avatar_url !== undefined) updateData.avatar_url = input.avatar_url;
    if (input.department !== undefined) updateData.department = input.department.trim();
    if (input.campus_id !== undefined) updateData.campus_id = input.campus_id;
    if (input.sport_preferences !== undefined) updateData.sport_preferences = input.sport_preferences;
    if (input.qq_email !== undefined) updateData.qq_email = input.qq_email;

    const updated = await UserModel.update(userId, updateData);
    if (!updated) {
      throw new NotFoundError('用户不存在');
    }

    return toProfile(updated);
  },

  /**
   * 获取用户公开资料（仅 id, nickname, avatar_url, department）
   * 用于展示发起人/成员信息，不含敏感字段
   */
  async getPublicProfile(userId: number): Promise<PublicProfile> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new NotFoundError('用户不存在');
    }
    return {
      id: user.id,
      nickname: user.nickname,
      avatar_url: user.avatar_url,
      department: user.department,
    };
  },
};
