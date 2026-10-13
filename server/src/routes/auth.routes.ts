import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { AuthService } from '../services/auth.service';
import { validate } from '../middleware/validate';
import { authRequired } from '../middleware/auth';
import { pool } from '../db/pool';
import { verifyCode } from '../services/verify-code.service';
import { ValidationError } from '../utils/errors';

// 登录/注册/验证码防暴力破解：每 IP 每分钟最多 10 次
const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 42900, message: '操作太频繁，请一分钟后再试', data: null },
});

const router = Router();

// ----------------------------------------------------------------
// Zod 校验 Schema
// ----------------------------------------------------------------

/** 注册请求体校验 */
const registerSchema = z.object({
  verify_code: z.string().regex(/^\d{6}$/, '验证码必须为6位数字'),
  nickname: z.string().min(1, '昵称不能为空').max(20, '昵称不能超过20个字符'),
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码不能少于6个字符').max(32, '密码不能超过32个字符'),
  student_id: z.string().optional(),
  campus_id: z.coerce.number().int().positive('请选择所属校区'),
  department: z.string().max(100, '院系名称过长').optional(),
  qq_email: z.string().email('QQ邮箱格式不正确').optional().or(z.literal('')),
});

/** 登录请求体校验 */
const loginSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(1, '密码不能为空'),
});

/** 邮箱验证请求体校验 */
const verifyEmailSchema = z.object({
  code: z.string().length(6, '验证码必须为6位'),
});

// ----------------------------------------------------------------
// 路由处理函数
// ----------------------------------------------------------------

/**
 * GET /auth/bootstrap — 吉林大学版初始化配置
 * 权限：无需登录
 */
router.get(
  '/bootstrap',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const schoolResult = await pool.query(
        `SELECT id, code, name
         FROM schools
         WHERE is_active = 1
         ORDER BY id ASC
         LIMIT 1`
      );
      const school = schoolResult.rows[0] || null;

      const campusesResult = await pool.query(
        `SELECT id, school_id, code, name
         FROM campuses
         WHERE is_active = 1
         ORDER BY id ASC`
      );

      const venuesResult = await pool.query(
        `SELECT id, school_id, campus_id, name, sport_types
         FROM venues
         WHERE is_active = 1
         ORDER BY campus_id ASC, id ASC`
      );

      res.json({
        code: 0,
        message: 'success',
        data: {
          school,
          campuses: campusesResult.rows,
          venues: venuesResult.rows,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /auth/register — 用户注册
 * 权限：无需登录
 */
router.post(
  '/register',
  authRateLimit,
  validate(registerSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.register(req.body);
      res.status(201).json({
        code: 0,
        message: '注册成功',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /auth/login — 用户登录
 * 权限：无需登录
 */
router.post(
  '/login',
  authRateLimit,
  validate(loginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.login(req.body);
      res.json({
        code: 0,
        message: '登录成功',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /auth/verify-email — 验证校园邮箱
 * 权限：需登录
 * 校验通过 verify-code.service 发送到该用户邮箱的验证码
 */
router.post(
  '/verify-email',
  authRequired,
  validate(verifyEmailSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ code: 40101, message: '未登录', data: null });
        return;
      }
      // 真正校验验证码：code 以用户邮箱为 key 存储在 verify-code.service
      const valid = verifyCode(req.user.email, req.body.code);
      if (!valid) {
        throw new ValidationError('验证码错误或已过期');
      }
      const session = await AuthService.verifyEmail(req.user.id);
      res.json({
        code: 0,
        message: '邮箱验证成功',
        data: { verified: true, ...session },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /refresh-token — 刷新 Token
 * 权限：需登录
 */
router.post(
  '/refresh-token',
  authRequired,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        res.status(401).json({ code: 40101, message: '未登录', data: null });
        return;
      }
      const token = await AuthService.refreshToken(req.user.id);
      res.json({
        code: 0,
        message: 'Token 刷新成功',
        data: { token },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
