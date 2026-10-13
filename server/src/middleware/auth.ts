import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../utils/jwt';

// ----------------------------------------------------------------
// 扩展 Express Request 类型，注入 user 信息
// ----------------------------------------------------------------
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        email_verified: boolean;
      };
    }
  }
}

/**
 * JWT 认证中间件
 * 从 Authorization header 中提取 Bearer Token，验证后注入 req.user
 * 认证失败返回 401
 */
export function authRequired(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      code: 40101,
      message: '未提供认证令牌',
      data: null,
    });
    return;
  }

  const token = authHeader.slice(7); // 去掉 "Bearer " 前缀

  try {
    const payload: JwtPayload = verifyToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      email_verified: payload.email_verified,
    };
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({
        code: 40102,
        message: '认证令牌已过期，请重新登录',
        data: null,
      });
      return;
    }
    res.status(401).json({
      code: 40103,
      message: '认证令牌无效',
      data: null,
    });
  }
}

/**
 * 邮箱验证中间件
 * 必须在 authRequired 之后使用（依赖 req.user）
 * 邮箱未验证返回 403
 */
export function emailVerifiedRequired(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      code: 40101,
      message: '未提供认证令牌',
      data: null,
    });
    return;
  }

  if (!req.user.email_verified) {
    res.status(403).json({
      code: 20001,
      message: '邮箱未验证，无法执行此操作',
      data: null,
    });
    return;
  }

  next();
}
