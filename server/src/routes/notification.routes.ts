/**
 * 通知路由（挂载于 /api/v1/notifications）
 *
 * 端点：
 *   GET  /notifications            — 通知列表（含未读计数）
 *   PUT  /notifications/:id/read   — 标记单条已读
 *   PUT  /notifications/read-all   — 全部标记已读
 *   GET  /notifications/unread-count — 未读数查询（供前端轮询用）
 */
import { Router, Request, Response } from 'express';
import { authRequired } from '../middleware/auth';
import * as NotificationService from '../services/notification.service';

const router = Router();

// 所有路由均需登录
router.use(authRequired);

// ----------------------------------------------------------------
// GET /notifications — 通知列表 + 未读计数
// ----------------------------------------------------------------
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = parseInt((req.query.page as string) || '1', 10);
    const pageSize = parseInt((req.query.page_size as string) || '20', 10);

    const result = await NotificationService.getNotifications(userId, page, pageSize);

    res.json({
      code: 0,
      message: 'success',
      data: {
        notifications: result.notifications,
        unread_count: result.unreadCount,
        pagination: result.pagination,
      },
    });
  } catch (err) {
    console.error('[NotificationRoutes] GET / 错误:', (err as Error).message);
    res.status(500).json({ code: 50001, message: '服务器内部错误', data: null });
  }
});

// ----------------------------------------------------------------
// GET /notifications/unread-count — 未读数查询
// 轻量接口，供前端轮询使用（15-30 秒一次），减少全量拉取频率
// ----------------------------------------------------------------
router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const count = await NotificationService.getUnreadCount(userId);

    res.json({
      code: 0,
      message: 'success',
      data: { unread_count: count },
    });
  } catch (err) {
    console.error('[NotificationRoutes] GET /unread-count 错误:', (err as Error).message);
    res.status(500).json({ code: 50001, message: '服务器内部错误', data: null });
  }
});

// ----------------------------------------------------------------
// PUT /notifications/read-all — 全部标记已读
// 注意：此路由必须定义在 /:id/read 之前，避免 Express 将 "read-all" 匹配为 :id
// ----------------------------------------------------------------
router.put('/read-all', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await NotificationService.markAllRead(userId);

    res.json({
      code: 0,
      message: 'success',
      data: { ok: true },
    });
  } catch (err) {
    console.error('[NotificationRoutes] PUT /read-all 错误:', (err as Error).message);
    res.status(500).json({ code: 50001, message: '服务器内部错误', data: null });
  }
});

// ----------------------------------------------------------------
// PUT /notifications/:id/read — 标记单条已读
// ----------------------------------------------------------------
router.put('/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const notificationId = parseInt(req.params.id, 10);

    if (isNaN(notificationId)) {
      res.status(400).json({ code: 40001, message: '无效的通知 ID', data: null });
      return;
    }

    await NotificationService.markRead(notificationId, userId);

    res.json({
      code: 0,
      message: 'success',
      data: { ok: true },
    });
  } catch (err) {
    console.error('[NotificationRoutes] PUT /:id/read 错误:', (err as Error).message);
    res.status(500).json({ code: 50001, message: '服务器内部错误', data: null });
  }
});

// ----------------------------------------------------------------
// DELETE /notifications/clear — 清除所有通知
// ----------------------------------------------------------------
router.delete('/clear', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await NotificationService.clearAll(userId);

    res.json({
      code: 0,
      message: `已清理 ${result.deleted} 条通知`,
      data: { deleted: result.deleted },
    });
  } catch (err) {
    console.error('[NotificationRoutes] DELETE /clear 错误:', (err as Error).message);
    res.status(500).json({ code: 50001, message: '服务器内部错误', data: null });
  }
});

// ----------------------------------------------------------------
// DELETE /notifications/batch — 批量删除选中的通知
// Body: { ids: number[] }
// ----------------------------------------------------------------
router.delete('/batch', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ code: 40001, message: '请指定要删除的通知', data: null });
      return;
    }
    const result = await NotificationService.deleteByIds(userId, ids);

    res.json({
      code: 0,
      message: `已删除 ${result.deleted} 条通知`,
      data: { deleted: result.deleted },
    });
  } catch (err) {
    console.error('[NotificationRoutes] DELETE /batch 错误:', (err as Error).message);
    res.status(500).json({ code: 50001, message: '服务器内部错误', data: null });
  }
});

export default router;
