/**
 * 聊天服务
 *
 * 核心职责：消息存储、游标翻页查询、发送权限校验、通知节流。
 *
 * 聊天权限规则（CHAT_RULES）：
 *   7 个局状态下，每个状态对应 canRead / canSend 布尔值。
 *   archived 和 cancelled 为终态，完全拒绝读写。
 *   completed 为只读，可查看历史但不可发送新消息。
 */
import { pool } from '../db/pool';
import { redis } from '../db/index';
import * as NotificationService from './notification.service';

// ----------------------------------------------------------------
// 类型定义
// ----------------------------------------------------------------

/** 局状态（与数据库 game_status_enum 对齐） */
export type GameStatus =
  | 'recruiting'
  | 'full'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'archived'
  | 'cancelled';

/** 聊天权限表单项 */
interface ChatPermission {
  canRead: boolean;
  canSend: boolean;
}

/** 聊天消息 */
export interface ChatMessage {
  id: number;
  game_id: number;
  sender_id: number;
  sender_nickname: string;
  sender_avatar_url: string;
  content: string;
  created_at: string;
}

// ----------------------------------------------------------------
// 聊天权限规则表（7 个状态）
// 对应 architecture.md §3.4 的定义，状态名使用数据库实际枚举值
// ----------------------------------------------------------------

export const CHAT_RULES: Record<GameStatus, ChatPermission> = {
  recruiting:  { canRead: true,  canSend: true  },
  full:        { canRead: true,  canSend: true  },
  ready:       { canRead: true,  canSend: true  },
  in_progress: { canRead: true,  canSend: true  },
  completed:   { canRead: true,  canSend: false }, // 只读：已结束但未归档
  archived:    { canRead: false, canSend: false }, // 关闭：归档后不再可访问
  cancelled:   { canRead: false, canSend: false }, // 关闭：取消后不再可访问
};

// ----------------------------------------------------------------
// 权限校验
// ----------------------------------------------------------------

/**
 * 检查指定局状态下是否允许发送消息
 */
export function canSendMessage(status: GameStatus): boolean {
  return CHAT_RULES[status]?.canSend ?? false;
}

/**
 * 检查指定局状态下是否允许读取消息
 */
export function canReadMessages(status: GameStatus): boolean {
  return CHAT_RULES[status]?.canRead ?? false;
}

// ----------------------------------------------------------------
// 消息持久化
// ----------------------------------------------------------------

/**
 * 保存聊天消息到数据库
 *
 * @param gameId   - 局 ID
 * @param senderId - 发送者用户 ID
 * @param content  - 消息内容（调用方需预校验长度 ≤ 500）
 * @returns 插入后的完整消息记录
 */
export async function saveMessage(
  gameId: number,
  senderId: number,
  content: string,
): Promise<ChatMessage> {
  // 使用 datetime('now') 让 SQLite 自动填充，created_at 列有 DEFAULT datetime('now')
  const result = await pool.query<ChatMessage>(
    `INSERT INTO chat_messages (game_id, sender_id, content)
     VALUES ($1, $2, $3) RETURNING *`,
    [gameId, senderId, content],
  );

  // RETURNING supplies the persisted ID and timestamp for the broadcast.
  return result.rows[0];
}

// ----------------------------------------------------------------
// 消息查询
// ----------------------------------------------------------------

/**
 * 游标翻页拉取聊天消息（按 ID 倒序，最新在前）
 *
 * 翻页逻辑：
 *   - 首次请求不传 beforeId → 返回最新 limit 条
 *   - 翻页传 beforeId → 返回该 ID 之前的 limit 条，避免同秒消息遗漏
 *
 * @param gameId   - 局 ID
 * @param beforeId - 游标，取此 ID 之前的消息（可选）
 * @param limit    - 每页数量，默认 50，上限 100
 * @returns 消息列表 + 发送者昵称和头像（JOIN users）
 */
export async function getMessages(
  gameId: number,
  beforeId?: number,
  limit: number = 50,
): Promise<ChatMessage[]> {
  // 限制单次最多 100 条
  const effectiveLimit = Math.min(Math.max(1, limit), 100);

  let query: string;
  let params: (number | string)[];

  if (beforeId) {
    // 游标翻页：取 beforeId 之前的消息
    query = `
      SELECT m.id, m.game_id, m.sender_id, m.content,
             u.nickname AS sender_nickname,
             u.avatar_url AS sender_avatar_url,
             m.created_at
      FROM chat_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.game_id = $1
        AND m.id < $2
      ORDER BY m.id DESC
      LIMIT $3`;
    params = [gameId, beforeId, effectiveLimit];
  } else {
    // 首次加载：返回最新 limit 条
    query = `
      SELECT m.id, m.game_id, m.sender_id, m.content,
             u.nickname AS sender_nickname,
             u.avatar_url AS sender_avatar_url,
             m.created_at
      FROM chat_messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.game_id = $1
      ORDER BY m.id DESC
      LIMIT $2`;
    params = [gameId, effectiveLimit];
  }

  const result = await pool.query<ChatMessage>(query, params);
  return result.rows;
}

// ----------------------------------------------------------------
// 通知节流（5 分钟冷却期）
// ----------------------------------------------------------------

/**
 * 向局内其他成员发送新消息通知（带 5 分钟节流）
 *
 * 节流策略：
 *   - Redis key: notif:cooldown:{senderId}:{gameId}:new_message
 *   - TTL 300 秒（5 分钟）
 *   - 同一发送者在同一局 5 分钟内的连续消息，只产生一次 new_message 通知
 *   - 节流期内静默跳过，不影响消息本身正常收发
 *
 * @param gameId   - 局 ID
 * @param senderId - 消息发送者 ID（通知会排除此人）
 */
export async function notifyGameMembers(gameId: number, senderId: number, content = '局内有新消息'): Promise<void> {
  const cooldownKey = `notif:cooldown:${senderId}:${gameId}:new_message`;

  // 检查是否在冷却期内
  try {
    const exists = await redis.exists(cooldownKey);
    if (exists) {
      return; // 冷却期内，跳过通知
    }
    // 设置 5 分钟冷却
    await redis.set(cooldownKey, '1', 'EX', 300);
  } catch (err) {
    // Redis 不可用时不过滤，继续发送通知（宁可多通知，不可漏通知）
    console.error('[ChatService] Redis cooldown 检查失败:', (err as Error).message);
  }

  // 查询局内所有活跃成员（排除发送者本人）
  const membersResult = await pool.query<{ user_id: number }>(
    `SELECT user_id FROM game_members
     WHERE game_id = $1 AND left_at IS NULL AND user_id != $2`,
    [gameId, senderId],
  );

  // 查询发送者昵称和局标题（用于通知模板填充）
  const [senderResult, gameResult] = await Promise.all([
    pool.query<{ nickname: string }>('SELECT nickname FROM users WHERE id = $1', [senderId]),
    pool.query<{ title: string }>('SELECT title FROM games WHERE id = $1', [gameId]),
  ]);

  const senderNickname = senderResult.rows[0]?.nickname ?? '有人';
  const gameTitle = gameResult.rows[0]?.title ?? '运动局';

  // 向每个成员发送通知
  for (const member of membersResult.rows) {
    await NotificationService.createAndNotify(
      member.user_id,
      'new_message',
      gameId,
      {
        sender_nickname: senderNickname,
        game_title: gameTitle,
        content_preview: content,
      },
    );
  }
}
