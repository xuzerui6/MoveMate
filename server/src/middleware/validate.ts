import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * 请求参数校验中间件工厂函数
 *
 * 使用 zod schema 校验请求体、查询参数或路径参数。
 * 校验失败返回 400 + 具体错误信息。
 *
 * @param schema - zod 校验 schema
 * @param source - 校验的数据来源，默认 'body'
 *
 * 使用示例:
 *   router.post('/games', validate(createGameSchema), handler);
 *   router.get('/games', validate(listGamesSchema, 'query'), handler);
 */
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = req[source];
      const parsed = schema.parse(data);
      // 将校验后的数据回写到 req，确保类型安全
      (req as any)[source] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const messages = err.errors.map((e) => {
          const path = e.path.join('.');
          return path ? `${path}: ${e.message}` : e.message;
        });
        res.status(400).json({
          code: 40000,
          message: `参数校验失败: ${messages.join('; ')}`,
          data: null,
        });
        return;
      }
      next(err);
    }
  };
}
