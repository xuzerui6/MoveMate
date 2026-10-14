/**
 * 通知推送处理器
 *
 * 负责将通知实时推送到在线用户，以及向局房间广播事件。
 * 通过 initNotificationHandler() 注入 Socket.IO Server 实例，
 * 避免与 websocket/index.ts 产生循环依赖。
 */
import { Server } from 'socket.io';

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
 * 1. 发到经认证的账号房间 `user:{userId}`，覆盖该账号的所有连接。
 * 2. Redis adapter 负责跨实例传播；不依赖进程内的在线连接表。
 * 3. 推送失败时保留已写入数据库的通知，用户可以重新拉取。
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
    const server = getIO();
    server.to(`user:${userId}`).emit('notification', {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        content: notification.content,
        gameId: notification.gameId,
        createdAt: notification.createdAt,
    });
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
      server.to(room).except(`user:${excludeUserId}`).emit(event, data);
    } else {
      // 广播给房间内所有人
      server.to(room).emit(event, data);
    }
  } catch (err) {
    console.error('[NotificationHandler] broadcastToGame 失败:', (err as Error).message);
  }
}

/** Revoke every connection of a member who has left, including remote instances. */
export function removeUserFromGame(gameId: number, userId: number): void {
  getIO().in(`user:${userId}`).socketsLeave(`game:${gameId}`);
}
