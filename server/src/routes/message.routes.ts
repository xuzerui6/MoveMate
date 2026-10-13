/**
 * 聊天消息路由（挂载于 /api/v1/games/:id/messages）
 * game_id 从父路由 req.params.id 获取
 */
import { Router, Request, Response } from 'express';
import { authRequired } from '../middleware/auth';
import { pool } from '../db/pool';
import * as ChatService from '../services/chat.service';

const router = Router({ mergeParams: true });

router.use(authRequired);

// GET / — 拉取聊天记录（游标翻页）
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const gameId = parseInt(req.params.id, 10);
    const beforeId = req.query.before_id ? parseInt(req.query.before_id as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    if (isNaN(gameId)) {
      res.status(400).json({ code: 40001, message: '无效的局 ID', data: null });
      return;
    }

    const gameResult = await pool.query<{ status: ChatService.GameStatus }>(
      'SELECT status FROM games WHERE id = $1', [gameId]
    );
    if (gameResult.rows.length === 0) {
      res.status(404).json({ code: 40401, message: '该局不存在', data: null });
      return;
    }

    if (!ChatService.canReadMessages(gameResult.rows[0].status)) {
      res.status(403).json({ code: 20009, message: '聊天室已关闭', data: null });
      return;
    }

    const messages = await ChatService.getMessages(gameId, beforeId, limit);
    res.json({ code: 0, message: 'success', data: { messages } });
  } catch (err) {
    console.error('[Messages] GET error:', (err as Error).message);
    res.status(500).json({ code: 50001, message: '服务器内部错误', data: null });
  }
});

// POST / — 发送消息
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const gameId = parseInt(req.params.id, 10);
    const { content } = req.body as { content?: string };

    if (isNaN(gameId)) {
      res.status(400).json({ code: 40001, message: '无效的局 ID', data: null });
      return;
    }
    if (!content || content.trim().length === 0) {
      res.status(400).json({ code: 40002, message: '消息内容不能为空', data: null });
      return;
    }
    if (content.length > 500) {
      res.status(400).json({ code: 40003, message: '消息不能超过500字', data: null });
      return;
    }

    const gameResult = await pool.query<{ status: ChatService.GameStatus }>(
      'SELECT status FROM games WHERE id = $1', [gameId]
    );
    if (gameResult.rows.length === 0) {
      res.status(404).json({ code: 40401, message: '该局不存在', data: null });
      return;
    }

    if (!ChatService.canSendMessage(gameResult.rows[0].status)) {
      res.status(403).json({ code: 20009, message: '聊天室已关闭', data: null });
      return;
    }

    const memberResult = await pool.query(
      'SELECT 1 FROM game_members WHERE game_id = $1 AND user_id = $2 AND left_at IS NULL',
      [gameId, userId]
    );
    if (memberResult.rows.length === 0) {
      res.status(403).json({ code: 20008, message: '你还未加入该局', data: null });
      return;
    }

    const message = await ChatService.saveMessage(gameId, userId, content.trim());
    const userResult = await pool.query<{ nickname: string; avatar_url: string }>(
      'SELECT nickname, avatar_url FROM users WHERE id = $1', [userId]
    );

    ChatService.notifyGameMembers(gameId, userId).catch((err: Error) => {
      console.error('[Messages] notify error:', err.message);
    });

    res.status(201).json({
      code: 0, message: 'success',
      data: {
        message: {
          id: message.id, game_id: message.game_id,
          content: message.content, created_at: message.created_at,
          sender: { id: userId, ...userResult.rows[0] },
        },
      },
    });
  } catch (err) {
    console.error('[Messages] POST error:', (err as Error).message);
    res.status(500).json({ code: 50001, message: '服务器内部错误', data: null });
  }
});

export default router;
