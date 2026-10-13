import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { authRequired } from '../middleware/auth';
import { pool } from '../db/pool';

const router = Router();

const submitSchema = z.object({
  content: z.string().min(1).max(1000),
  contact: z.string().max(200).optional(),
});

// POST / 提交反馈
router.post('/', authRequired, validate(submitSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { content, contact } = req.body;
    await pool.query(
      'INSERT INTO feedback (user_id, content, contact) VALUES ($1, $2, $3)',
      [req.user!.id, content.trim(), (contact || '').trim() || null]
    );
    res.json({ code: 0, message: '感谢反馈！我们会尽快处理。', data: null });
  } catch (err) { next(err); }
});

export default router;
