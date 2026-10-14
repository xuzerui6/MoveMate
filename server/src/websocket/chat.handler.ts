/**
 * 聊天事件处理器
 *
 * 处理客户端 WebSocket 聊天事件：
 *   join_room    - 加入局聊天房间
 *   leave_room   - 离开局聊天房间
 *   send_message - 发送聊天消息
 *
 * 权限与状态约束：
 *   - archived / cancelled 局拒绝 join_room 和 send_message
 *   - completed 局允许 join_room 但设为只读模式（不可发送）
 *   - 发送消息需验证用户是否为该局成员
 *   - 消息内容 ≤ 500 字服务端二次校验
 */
import { Server, Socket } from 'socket.io';
import { pool } from '../db/pool';
import * as ChatService from '../services/chat.service';

// ----------------------------------------------------------------
// 局状态行类型
// ----------------------------------------------------------------
interface GameStateRow {
  status: ChatService.GameStatus;
  title: string;
  host_id: number;
}

/**
 * 注册单个 socket 的所有聊天事件监听器
 *
 * @param io     - Socket.IO Server 实例（用于广播到房间）
 * @param socket - 当前连接的 socket
 */
export function registerChatHandlers(io: Server, socket: Socket): void {
  const userId: number = socket.data.userId;
  const userName: string = socket.data.userName ?? '';
  const userAvatar: string = socket.data.userAvatar ?? '';

  // ----------------------------------------------------------
  // join_room: 加入局聊天房间
  // ----------------------------------------------------------
  socket.on('join_room', async ({ gameId }: { gameId: number }) => {
    if (!gameId) {
      socket.emit('error', { message: '缺少 gameId 参数' });
      return;
    }

    try {
      // 查询局状态
      const gameResult = await pool.query<GameStateRow>(
        'SELECT status, title, host_id FROM games WHERE id = $1',
        [gameId],
      );

      if (gameResult.rows.length === 0) {
        socket.emit('error', { message: '该局不存在' });
        return;
      }

      const game = gameResult.rows[0];
      const room = `game:${gameId}`;

      const membership = await pool.query(
        'SELECT 1 FROM game_members WHERE game_id=$1 AND user_id=$2 AND left_at IS NULL',
        [gameId, userId],
      );
      if (!membership.rowCount) {
        socket.emit('error', { message: '你还未加入该局，无法查看聊天' });
        return;
      }

      // 归档/取消的局：拒绝加入房间（聊天已完全关闭）
      if (game.status === 'archived' || game.status === 'cancelled') {
        socket.emit('error', { message: '该局已结束，聊天已关闭' });
        return;
      }

      // 已结束的局：允许加入但设为只读模式
      if (game.status === 'completed') {
        socket.join(room);
        socket.emit('chat_mode', { gameId, chatMode: 'readonly' });
        return;
      }

      // 正常状态：加入房间，聊天可用
      socket.join(room);
      socket.emit('chat_mode', { gameId, chatMode: 'active' });
    } catch (err) {
      console.error('[ChatHandler] join_room 错误:', (err as Error).message);
      socket.emit('error', { message: '加入聊天房间失败' });
    }
  });

  // ----------------------------------------------------------
  // leave_room: 离开局聊天房间
  // ----------------------------------------------------------
  socket.on('leave_room', ({ gameId }: { gameId: number }) => {
    if (!gameId) return;
    const room = `game:${gameId}`;
    socket.leave(room);
  });

  // ----------------------------------------------------------
  // send_message: 发送聊天消息
  // ----------------------------------------------------------
  socket.on('send_message', async ({ gameId, content }: { gameId: number; content: string }, ack?: (result: any) => void) => {
    const fail = (message: string) => { if (typeof ack === 'function') ack({ error: message }); };
    // 0. 参数校验
    if (!gameId) {
      fail('缺少 gameId 参数');
      return;
    }

    // 1. 内容校验（服务端二次把关）
    if (!content || content.trim().length === 0) {
      fail('消息不能为空');
      return;
    }
    if (content.length > 500) {
      fail('消息不能超过 500 字');
      return;
    }

    try {
      // 2. 查询局状态，校验发送权限
      const gameResult = await pool.query<GameStateRow>(
        'SELECT status, title, host_id FROM games WHERE id = $1',
        [gameId],
      );

      if (gameResult.rows.length === 0) {
        fail('该局不存在');
        return;
      }

      const game = gameResult.rows[0];

      if (!ChatService.canSendMessage(game.status)) {
        const reason =
          game.status === 'completed'
            ? '该局已结束，聊天已设为只读'
            : game.status === 'archived' || game.status === 'cancelled'
              ? '该局已结束，聊天已关闭'
              : '当前局状态不允许发送消息';
        fail(reason);
        return;
      }

      // 3. 权限校验：用户必须是该局参与者
      const memberResult = await pool.query(
        `SELECT 1 FROM game_members
         WHERE game_id = $1 AND user_id = $2 AND left_at IS NULL`,
        [gameId, userId],
      );

      if (memberResult.rows.length === 0) {
        fail('你还未加入该局，无法发送消息');
        return;
      }

      // 4. 写入数据库
      const message = await ChatService.saveMessage(gameId, userId, content.trim());

      // 5. 广播给房间内所有人（包括发送者本人，用于消息确认）
      // SQLite datetime 格式 "2026-05-31 06:05:33" → ISO 8601 "2026-05-31T06:05:33Z"
      const isoTs = message.created_at
        ? message.created_at.replace(' ', 'T') + (message.created_at.includes('Z') ? '' : 'Z')
        : '';
      const payload = {
        id: message.id,
        gameId,
        sender: {
          id: userId,
          nickname: userName,
          avatar: userAvatar,
        },
        content: message.content,
        createdAt: isoTs,
        created_at: isoTs,
      };
      io.to(`game:${gameId}`).emit('new_message', payload);
      if (typeof ack === 'function') ack({ message: payload });

      // 6. 触发通知（带 5 分钟节流，通知局内其他人）
      ChatService.notifyGameMembers(gameId, userId, message.content).catch((err) => {
        console.error('[ChatHandler] notifyGameMembers 失败:', (err as Error).message);
      });
    } catch (err) {
      console.error('[ChatHandler] send_message 错误:', (err as Error).message);
      fail('发送消息失败，请稍后重试');
    }
  });
}
