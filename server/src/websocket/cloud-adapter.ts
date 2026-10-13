import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server } from 'socket.io';
import { isVercelRuntime } from '../cloud';

let ready: Promise<void> | null = null;
let connections: Redis[] = [];

/** A shared adapter delivers messages across separate Vercel instances. */
export function ensureSocketAdapter(io: Server): Promise<void> {
  if (!isVercelRuntime) return Promise.resolve();
  if (ready) return ready;
  ready = (async () => {
    const url = process.env.REDIS_URL || process.env.KV_URL;
    if (!url) throw new Error('Missing REDIS_URL (or KV_URL) for cross-instance chat');
    const pub = new Redis(url, { lazyConnect: true, connectTimeout: 8000, maxRetriesPerRequest: 1 });
    const sub = pub.duplicate();
    connections = [pub, sub];
    connections.forEach(client => client.on('error', () => console.error('[Socket] Shared Redis connection unavailable')));
    await Promise.all([pub.connect(), sub.connect()]);
    io.adapter(createAdapter(pub, sub, { key: process.env.SOCKET_CHANNEL_PREFIX || 'movemate' }));
  })().catch(error => {
    connections.forEach(client => client.disconnect());
    connections = []; ready = null; throw error;
  });
  return ready;
}

export function closeSocketAdapter(): void {
  connections.forEach(client => client.disconnect());
  connections = []; ready = null;
}
