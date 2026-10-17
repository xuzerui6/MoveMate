import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { config } from './config';
import { isVercelRuntime } from './cloud';
import { authRequired } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';
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
import gymRoutes from './routes/gym.routes';
import { coachRouter } from './routes/coach.routes';
import {cloudUploadsRouter} from './routes/cloud-uploads.routes';
import { isAllowedOrigin } from './xiaozhi/identity';

// ================================================================
// Express 应用初始化
// ================================================================
export function createHttpApp(options: {
  initialize: () => Promise<void>;
  tick?: () => Promise<void>;
  uploads?: express.RequestHandler;
  staticDir?: string;
  maintenance?: express.RequestHandler;
}) {
const app = express();
if (isVercelRuntime || process.env.CLOUDFLARE === '1') app.set('trust proxy', 1);

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
  origin: isVercelRuntime
    ? (origin, callback) => callback(null, !origin || isAllowedOrigin(origin, process.env.CORS_ORIGIN))
    : corsOrigins.includes('*')
    ? true
    : (origin, callback) => {
        // 无 Origin 的请求（同源/curl）放行；有 Origin 的必须在白名单
        if (!origin || corsOrigins.includes(origin)) return callback(null, true);
        callback(new Error('CORS 不允许该来源'));
      },
  credentials: true,
}));
app.use('/api/v1/training-imports',express.json({limit:'2mb'}));
app.use(express.json());
if (options.maintenance) app.use(options.maintenance);
app.use(async (_req, _res, next) => {
  try { await options.initialize(); next(); }
  catch (error) { next(error); }
});
// Serverless instances cannot keep node-cron running between requests.
// Active clients advance the existing state machine; the daily cron handles idle periods.
let lastLifecycleTick = 0;
app.use('/api/v1', async (_req, _res, next) => {
  if (!options.tick || !isVercelRuntime || Date.now() - lastLifecycleTick < 60000) return next();
  try { await options.tick(); lastLifecycleTick = Date.now(); next(); }
  catch (error) { next(error); }
});
app.get('/api/cron', async (req, res, next) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' }); return;
  }
  try { await options.tick?.(); res.json({ status: 'ok' }); } catch (error) { next(error); }
});
app.use(coachRouter);

if (options.staticDir) app.use(express.static(options.staticDir));
if (options.uploads) app.use('/uploads', options.uploads);

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
app.use('/api/v1', gymRoutes);

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (options.staticDir) {
  app.get('*', (req, res, next) => {
    if (/^\/(api|ai|socket\.io|uploads|health)(\/|$)/.test(req.path)) return next();
    res.sendFile(path.join(options.staticDir!, 'index.html'));
  });
}

// 全局错误处理
app.use(errorHandler);

return app;
}
