/**
 * 社交路由：好友 / 拉黑 / 邀请 / 社交设置 / 举报（用户侧）
 * 挂载于 /api/v1（路径自带 /friends、/blocks、/reports、/users/me/... 前缀）
 */
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth';
import * as Social from '../services/social.service';

const router = Router();
router.use(authRequired);

function success(res: Response, data: any, message = 'success'): void {
  res.json({ code: 0, message, data });
}
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => { fn(req, res, next).catch(next); };
}
function parseId(raw: string): number | null {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

const friendRequestSchema = z.object({
  userId: z.number().int().positive().optional(),
  user_id: z.number().int().positive().optional(),
  inviteCode: z.string().min(1).max(100).optional(),
  invite_code: z.string().min(1).max(100).optional(),
  greeting: z.string().max(100).optional(),
  source_game_id: z.number().int().positive().optional(),
});

const blockSchema = z.object({
  userId: z.number().int().positive().optional(),
  user_id: z.number().int().positive().optional(),
});

const reportSchema = z.object({
  target_type: z.enum(['user', 'message', 'game']),
  target_id: z.union([z.string().min(1), z.number()]),
  reason: z.string().max(500).optional(),
});

const socialSettingsSchema = z.object({
  friend_request_scope: z.enum(['anyone', 'played_together']).optional(),
});

// ---------- 好友 ----------
router.post('/friends/requests', asyncHandler(async (req, res) => {
  const body = friendRequestSchema.parse(req.body || {});
  const request = await Social.sendFriendRequest(req.user!.id, {
    userId: body.userId ?? body.user_id,
    inviteCode: body.inviteCode ?? body.invite_code,
    greeting: body.greeting,
    source_game_id: body.source_game_id,
  });
  success(res, { request }, '好友申请已发送');
}));

router.get('/friends/requests', asyncHandler(async (req, res) => {
  success(res, { requests: await Social.listIncomingRequests(req.user!.id) });
}));

router.post('/friends/requests/:id/accept', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ code: 40000, message: '无效的申请 ID', data: null }); return; }
  success(res, await Social.acceptFriendRequest(req.user!.id, id), '你们已经是好友了');
}));

router.post('/friends/requests/:id/reject', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ code: 40000, message: '无效的申请 ID', data: null }); return; }
  success(res, await Social.rejectFriendRequest(req.user!.id, id), '已拒绝');
}));

router.get('/friends/recent-partners', asyncHandler(async (req, res) => {
  success(res, { partners: await Social.listRecentPartners(req.user!.id) });
}));

router.get('/friends', asyncHandler(async (req, res) => {
  success(res, { friends: await Social.listFriends(req.user!.id) });
}));

router.delete('/friends/:userId', asyncHandler(async (req, res) => {
  const id = parseId(req.params.userId);
  if (!id) { res.status(400).json({ code: 40000, message: '无效的用户 ID', data: null }); return; }
  success(res, await Social.deleteFriend(req.user!.id, id), '已删除好友');
}));

router.post('/friends/invite-preview', asyncHandler(async (req, res) => {
  const code = String((req.body || {}).inviteCode ?? (req.body || {}).invite_code ?? '');
  if (!code) { res.status(400).json({ code: 40000, message: '缺少邀请码', data: null }); return; }
  success(res, { inviter: await Social.previewInvite(code) });
}));

// ---------- 我的邀请 / 社交设置 ----------
router.get('/users/me/invite', asyncHandler(async (req, res) => {
  success(res, await Social.getMyInvite(req.user!.id));
}));

router.get('/users/me/social-settings', asyncHandler(async (req, res) => {
  success(res, await Social.getSocialSettings(req.user!.id));
}));

router.put('/users/me/social-settings', asyncHandler(async (req, res) => {
  const body = socialSettingsSchema.parse(req.body || {});
  success(res, await Social.updateSocialSettings(req.user!.id, body), '设置已保存');
}));

// ---------- 拉黑 ----------
router.post('/blocks', asyncHandler(async (req, res) => {
  const body = blockSchema.parse(req.body || {});
  const target = body.userId ?? body.user_id;
  if (!target) { res.status(400).json({ code: 40000, message: '缺少要拉黑的用户', data: null }); return; }
  success(res, await Social.blockUser(req.user!.id, target), '已拉黑');
}));

router.get('/blocks', asyncHandler(async (req, res) => {
  success(res, { blocks: await Social.listBlocks(req.user!.id) });
}));

router.delete('/blocks/:userId', asyncHandler(async (req, res) => {
  const id = parseId(req.params.userId);
  if (!id) { res.status(400).json({ code: 40000, message: '无效的用户 ID', data: null }); return; }
  success(res, await Social.unblockUser(req.user!.id, id), '已取消拉黑');
}));

// ---------- 举报（用户侧） ----------
router.post('/reports', asyncHandler(async (req, res) => {
  const body = reportSchema.parse(req.body || {});
  const report = await Social.createReport(req.user!.id, body);
  success(res, { report }, '已经收到你的举报，我们会认真看');
}));

router.get('/reports/mine', asyncHandler(async (req, res) => {
  success(res, { reports: await Social.listMyReports(req.user!.id) });
}));

router.post('/reports/:id/appeal', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ code: 40000, message: '无效的举报 ID', data: null }); return; }
  const appeal = String((req.body || {}).appeal ?? (req.body || {}).reason ?? '');
  success(res, { report: await Social.appealReport(req.user!.id, id, appeal) }, '申诉已提交');
}));

export default router;
