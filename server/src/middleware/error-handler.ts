import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { ZodError } from 'zod';


export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {

  console.error(`[Error] ${err.name}: ${err.message}`);
  if (err.stack) console.error(err.stack);

  // Zod 校验错误 → 400
  if (err instanceof ZodError) {
    res.status(400).json({
      code: 40000,
      message: err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; '),
      data: null,
    });
    return;
  }

  // AppError 子类：使用预设的错误码和状态码
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({
      code: err.code,
      message: err.message,
      data: null,
    });
    return;
  }

  // CORS 拒绝 → 403
  if (err.message && err.message.includes('CORS')) {
    res.status(403).json({
      code: 40302,
      message: '该来源不允许访问',
      data: null,
    });
    return;
  }

  // 未知错误：开发环境返回详细信息方便调试，生产环境只返回通用提示（防泄露内部结构）
  const isDev = (process.env.NODE_ENV || 'development') === 'development';
  res.status(500).json({
    code: 50000,
    message: isDev ? (err.message || '服务器内部错误') : '服务器内部错误，请稍后重试',
    data: null,
  });
}
