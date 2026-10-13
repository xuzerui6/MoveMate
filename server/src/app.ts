// 抑制 node:sqlite 的 ExperimentalWarning（Node 22+ 内置，稳定可用，仅 API 标记实验）
process.removeAllListeners('warning');

import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { config } from './config';
import { authRequired } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';
import { testConnection } from './db';
import { startAllCronJobs, stopAllCronJobs } from './cron/state-machine';

// 路由模块
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import gameRoutes from './routes/game.routes';
import notificationRoutes from './routes/notification.routes';
import messageRoutes from './routes/message.routes';
import feedbackRoutes from './routes/feedback.routes';
import adminRoutes from './routes/admin.routes';
import verifyRoutes from './routes/verify.routes';
import checkinRoutes from './routes/checkin.routes';
import motionRoutes from './routes/motion.routes';
import { coachRouter } from './routes/coach.routes';
import { attachXiaozhi } from './xiaozhi/socket';

// ================================================================
// Express 应用初始化
// ================================================================
const app = express();

// 安全响应头（nosniff / X-Frame-Options / CSP 等）
app.use(helmet({
  // 开发/本地环境不强制 HTTPS，允许降级
  hsts: false,
  contentSecurityPolicy: { directives: { 'script-src': ["'self'", "'wasm-unsafe-eval'"], 'connect-src':["'self'",'ws:','wss:'], 'img-src':["'self'",'data:','blob:'], 'media-src':["'self'",'blob:'], 'worker-src':["'self'",'blob:'] } },
}));

// CORS —— 白名单（config.corsOrigin，逗号分隔；默认本地开发地址 + 生产域名）
const corsOrigins = (config.corsOrigin || '*')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: corsOrigins.includes('*')
    ? true
    : (origin, callback) => {
        // 无 Origin 的请求（同源/curl）放行；有 Origin 的必须在白名单
        if (!origin || corsOrigins.includes(origin)) return callback(null, true);
        callback(new Error('CORS 不允许该来源'));
      },
  credentials: true,
}));
app.use(express.json());
app.use(coachRouter);

// 生产模式：托管前端静态文件
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) {
  console.log('[静态文件] 托管前端: ' + publicDir);
  app.use(express.static(publicDir));
}

// 托管用户上传文件（独立目录，不会被 vite build 覆盖）
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// 认证中间件（跳过 auth 和 verify 路由）
app.use('/api/v1', (req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path.startsWith('/verify/') || req.path.startsWith('/checkin/')) return next();
  authRequired(req, res, next);
});

// 路由注册
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/verify', verifyRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/games', gameRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/games/:id/messages', messageRoutes);
app.use('/api/v1/feedback', feedbackRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/checkin', checkinRoutes);
app.use('/api/v1', motionRoutes);

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback: 所有非 API 路由返回 index.html
if (fs.existsSync(publicDir)) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// 全局错误处理
app.use(errorHandler);

// ================================================================
// HTTP Server + Socket.IO
// ================================================================
const server = http.createServer(app);

// 使用完整的 WebSocket 模块（含聊天 send_message 处理）
import { createWebSocketServer } from './websocket/index';
const io = createWebSocketServer(server);
const xiaozhi = attachXiaozhi(server);

function getLanUrls(port: number): string[] {
  const interfaces = os.networkInterfaces();
  const urls = new Set<string>();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      urls.add(`http://${address.address}:${port}`);
    }
  }

  return Array.from(urls);
}

// ================================================================
// 服务启动
// ================================================================
async function start(): Promise<void> {
  const dbOk = await testConnection();
  if (!dbOk) {
    throw new Error('数据库初始化失败，服务启动已停止');
  }

  startAllCronJobs();

  server.listen(config.port, config.host, () => {
    const lanUrls = config.host === '0.0.0.0' ? getLanUrls(config.port) : [];
    console.log(`\n========================================`);
    console.log(`  动伴 · 训练与搭个局 服务已启动`);
    console.log(`  端口: ${config.port}`);
    console.log(`  本机: http://localhost:${config.port}`);
    if (lanUrls.length > 0) {
      console.log(`  局域网访问地址:`);
      lanUrls.forEach((url) => console.log(`    ${url}`));
    } else if (config.host === '0.0.0.0') {
      console.log(`  局域网访问地址: 未检测到可用 IPv4`);
    }
    console.log(`  API:  http://localhost:${config.port}/api/v1`);
    console.log(`  WS:   ws://localhost:${config.port}`);
    console.log(`========================================\n`);
  });
}

// 优雅关闭
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[关闭] 收到 ${signal} 信号，正在优雅关闭...`);
  stopAllCronJobs();
  if (io) io.close();
  xiaozhi.clients.forEach((client)=>client.close());
  xiaozhi.close();
  server.close(() => { console.log('[关闭] HTTP 服务已停止'); process.exit(0); });
  setTimeout(() => { process.exit(1); }, 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (require.main === module) start().catch((err) => {
  console.error('[启动] 启动失败:', err);
  process.exit(1);
});

export { app, server, io, start, shutdown };
