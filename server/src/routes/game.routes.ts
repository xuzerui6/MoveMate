import { Router, Request, Response, NextFunction } from 'express';
import { authRequired, emailVerifiedRequired } from '../middleware/auth';
import {
  createGame,
  joinGame,
  leaveGame,
  checkInForGame,
  confirmAttendance,
  cancelGame,
  startGameWithAuth,
  completeGameWithAuth,
  listGames,
  getGameDetail,
  SportType,
  GameTag,
} from '../services/game.service';
import { ZodError, z } from 'zod';

const router = Router();

// ================================================================
// 请求体验证 Schema（使用 Zod）
// ================================================================

const createGameSchema = z.object({
  sport_type: z.string().trim().min(1, '运动类型不能为空').max(30, '运动类型不能超过30个字符'),
  title: z.string().max(50).optional(),
  campus_id: z.number().int().min(1, '请选择校区'),
  venue_id: z.number().int().min(1, '请选择场地').optional(),
  location: z.string().max(200).optional(),
  meeting_note: z.string().max(200).optional(),
  max_players: z.number().int().min(2, '至少需要2人（含发起人）'),
  start_time: z.string().refine(
    (val) => !isNaN(Date.parse(val)) && new Date(val) > new Date(),
    { message: '开始时间必须是未来的时间' },
  ),
  end_time: z.string().optional(),
  tag: z.enum(['casual', 'beginner_friendly', 'competitive', 'relaxed']).optional(),
}).refine(
  (data) => Boolean(data.venue_id) || Boolean(data.location?.trim()),
  { message: '请选择场地或手动输入场地名称', path: ['venue_id'] }
).refine(
  (data) => !data.end_time || (!isNaN(Date.parse(data.end_time)) && new Date(data.end_time) > new Date(data.start_time)),
  { message: '结束时间必须晚于开始时间', path: ['end_time'] }
);

const listGamesSchema = z.object({
  sport_type: z.string().trim().min(1).max(30).optional(),
  status: z.enum(['recruiting', 'full', 'ready', 'in_progress', 'completed', 'archived', 'cancelled']).optional(),
  campus_id: z.coerce.number().int().min(1).optional(),
  scope: z.enum(['campus', 'school']).optional().default('campus'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式不正确').optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(50).optional().default(20),
  sort_by: z.enum(['start_time', 'created_at', 'member_count']).optional().default('start_time'),
}).refine((data) => {
  if (!data.date) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${data.date}T00:00:00`);
  return target >= today;
}, {
  message: '不能筛选过去的日期',
  path: ['date'],
});

const confirmAttendanceSchema = z.object({
  user_id: z.number().int().positive('用户 ID 不合法'),
});

// ================================================================
// 统一响应格式化
// ================================================================

function success(res: Response, data: any, message: string = 'success'): void {
  res.json({ code: 0, message, data });
}

function fail(res: Response, code: number, message: string, httpStatus: number = 400): void {
  res.status(httpStatus).json({ code, message, data: null });
}

/**
 * 封装异步路由处理器，自动捕获异常
 */
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ================================================================
// POST /api/v1/games —— 创建运动局
// ================================================================
router.post(
  '/',
  authRequired,
  emailVerifiedRequired,
  asyncHandler(async (req: Request, res: Response) => {
    const input = createGameSchema.parse(req.body);
    const game = await createGame({
      host_id: req.user!.id,
      ...input,
    } as any);
    success(res, { game }, '运动局创建成功');
  }),
);

// ================================================================
// GET /api/v1/games —— 运动局列表（大厅）
// 支持查询参数: ?sport_type&status&page&page_size&sort_by
// ================================================================
router.get(
  '/',
  authRequired,
  asyncHandler(async (req: Request, res: Response) => {
    const query = listGamesSchema.parse(req.query);
    const result = await listGames(query, req.user!.id);
    success(res, result);
  }),
);

// ================================================================
// GET /api/v1/games/:id —— 运动局详情（含成员列表）
// ================================================================
router.get(
  '/:id',
  authRequired,
  asyncHandler(async (req: Request, res: Response) => {
    const gameId = parseInt(req.params.id, 10);
    if (isNaN(gameId)) {
      return fail(res, 40001, '无效的局 ID');
    }

    const result = await getGameDetail(gameId, req.user!.id);
    success(res, result);
  }),
);

// ================================================================
// POST /api/v1/games/:id/join —— 加入运动局
// SELECT FOR UPDATE 防超员并发
// ================================================================
router.post(
  '/:id/join',
  authRequired,
  emailVerifiedRequired,
  asyncHandler(async (req: Request, res: Response) => {
    const gameId = parseInt(req.params.id, 10);
    if (isNaN(gameId)) {
      return fail(res, 40001, '无效的局 ID');
    }

    const result = await joinGame(gameId, req.user!.id);
    success(res, result, '加入成功');
  }),
);

// ================================================================
// POST /api/v1/games/:id/leave —— 退出运动局
// 含满员回退 + 即将开始回退
// ================================================================
router.post(
  '/:id/leave',
  authRequired,
  asyncHandler(async (req: Request, res: Response) => {
    const gameId = parseInt(req.params.id, 10);
    if (isNaN(gameId)) {
      return fail(res, 40001, '无效的局 ID');
    }

    const result = await leaveGame(gameId, req.user!.id);
    success(res, result, '退出成功');
  }),
);

// ================================================================
// POST /api/v1/games/:id/check-in —— 成员签到
// ready / in_progress 且在签到时间窗内
// ================================================================
router.post(
  '/:id/check-in',
  authRequired,
  asyncHandler(async (req: Request, res: Response) => {
    const gameId = parseInt(req.params.id, 10);
    if (isNaN(gameId)) {
      return fail(res, 40001, '无效的局 ID');
    }

    const result = await checkInForGame(gameId, req.user!.id);
    success(res, result, '签到成功');
  }),
);

// ================================================================
// POST /api/v1/games/:id/attendance/confirm —— 发起人确认成员到场
// ================================================================
router.post(
  '/:id/attendance/confirm',
  authRequired,
  asyncHandler(async (req: Request, res: Response) => {
    const gameId = parseInt(req.params.id, 10);
    if (isNaN(gameId)) {
      return fail(res, 40001, '无效的局 ID');
    }

    const { user_id } = confirmAttendanceSchema.parse(req.body);
    const result = await confirmAttendance(gameId, req.user!.id, user_id);
    success(res, result, '已确认到场');
  }),
);

// ================================================================
// POST /api/v1/games/:id/cancel —— 取消运动局（仅发起人）
// ================================================================
router.post(
  '/:id/cancel',
  authRequired,
  asyncHandler(async (req: Request, res: Response) => {
    const gameId = parseInt(req.params.id, 10);
    if (isNaN(gameId)) {
      return fail(res, 40001, '无效的局 ID');
    }

    const game = await cancelGame(gameId, req.user!.id);
    success(res, { game }, '局已取消');
  }),
);

// ================================================================
// POST /api/v1/games/:id/start —— 确认活动开始（仅发起人）
// ready → in_progress
// ================================================================
router.post(
  '/:id/start',
  authRequired,
  asyncHandler(async (req: Request, res: Response) => {
    const gameId = parseInt(req.params.id, 10);
    if (isNaN(gameId)) {
      return fail(res, 40001, '无效的局 ID');
    }

    const game = await startGameWithAuth(gameId, req.user!.id);
    success(res, { game }, '活动已开始');
  }),
);

// ================================================================
// POST /api/v1/games/:id/complete —— 确认运动结束（仅发起人）
// in_progress → completed
// ================================================================
router.post(
  '/:id/complete',
  authRequired,
  asyncHandler(async (req: Request, res: Response) => {
    const gameId = parseInt(req.params.id, 10);
    if (isNaN(gameId)) {
      return fail(res, 40001, '无效的局 ID');
    }

    const game = await completeGameWithAuth(gameId, req.user!.id);
    success(res, { game }, '局已确认结束');
  }),
);

export default router;
