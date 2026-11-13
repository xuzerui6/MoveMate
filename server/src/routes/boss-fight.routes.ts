/**
 * 组队打怪路由（附四一期）：挂载于 /api/v1，路径为 /games/:id/boss-fight...
 * 只做参数解析与鉴权，规则全在 boss-fight.service。
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth';
import * as BossFight from '../services/boss-fight.service';

const router = Router();
// 与 social.routes 同款收窄：只对自己的路径鉴权，别截走其他路由的未匹配请求
router.use((req: Request, res: Response, next: NextFunction) => {
  if (/^\/games\/\d+\/boss-fight(\/|$)/.test(req.path)) return authRequired(req, res, next);
  return next();
});

function success(res: Response, data: any, message = 'success'): void {
  res.json({ code: 0, message, data });
}
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => { fn(req, res, next).catch(next); };
}
function gameId(req: Request): number {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) throw new Error('invalid game id');
  return id;
}

const createSchema = z.object({
  movement: z.string().min(1).max(50),
  bossId: z.string().min(1).max(50).optional(),
  durationSec: z.number().int().min(60).max(1800).optional(),
});
const joinSchema = z.object({ sessionId: z.string().min(1).max(100).optional() });
const linkSchema = z.object({ sessionId: z.string().min(1).max(100) });
const readySchema = z.object({ ready: z.boolean() });

router.post('/games/:id/boss-fight', asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body || {});
  success(res, await BossFight.createFight(gameId(req), req.user!.id, body), '打怪发起成功');
}));

router.get('/games/:id/boss-fight', asyncHandler(async (req, res) => {
  success(res, await BossFight.getFightForGame(gameId(req), req.user!.id));
}));

router.post('/games/:id/boss-fight/join', asyncHandler(async (req, res) => {
  const body = joinSchema.parse(req.body || {});
  success(res, await BossFight.joinFight(gameId(req), req.user!.id, body), '已加入队伍');
}));

router.post('/games/:id/boss-fight/link-session', asyncHandler(async (req, res) => {
  const body = linkSchema.parse(req.body || {});
  success(res, await BossFight.linkSession(gameId(req), req.user!.id, body.sessionId), '计数已挂上');
}));

router.post('/games/:id/boss-fight/ready', asyncHandler(async (req, res) => {
  const body = readySchema.parse(req.body || {});
  success(res, await BossFight.setReady(gameId(req), req.user!.id, body.ready));
}));

router.post('/games/:id/boss-fight/start', asyncHandler(async (req, res) => {
  success(res, await BossFight.startFight(gameId(req), req.user!.id), '开打');
}));

router.post('/games/:id/boss-fight/leave', asyncHandler(async (req, res) => {
  success(res, await BossFight.leaveFight(gameId(req), req.user!.id), '已退出队伍');
}));

router.get('/games/:id/boss-fight/latency', asyncHandler(async (req, res) => {
  success(res, await BossFight.latencySummary(gameId(req), req.user!.id));
}));

export default router;
