import crypto from 'crypto';
import { config } from '../config';

/**
 * 使用 SHA256 + 盐对学号进行脱敏哈希
 * 存储到数据库时使用此函数处理学号，前端和后端均不传输/展示明文学号
 * @param studentId - 明文学号
 * @returns 十六进制哈希字符串
 */
export function hashStudentId(studentId: string): string {
  return crypto
    .createHmac('sha256', config.studentIdSalt)
    .update(studentId)
    .digest('hex');
}

/**
 * 对比学号哈希是否匹配（用于后续可能的学号验证场景）
 * @param studentId - 明文学号
 * @param hash - 已存储的哈希值
 * @returns 是否匹配
 */
export function verifyStudentId(studentId: string, hash: string): boolean {
  const computed = hashStudentId(studentId);
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}
