/**
 * WebSocket 服务器初始化
 *
 * 负责：
 *   1. 从 HTTP Server 创建 Socket.IO 实例
 *   2. JWT 认证中间件 —— 验证 token，注入 socket.data（userId/userName/userAvatar）
 *   3. 连接/断连时维护 Redis 在线状态（user:{userId}:sockets SET）
 *   4. 注册 chat.handler 和 notification.handler 的事件监听
 *
 * 架构说明：
 *   - 使用 initNotificationHandler() 注入 IO 实例，避免循环依赖
 *   - 每个 socket 连接时从 DB 查询用户昵称/头像，存入 socket.data 供后续事件使用
 */
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt';
import { pool } from '../db/pool';
import { redis } from '../db/index';
import { registerChatHandlers } from './chat.handler';
import { initNotificationHandler } from './notification.handler';
import { ensureCloudRuntime, isVercelRuntime } from '../cloud';
import { ensureSocketAdapter } from './cloud-adapter';
import { isAllowedOrigin } from '../xiaozhi/identity';

// ----------------------------------------------------------------
// Socket.IO Server 实例（模块级单例）
// ----------------------------------------------------------------
let io: Server;

/**
 * 获取 Socket.IO Server 实例
 * 供外部模块（如 notification.handler）在需要时访问
 */
export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.IO 未初始化，请先调用 createWebSocketServer()');
  }
  return io;
}

// ----------------------------------------------------------------
// JWT 认证中间件（Socket.IO 版）
// ----------------------------------------------------------------

/**
 * Socket.IO 认证中间件
 *
 * 验证流程：
 *   1. 从 socket.handshake.auth.token 提取 JWT
 *   2. 调用 verifyToken() 解码 payload
 *   3. 从 users 表查询 nickname 和 avatar_url
 *   4. 注入 socket.data：userId / userName / userAvatar
 */
async function authenticateSocket(socket: Socket, next: (err?: Error) => void): Promise<void> {
  try {
    await ensureCloudRuntime();
    await ensureSocketAdapter(io);
    const token = socket.handshake.auth.token as string | undefined;

    if (!token) {
      return next(new Error('未提供认证令牌'));
    }

    // 验证 JWT
    const payload = verifyToken(token);

    // 查询用户昵称和头像（用于消息广播中展示发送者信息）
    const userResult = await pool.query<{ nickname: string; avatar_url: string }>(
      'SELECT nickname, avatar_url FROM users WHERE id = $1',
      [payload.sub],
    );

    if (userResult.rows.length === 0) {
      return next(new Error('用户不存在'));
    }

    const user = userResult.rows[0];

    // 注入 socket.data，后续事件处理器通过 socket.data 获取用户信息
    socket.data.userId = payload.sub;
    socket.data.userName = user.nickname;
    socket.data.userAvatar = user.avatar_url;
    socket.data.email = payload.email;

    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return next(new Error('认证令牌已过期，请重新登录'));
    }
    return next(new Error('认证令牌无效'));
  }
}

// ----------------------------------------------------------------
// 连接/断连生命周期管理
// ----------------------------------------------------------------

/**
 * 将 socket ID 注册到 Redis，标记用户在线
 * key: user:{userId}:sockets → SET 类型，支持多端同时在线
 */
async function onConnection(socket: Socket): Promise<void> {
  const userId = socket.data.userId as number;
  console.log(`[WebSocket] 用户 ${userId} 已连接 (socket: ${socket.id})`);
  registerChatHandlers(io, socket);

  // Redis: 将 socket.id 加入用户活跃 socket 集合
  try {
    await redis.sadd(`user:${userId}:sockets`, socket.id);
  } catch (err) {
    console.error(`[WebSocket] Redis sadd 失败 (userId=${userId}):`, (err as Error).message);
  }

}

/**
 * 断连时从 Redis 移除 socket ID
 * 若用户所有 socket 均已断开，删除 Redis key
 */
async function onDisconnect(socket: Socket): Promise<void> {
  const userId = socket.data.userId as number;
  console.log(`[WebSocket] 用户 ${userId} 已断开 (socket: ${socket.id})`);

  try {
    // 从集合中移除当前 socket
    await redis.srem(`user:${userId}:sockets`, socket.id);

    // 检查是否还有其他活跃连接，若全部断开则清理 key
    const remaining = await redis.scard(`user:${userId}:sockets`);
    if (remaining === 0) {
      await redis.del(`user:${userId}:sockets`);
    }
  } catch (err) {
    console.error(`[WebSocket] Redis srem 失败 (userId=${userId}):`, (err as Error).message);
  }
}

// ----------------------------------------------------------------
// 入口函数：创建并配置 Socket.IO Server
// ----------------------------------------------------------------

/**
 * 从 HTTP Server 创建 Socket.IO 实例，配置认证和事件监听
 *
 * 使用方式（在 app.ts 中）：
 *   const httpServer = http.createServer(app);
 *   const io = createWebSocketServer(httpServer);
 *   httpServer.listen(3000);
 *
 * @param httpServer - Node.js HTTP Server 实例
 * @returns 配置完成的 Socket.IO Server
 */
export function createWebSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    allowRequest: (req, callback) => callback(null, !isVercelRuntime || isAllowedOrigin(req.headers.origin)),
    // 生产环境建议配置 CORS
    cors: {
      origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
        callback(null, !isVercelRuntime || isAllowedOrigin(origin));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // 心跳配置：防止反向代理断开长连接
    pingInterval: 25000,
    pingTimeout: 20000,
    // 传输层：优先 WebSocket，降级到 HTTP 长轮询
    transports: isVercelRuntime ? ['websocket'] : ['websocket', 'polling'],
    destroyUpgrade: false, // The same HTTP server also owns the Xiaozhi ws bridge.
  });

  // 注册认证中间件
  io.use(authenticateSocket);

  // 连接事件
  io.on('connection', async (socket: Socket) => {
    await onConnection(socket);

    socket.on('disconnect', () => {
      onDisconnect(socket).catch((err) => {
        console.error('[WebSocket] onDisconnect 错误:', err.message);
      });
    });
  });

  // 初始化通知处理器（注入 IO 实例，解决循环依赖）
  initNotificationHandler(io);

  console.log('[WebSocket] Socket.IO 服务器已启动');
  return io;
}
