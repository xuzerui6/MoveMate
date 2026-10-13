import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { isAllowedEmail, createCode, verifyCode } from '../services/verify-code.service';
import { sendVerificationCode } from '../services/email.service';
import { config } from '../config';

const router = Router();

// 验证码发送防刷：每 IP 每分钟最多 3 次（防 SMTP 配额耗尽）
const sendRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 42900, message: '验证码发送太频繁，请一分钟后再试', data: null },
});

// POST /verify/send — 发送验证码
router.post('/send', sendRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      res.status(400).json({ code: 40001, message: '请提供邮箱地址', data: null });
      return;
    }

    // 校验邮箱后缀
    if (!isAllowedEmail(email)) {
      res.status(400).json({
        code: 40002,
        message: '仅支持校园邮箱注册（@mails.jlu.edu.cn 或 @jlu.edu.cn）',
        data: null,
      });
      return;
    }

    // SMTP 未配置时返回提示
    if (!config.smtp.user || !config.smtp.pass) {
      res.status(500).json({
        code: 50002,
        message: '邮件服务未配置，请联系管理员',
        data: null,
      });
      return;
    }

    const code = createCode(email);
    await sendVerificationCode(email, code);

    res.json({ code: 0, message: '验证码已发送', data: { email } });
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('发送过于频繁')) {
      res.status(429).json({ code: 42901, message, data: null });
      return;
    }
    console.error('[Verify] send error:', message);
    res.status(500).json({ code: 50001, message: '发送失败，请稍后重试', data: null });
  }
});

// POST /verify/check — 校验验证码
router.post('/check', async (req: Request, res: Response) => {
  const { email, code } = req.body;
  if (!email || !code) {
    res.status(400).json({ code: 40001, message: '请提供邮箱和验证码', data: null });
    return;
  }

  const valid = verifyCode(email, code);
  if (!valid) {
    res.status(400).json({ code: 40003, message: '验证码错误或已过期', data: null });
    return;
  }

  res.json({ code: 0, message: '验证通过', data: { email } });
});

export default router;
