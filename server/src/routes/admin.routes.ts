import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth';
import { adminRequired } from '../middleware/admin';
import { validate } from '../middleware/validate';
import { pool } from '../db/pool';

// 管理后台 Zod 校验 schema
const updateUserAdminSchema = z.object({
  is_admin: z.boolean({ message: 'is_admin 必须是布尔值' }),
});

const createVenueSchema = z.object({
  school_id: z.number().int().positive('school_id 必须是正整数'),
  campus_id: z.number().int().positive('campus_id 必须是正整数'),
  name: z.string().min(1, '场地名必填').max(50, '场地名过长'),
  sport_types: z.array(z.string()).default([]),
  is_active: z.boolean().optional(),
});

const updateVenueSchema = z.object({
  name: z.string().min(1, '场地名必填').max(50, '场地名过长').optional(),
  sport_types: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

const router = Router();

// 所有 admin 路由都需要管理员权限
router.use(authRequired, adminRequired);

// ---------- 概览统计 ----------
router.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows: userCount } = await pool.query('SELECT COUNT(*) as n FROM users');
    const { rows: gameCount } = await pool.query('SELECT COUNT(*) as n FROM games');
    const { rows: todayUsers } = await pool.query(
      "SELECT COUNT(*) as n FROM users WHERE date(created_at) = date('now')"
    );
    const { rows: todayGames } = await pool.query(
      "SELECT COUNT(*) as n FROM games WHERE date(created_at) = date('now')"
    );
    const { rows: activeUsers } = await pool.query(
      "SELECT COUNT(DISTINCT user_id) as n FROM game_members WHERE date(joined_at) >= date('now','-7 days') AND left_at IS NULL"
    );
    const { rows: feedbackCount } = await pool.query('SELECT COUNT(*) as n FROM feedback');
    res.json({
      code: 0, message: 'success',
      data: {
        total_users: Number((userCount[0] as any).n),
        total_games: Number((gameCount[0] as any).n),
        today_users: Number((todayUsers[0] as any).n),
        today_games: Number((todayGames[0] as any).n),
        active_users_7d: Number((activeUsers[0] as any).n),
        pending_feedback: Number((feedbackCount[0] as any).n),
      }
    });
  } catch (err) { next(err); }
});

// ---------- 用户管理 ----------
router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string || '').trim();
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = 20;
    const offset = (page - 1) * pageSize;

    let whereClause = '';
    const params: any[] = [];
    if (search) {
      whereClause = 'WHERE u.nickname LIKE $1 OR u.email LIKE $1';
      params.push(`%${search}%`);
    }

    const pIdx = params.length + 1;
    const { rows } = await pool.query(
      `SELECT u.id, u.nickname, u.email, u.avatar_url, u.department, u.is_admin,
              u.reward_points, u.reward_level, u.created_at,
              c.name AS campus_name
       FROM users u LEFT JOIN campuses c ON c.id = u.campus_id
       ${whereClause}
       ORDER BY u.id DESC LIMIT $${pIdx} OFFSET $${pIdx + 1}`,
      [...params, pageSize, offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) as n FROM users u ${whereClause}`, params
    );

    res.json({
      code: 0, message: 'success',
      data: {
        list: rows,
        total: Number((countRows[0] as any).n),
        page,
        page_size: pageSize,
      }
    });
  } catch (err) { next(err); }
});

// GET /users/:id — 用户详情（管理后台点头像查看）
router.get('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) { res.status(400).json({ code: 40000, message: '无效用户ID', data: null }); return; }
    const { rows } = await pool.query(
      `SELECT u.id, u.nickname, u.email, u.qq_email, u.avatar_url, u.department,
              u.student_id, u.email_verified, u.is_admin,
              u.reward_points, u.reward_level, u.reward_streak,
              u.completed_games, u.hosted_completed_games, u.reward_badges,
              u.sport_preferences, u.created_at,
              s.name AS school_name, c.name AS campus_name
       FROM users u
       LEFT JOIN schools s ON s.id = u.school_id
       LEFT JOIN campuses c ON c.id = u.campus_id
       WHERE u.id = $1`,
      [userId]
    );
    if (!rows[0]) { res.status(404).json({ code: 40400, message: '用户不存在', data: null }); return; }
    res.json({ code: 0, message: 'success', data: rows[0] });
  } catch (err) { next(err); }
});

// DELETE /users/:id — 删除用户
router.delete('/users/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) { res.status(400).json({ code: 40000, message: '无效用户ID', data: null }); return; }
    // 不能删除自己
    if (userId === req.user!.id) {
      res.status(400).json({ code: 40000, message: '不能删除自己', data: null }); return;
    }
    // 不能删除最后一个管理员
    const { rows: targetUser } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
    if (targetUser[0] && (targetUser[0] as any).is_admin) {
      const { rows: cnt } = await pool.query('SELECT COUNT(*) as n FROM users WHERE is_admin = 1');
      if (Number((cnt[0] as any).n) <= 1) {
        res.status(400).json({ code: 40000, message: '不能删除最后一个管理员，请先设置其他用户为管理员', data: null }); return;
      }
    }

    // 删除该用户发起的局（级联清理局成员+聊天消息）
    const { rows: hostedGames } = await pool.query('SELECT id FROM games WHERE host_id = $1', [userId]);
    for (const g of hostedGames as any[]) {
      await pool.query('DELETE FROM game_members WHERE game_id = $1', [g.id]);
      await pool.query('DELETE FROM chat_messages WHERE game_id = $1', [g.id]);
      // 通知表有 game_id 外键，必须一并清，否则外键约束失败
      await pool.query('DELETE FROM notifications WHERE game_id = $1', [g.id]);
      await pool.query('DELETE FROM games WHERE id = $1', [g.id]);
    }

    // 删除用户在其他局的参与记录
    await pool.query('DELETE FROM game_members WHERE user_id = $1', [userId]);
    // 删除用户的聊天消息
    await pool.query('DELETE FROM chat_messages WHERE sender_id = $1', [userId]);
    // 删除用户的通知
    await pool.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
    // 删除用户的反馈（表可能不存在于老数据库，容错）
    try { await pool.query('DELETE FROM feedback WHERE user_id = $1', [userId]); } catch {}
    // 删除用户
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({ code: 0, message: '用户已删除', data: null });
  } catch (err) { next(err); }
});

// PUT /users/:id — 设置/取消管理员、禁用等
router.put('/users/:id', validate(updateUserAdminSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) { res.status(400).json({ code: 40000, message: '无效用户ID', data: null }); return; }
    const { is_admin } = req.body as { is_admin: boolean };
    if (is_admin === undefined) { res.status(400).json({ code: 40000, message: '缺少 is_admin 参数', data: null }); return; }
    // 不能取消自己的管理员身份
    if (!is_admin && userId === req.user!.id) {
      res.status(400).json({ code: 40000, message: '不能取消自己的管理员身份', data: null }); return;
    }
    // 不能取消最后一个管理员
    if (!is_admin) {
      const { rows: targetRow } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
      if (targetRow[0] && (targetRow[0] as any).is_admin) {
        const { rows: cnt } = await pool.query('SELECT COUNT(*) as n FROM users WHERE is_admin = 1');
        if (Number((cnt[0] as any).n) <= 1) {
          res.status(400).json({ code: 40000, message: '不能取消最后一个管理员，请先设置其他用户为管理员', data: null }); return;
        }
      }
    }
    await pool.query('UPDATE users SET is_admin = $1 WHERE id = $2', [is_admin ? 1 : 0, userId]);
    res.json({ code: 0, message: '更新成功', data: null });
  } catch (err) { next(err); }
});

// ---------- 局管理 ----------
router.get('/games', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = 20;
    const offset = (page - 1) * pageSize;
    const status = req.query.status as string | undefined;

    let where = '';
    const params: any[] = [];
    if (status && status !== 'all') {
      where = 'WHERE g.status = $1';
      params.push(status);
    }
    const pIdx = params.length + 1;

    const { rows } = await pool.query(
      `SELECT g.*, u.nickname AS creator_name, c.name AS campus_name, v.name AS venue_name
       FROM games g
       LEFT JOIN users u ON u.id = g.host_id
       LEFT JOIN campuses c ON c.id = g.campus_id
       LEFT JOIN venues v ON v.id = g.venue_id
       ${where}
       ORDER BY g.id DESC LIMIT $${pIdx} OFFSET $${pIdx + 1}`,
      [...params, pageSize, offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) as n FROM games g ${where}`, params
    );

    res.json({
      code: 0, message: 'success',
      data: {
        list: rows,
        total: Number((countRows[0] as any).n),
        page,
        page_size: pageSize,
      }
    });
  } catch (err) { next(err); }
});

// DELETE /games/:id
router.delete('/games/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ code: 40000, message: '无效的局ID', data: null }); return; }
    await pool.query('DELETE FROM game_members WHERE game_id = $1', [id]);
    await pool.query('DELETE FROM chat_messages WHERE game_id = $1', [id]);
    // 通知表有 game_id 外键，必须一并清，否则外键约束失败
    await pool.query('DELETE FROM notifications WHERE game_id = $1', [id]);
    await pool.query('DELETE FROM games WHERE id = $1', [id]);
    res.json({ code: 0, message: '已删除', data: null });
  } catch (err) { next(err); }
});

// ---------- 场地管理 ----------
router.get('/venues', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.*, s.name AS school_name, c.name AS campus_name
       FROM venues v
       LEFT JOIN schools s ON s.id = v.school_id
       LEFT JOIN campuses c ON c.id = v.campus_id
       ORDER BY v.school_id, v.campus_id, v.name`
    );
    res.json({ code: 0, message: 'success', data: rows });
  } catch (err) { next(err); }
});

router.post('/venues', validate(createVenueSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { school_id, campus_id, name, sport_types, is_active } = req.body as { school_id: number; campus_id: number; name: string; sport_types: string[]; is_active?: boolean };
    if (!name || !school_id || !campus_id) { res.status(400).json({ code: 40000, message: '缺少必要字段', data: null }); return; }
    const { rows } = await pool.query(
      `INSERT INTO venues (school_id, campus_id, name, sport_types, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [school_id, campus_id, name, JSON.stringify(sport_types || []), is_active !== false ? 1 : 0]
    );
    res.json({ code: 0, message: '添加成功', data: rows[0] });
  } catch (err) { next(err); }
});

router.put('/venues/:id', validate(updateVenueSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ code: 40000, message: '无效场地ID', data: null }); return; }
    const { name, sport_types, is_active } = req.body as { name?: string; sport_types?: string[]; is_active?: boolean };
    await pool.query(
      `UPDATE venues SET name = COALESCE($1, name), sport_types = COALESCE($2, sport_types), is_active = COALESCE($3, is_active) WHERE id = $4`,
      [name || null, sport_types ? JSON.stringify(sport_types) : null, is_active !== undefined ? (is_active ? 1 : 0) : null, id]
    );
    res.json({ code: 0, message: '更新成功', data: null });
  } catch (err) { next(err); }
});

router.delete('/venues/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ code: 40000, message: '无效场地ID', data: null }); return; }
    await pool.query('DELETE FROM venues WHERE id = $1', [id]);
    res.json({ code: 0, message: '已删除', data: null });
  } catch (err) { next(err); }
});

// ---------- 反馈管理 ----------
router.get('/feedback', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, u.nickname, u.email
       FROM feedback f LEFT JOIN users u ON u.id = f.user_id
       ORDER BY f.created_at DESC LIMIT 100`
    );
    res.json({ code: 0, message: 'success', data: rows });
  } catch (err) { next(err); }
});

// DELETE /feedback/:id — 删除反馈
router.delete('/feedback/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ code: 40000, message: '无效反馈ID', data: null }); return; }
    const { rows } = await pool.query('DELETE FROM feedback WHERE id = $1 RETURNING id', [id]);
    if (!rows[0]) { res.status(404).json({ code: 40400, message: '反馈不存在', data: null }); return; }
    res.json({ code: 0, message: '反馈已删除', data: null });
  } catch (err) { next(err); }
});

// ---------- 验证管理员身份 ----------
router.get('/me', async (req: Request, res: Response) => {
  res.json({ code: 0, message: 'success', data: { is_admin: true, user_id: req.user!.id, voice_pool_available: process.env.CLOUDFLARE === '1' } });
});

export default router;
