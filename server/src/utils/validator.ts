/**
 * 输入校验工具函数
 * 提供常用的校验逻辑：昵称长度、邮箱格式、运动类型枚举等
 * 校验失败抛出 ValidationError
 */

import { ValidationError } from './errors';

/** 常见运动类型推荐值 */
export const SPORT_TYPES = [
  'basketball',
  'badminton',
  'running',
  'fitness',
  'soccer',
  'volleyball',
  'tennis',
  'table_tennis',
  'swimming',
  'roller_skating',
  'skateboarding',
] as const;
export type SportType = string;

/** 运动局状态枚举 */
export const GAME_STATUSES = [
  'recruiting', 'full', 'ready', 'in_progress',
  'completed', 'archived', 'cancelled',
] as const;
export type GameStatus = typeof GAME_STATUSES[number];

/** 局标签枚举 */
export const GAME_TAGS = ['casual', 'beginner_friendly', 'competitive', 'relaxed'] as const;
export type GameTag = typeof GAME_TAGS[number];

/** 通知类型枚举 */
export const NOTIFICATION_TYPES = [
  'member_joined', 'game_ready', 'new_message',
  'game_cancelled', 'member_left', 'game_full',
  'check_in_reminder', 'reward_granted', 'penalty_applied',
] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];

/**
 * 校验昵称长度：1-20 字符
 */
export function validateNickname(nickname: unknown): asserts nickname is string {
  if (typeof nickname !== 'string' || nickname.trim().length === 0) {
    throw new ValidationError('昵称不能为空');
  }
  if (nickname.length > 20) {
    throw new ValidationError('昵称不能超过20个字符');
  }
}

/**
 * 校验邮箱格式（校园邮箱）
 */
export function validateEmail(email: unknown): asserts email is string {
  if (typeof email !== 'string') {
    throw new ValidationError('邮箱格式不正确');
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('邮箱格式不正确');
  }
  if (email.length > 255) {
    throw new ValidationError('邮箱地址过长');
  }
}

/**
 * 校验密码强度：6-32 字符
 */
export function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== 'string') {
    throw new ValidationError('密码不能为空');
  }
  if (password.length < 6) {
    throw new ValidationError('密码不能少于6个字符');
  }
  if (password.length > 32) {
    throw new ValidationError('密码不能超过32个字符');
  }
}

/**
 * 校验运动类型是否为合法字符串
 */
export function validateSportType(value: unknown): asserts value is SportType {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError('运动类型不能为空');
  }
  if (value.trim().length > 30) {
    throw new ValidationError('运动类型不能超过30个字符');
  }
}

/**
 * 校验局状态是否为合法枚举值
 */
export function validateGameStatus(value: unknown): asserts value is GameStatus {
  if (typeof value !== 'string' || !GAME_STATUSES.includes(value as GameStatus)) {
    throw new ValidationError(`不支持的状态: ${value}`);
  }
}

/**
 * 校验局标签是否为合法枚举值，允许 null/undefined
 */
export function validateGameTag(value: unknown): asserts value is GameTag | null | undefined {
  if (value === null || value === undefined) return;
  if (typeof value !== 'string' || !GAME_TAGS.includes(value as GameTag)) {
    throw new ValidationError(`不支持的标签: ${value}`);
  }
}

/**
 * 校验字符串长度范围
 */
export function validateStringLength(value: unknown, min: number, max: number, fieldName: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} 必须是字符串`);
  }
  if (value.length < min) {
    throw new ValidationError(`${fieldName} 不能少于${min}个字符`);
  }
  if (value.length > max) {
    throw new ValidationError(`${fieldName} 不能超过${max}个字符`);
  }
}

/**
 * 校验页码参数
 */
export function validatePagination(page: unknown, pageSize: unknown): { page: number; pageSize: number } {
  const p = Number(page) || 1;
  const ps = Number(pageSize) || 20;
  if (p < 1) throw new ValidationError('页码不能小于1');
  if (ps < 1 || ps > 100) throw new ValidationError('每页条数范围为 1-100');
  return { page: p, pageSize: ps };
}
