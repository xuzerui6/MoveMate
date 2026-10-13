import jwt, { SignOptions } from 'jsonwebtoken';
import { config } from '../config';

/** JWT Token 负载结构 */
export interface JwtPayload {
  sub: number;        // user.id
  email: string;
  email_verified: boolean;
  iat?: number;
  exp?: number;
}

/**
 * 签发 JWT Token
 * @param payload - 不含 iat/exp 的负载数据
 * @returns token 字符串
 */
export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  const options: SignOptions = {
    expiresIn: config.jwt.expiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign(payload as object, config.jwt.secret, options);
}

/**
 * 校验 JWT Token
 * @param token - Bearer token 字符串
 * @returns 解码后的负载，校验失败抛出 jwt 异常
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.secret) as unknown as JwtPayload;
}