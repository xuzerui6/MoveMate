/**
 * 认证 API: 登录 / 注册 / 校园认证
 */
import client from './client';
import type { AuthResponse, BootstrapData, LoginData, RegisterData, PublicUserInfo } from '../types';

type RawUser = {
  id: string | number;
  nickname: string;
  email?: string;
  qq_email?: string;
  avatar?: string;
  avatar_url?: string;
  department?: string;
  campus_verified?: boolean;
  email_verified?: boolean;
  is_admin?: boolean | number;
  campus?: string;
  school_id?: number;
  campus_id?: number;
  school_name?: string;
  campus_name?: string;
  reward_points?: number;
  reward_level?: number;
  reward_streak?: number;
  completed_games?: number;
  hosted_completed_games?: number;
  reward_badges?: string[];
  sport_preferences?: string[];
  created_at?: string;
};

type RawAuthResponse = {
  token: string;
  user: RawUser;
};

export function normalizeUser(user: RawUser) {
  return {
    id: String(user.id),
    nickname: user.nickname,
    avatar: user.avatar ?? user.avatar_url ?? '',
    email: user.email ?? '',
    qq_email: user.qq_email ?? '',
    department: user.department ?? '',
    campus_verified: user.campus_verified ?? user.email_verified ?? false,
    is_admin: user.is_admin === true || user.is_admin === 1,
    campus: user.campus ?? user.campus_name ?? '',
    school_id: user.school_id,
    campus_id: user.campus_id,
    school_name: user.school_name ?? '吉林大学',
    campus_name: user.campus_name ?? user.campus ?? '',
    reward_points: user.reward_points ?? 0,
    reward_level: user.reward_level ?? 1,
    reward_streak: user.reward_streak ?? 0,
    completed_games: user.completed_games ?? 0,
    hosted_completed_games: user.hosted_completed_games ?? 0,
    reward_badges: Array.isArray(user.reward_badges) ? user.reward_badges : [],
    sport_preferences: Array.isArray(user.sport_preferences) ? user.sport_preferences : [],
    created_at: user.created_at ?? new Date().toISOString(),
  };
}

function unwrap<T>(response: T | { data: T }): T {
  return (response as { data?: T }).data ?? (response as T);
}

function extractUser(payload: RawUser | { user?: RawUser }): RawUser {
  return 'user' in payload && payload.user ? payload.user : (payload as RawUser);
}

/** 邮箱注册 */
export async function register(data: RegisterData): Promise<AuthResponse> {
  const response = await client.post('/auth/register', data);
  const raw = unwrap<RawAuthResponse>(response);
  return {
    token: raw.token,
    user: normalizeUser(raw.user),
  };
}

/** 邮箱登录 */
export async function login(data: LoginData): Promise<AuthResponse> {
  const response = await client.post('/auth/login', data);
  const raw = unwrap<RawAuthResponse>(response);
  return {
    token: raw.token,
    user: normalizeUser(raw.user),
  };
}

/** 获取当前用户信息 */
export async function getMe(): Promise<AuthResponse['user']> {
  const response = await client.get('/users/me');
  const raw = unwrap<RawUser>(response);
  return normalizeUser(raw);
}

/** 更新用户资料 */
export async function updateProfile(data: {
  nickname?: string;
  avatar?: string;
  department?: string;
  campus_id?: number;
  qq_email?: string;
  sport_preferences?: string[];
}): Promise<AuthResponse['user']> {
  const response = await client.put('/users/me', {
    nickname: data.nickname,
    avatar_url: data.avatar,
    department: data.department,
    campus_id: data.campus_id,
    qq_email: data.qq_email,
    sport_preferences: data.sport_preferences ? JSON.stringify(data.sport_preferences) : undefined,
  });
  const raw = unwrap<{ user?: RawUser } | RawUser>(response);
  return normalizeUser(extractUser(raw));
}

/** 获取公开用户信息（仅院系+运动偏好） */
export async function getPublicUser(userId: string): Promise<PublicUserInfo> {
  const response = await client.get(`/users/public/${userId}`);
  return unwrap<PublicUserInfo>(response);
}

/** 校园认证 —— 发送验证码到校园邮箱 */
export async function sendVerifyCode(email: string): Promise<void> {
  return client.post('/verify/send', { email });
}

/** 校园认证 —— 校验验证码 */
export async function verifyStudentCode(code: string): Promise<AuthResponse> {
  const response = await client.post('/auth/verify-email', { code });
  const session = unwrap<RawAuthResponse>(response);
  return { token: session.token, user: normalizeUser(session.user) };
}

/** 吉林大学版初始化数据 */
export async function fetchBootstrap(): Promise<BootstrapData> {
  const response = await client.get('/auth/bootstrap');
  return unwrap<BootstrapData>(response);
}
