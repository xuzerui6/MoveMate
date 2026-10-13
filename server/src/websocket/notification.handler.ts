/**
 * 通知推送处理器
 *
 * 负责将通知实时推送到在线用户，以及向局房间广播事件。
 * 通过 initNotificationHandler() 注入 Socket.IO Server 实例，
 * 避免与 websocket/index.ts 产生循环依赖。
 */
import { Server } from 'socket.io';
import { redis } from '../db/index';

// ----------------------------------------------------------------
// Socket.IO Server 实例引用（由 index.ts 初始化时注入）
// ----------------------------------------------------------------
let io: Server;

/**
 * 初始化通知处理器，注入 Socket.IO Server 实例。
 * 必须在 createWebSocketServer() 中调用，且必须在任何 push/broadcast 调用之前。
 */
export function initNotificationHandler(server: Server): void {
  io = server;
}

/** 获取 IO 实例，未初始化时抛错 */
function getIO(): Server {
  if (!io) {
    throw new Error('[NotificationHandler] Socket.IO 未初始化，请先调用 initNotificationHandler()');
  }
  return io;
}

// ----------------------------------------------------------------
// 定向推送
// ----------------------------------------------------------------

/**
 * 向指定用户的所有活跃连接推送通知
 *
 * 工作流程：
 * 1. 从 Redis SET `user:{userId}:sockets` 获取该用户所有活跃 socket ID
 * 2. 逐个 emit 'notification' 事件
 * 3. Redis 不可用时静默跳过（通知已写入 DB，用户下次拉取可见）
 *
 * @param userId - 接收通知的用户 ID
 * @param notification - 通知对象（含 id/type/title/content/gameId/createdAt）
 */
export async function pushToUser(
  userId: number,
  notification: {
    id: number;
    type: string;
    title: string;
    content: string;
    gameId: number | null;
    createdAt: string;
  },
): Promise<void> {
  try {
    const socketIds = await redis.smembers(`user:${userId}:sockets`);
    if (socketIds.length === 0) return; // 用户离线，通知已在 DB 中

    const server = getIO();
    for (const sid of socketIds) {
      // 定向推送给该用户的每一个活跃连接（覆盖多端场景）
      server.to(sid).emit('notification', {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        content: notification.content,
        gameId: notification.gameId,
        createdAt: notification.createdAt,
      });
    }
  } catch (err) {
    // Redis 或 IO 异常不应阻断业务流程——通知已落 DB
    console.error('[NotificationHandler] pushToUser 失败:', (err as Error).message);
  }
}

/**
 * 向局房间广播事件（排除指定用户，通常用于排除发送者本人）
 *
 * @param gameId   - 局 ID，对应 room 名 `game:{gameId}`
 * @param event    - Socket.IO 事件名，如 'new_message' / 'game_update' / 'member_change'
 * @param data     - 事件负载数据
 * @param excludeUserId - 可选，排除该用户的 socket（发送者不需要收到自己的消息广播）
 */
export function broadcastToGame(
  gameId: number,
  event: string,
  data: Record<string, unknown>,
  excludeUserId?: number,
): void {
  try {
    const server = getIO();
    const room = `game:${gameId}`;

    if (excludeUserId !== undefined) {
      // 排除发送者：获取房间内所有 socket，过滤掉属于 excludeUserId 的连接
      const sockets = server.sockets.adapter.rooms.get(room);
      if (!sockets || sockets.size === 0) return;

      for (const sid of sockets) {
        const sock = server.sockets.sockets.get(sid);
        if (sock && sock.data.userId !== excludeUserId) {
          sock.emit(event, data);
        }
      }
    } else {
      // 广播给房间内所有人
      server.to(room).emit(event, data);
    }
  } catch (err) {
    console.error('[NotificationHandler] broadcastToGame 失败:', (err as Error).message);
  }
}
