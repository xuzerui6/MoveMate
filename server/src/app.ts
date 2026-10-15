// 抑制 node:sqlite 的 ExperimentalWarning（Node 22+ 内置，稳定可用，仅 API 标记实验）
process.removeAllListeners('warning');

import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { config } from './config';
import { testConnection } from './db';
import { startAllCronJobs, stopAllCronJobs, runCronTick } from './cron/state-machine';
import { ensureCloudRuntime, isVercelRuntime } from './cloud';
import { ensureSocketAdapter, closeSocketAdapter } from './websocket/cloud-adapter';

import { createHttpApp } from './http-app';
import { sourceMigrationMiddleware } from './source-migration';
import { attachXiaozhi } from './xiaozhi/socket';
import { cloudUploadsRouter } from './routes/cloud-uploads.routes';
const publicDir = path.join(__dirname, '..', 'public');
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!process.env.TURSO_DATABASE_URL && !isVercelRuntime && !fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const app = createHttpApp({
  initialize: async () => { await ensureCloudRuntime(); await ensureSocketAdapter(io); },
  tick: runCronTick,
  maintenance: sourceMigrationMiddleware,
  uploads: process.env.TURSO_DATABASE_URL ? cloudUploadsRouter : express.static(uploadsDir),
  staticDir: !isVercelRuntime && fs.existsSync(publicDir) ? publicDir : undefined,
});

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
  await ensureCloudRuntime();
  await ensureSocketAdapter(io);
  const dbOk = await testConnection();
  if (!dbOk) {
    throw new Error('数据库初始化失败，服务启动已停止');
  }

  if (!isVercelRuntime) startAllCronJobs();

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
  closeSocketAdapter();
  if (io) io.close();
  xiaozhi.clients.forEach((client)=>client.close());
  xiaozhi.close();
  server.close(() => { console.log('[关闭] HTTP 服务已停止'); process.exit(0); });
  setTimeout(() => { process.exit(1); }, 5000);
}

if (!isVercelRuntime) {
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (!isVercelRuntime && require.main === module) start().catch((err) => {
  console.error('[启动] 启动失败:', err);
  process.exit(1);
});

export { app, server, io, start, shutdown };
// CLI 63's local Node runner discovers HTTP servers through its intercepted listen().
// The port is supplied only by that runner, which owns the actual local listener.
if (process.env.VERCEL_DEV_PORT) server.listen(0);
// Vercel's HTTP-server export retains both Socket.IO and Xiaozhi upgrade listeners.
export default server;
