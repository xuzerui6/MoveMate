import { Router, Request, Response, NextFunction } from 'express';
import { verifyCheckinCode } from '../utils/checkin-store';
import { checkInForGame } from '../services/game.service';

const router = Router();

/** 生成结果页 HTML */
function resultPage(ok: boolean, title: string, detail: string): string {
  const color = ok ? '#10B981' : '#EF4444';
  const emoji = ok ? '✅' : '❌';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>搭个局 - 签到</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { display:flex; justify-content:center; align-items:center; min-height:100vh; background:linear-gradient(135deg,#f8fafc,#e2e8f0); font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif; }
  .card { background:#fff; border-radius:20px; padding:2.5rem 2rem; text-align:center; max-width:380px; width:90%; box-shadow:0 10px 40px rgba(0,0,0,0.08); }
  .icon { font-size:3.5rem; margin-bottom:0.75rem; }
  h1 { font-size:1.3rem; color:#1a1a2e; margin-bottom:0.5rem; }
  p { font-size:0.9rem; color:#64748b; line-height:1.6; }
  .bar { height:4px; border-radius:2px; background:${color}; width:60px; margin:1rem auto; }
</style>
</head>
<body>
<div class="card">
  <div class="icon">${emoji}</div>
  <h1>${title}</h1>
  <div class="bar"></div>
  <p>${detail}</p>
</div>
</body>
</html>`;
}

/** GET /api/v1/checkin/:code — 邮件一键签到（短码） */
router.get('/:code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.params;

    const payload = verifyCheckinCode(code);
    if (!payload) {
      res.status(400).send(resultPage(false, '链接无效或已过期', '签到链接已失效，请打开 App 手动签到。'));
      return;
    }

    // 执行签到
    try {
      await checkInForGame(payload.gameId, payload.userId);
      res.send(resultPage(true, '签到成功！', '你已成功签到，记得准时到场哦 🎉'));
    } catch (err: any) {
      const msg = err.message || '签到失败';
      let friendly = msg;
      if (msg.includes('当前状态不可签到')) friendly = '活动当前状态不支持签到，可能已经结束或取消了。';
      else if (msg.includes('不是该局的成员')) friendly = '你不是该活动的成员，无法签到。';
      else if (msg.includes('签到时间窗')) friendly = '当前不在签到时间范围内（活动开始前 30 分钟至开始后 1 小时）。';
      else if (msg.includes('已签到')) friendly = '你已经签过到了，无需重复签到。';

      res.status(400).send(resultPage(false, '签到失败', friendly));
    }
  } catch (err) {
    next(err);
  }
});

export default router;
