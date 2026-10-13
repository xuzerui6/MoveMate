import { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool';

/**
 * 管理员权限中间件
 * 必须在 authRequired 之后使用
 */
export async function adminRequired(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ code: 40101, message: '未登录', data: null });
    return;
  }

  const { rows } = await pool.query(
    'SELECT is_admin FROM users WHERE id = $1 LIMIT 1',
    [req.user.id]
  );

  if (!rows[0] || !(rows[0] as any).is_admin) {
    res.status(403).json({ code: 40301, message: '无管理员权限', data: null });
    return;
  }

  next();
}
