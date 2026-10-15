import { DurableObject } from 'cloudflare:workers';
import { handleAsNodeRequest } from 'cloudflare:node';
import { createServer } from 'node:http';
import { createHttpApp } from '../../server/src/http-app';
import { cloudUploadsRouter } from '../../server/src/routes/cloud-uploads.routes';
import { DatabaseScope, runWithDatabaseScope } from '../../server/src/db/scope';
import { pool, withTransaction } from '../../server/src/db/pool';
import { verifyToken } from '../../server/src/utils/jwt';
import { canReadMessages, canSendMessage, saveMessage, notifyGameMembers } from '../../server/src/services/chat.service';
import { runCronTick } from '../../server/src/cron/state-machine';
import { ActorDatabase } from './db';
import { withEvents, type EventSink } from './events';
import { Migration, authorized } from './migration';
import { bridgeXiaozhi } from './xiaozhi';

interface Env {
  ASSETS: Fetcher;
  BACKEND: DurableObjectNamespace<MoveMateBackend>;
  INSTANCE: string;
  MIGRATION_SECRET: string;
  JWT_SECRET: string;
  STUDENT_ID_SALT: string;
  XIAOZHI_COOKIE_SECRET: string;
}
type Identity = { userId?: number; exp?: number; rooms: number[]; deadline: number };

// HTTP only. Upgrade handling uses native WebSocket APIs, never Node upgrade listeners.
const app = createHttpApp({ initialize: async () => { await pool.query('SELECT 1'); }, uploads: cloudUploadsRouter });
const http = createServer(app);
http.listen(3001);

export class MoveMateBackend extends DurableObject<Env> implements EventSink {
  private db: ActorDatabase;
  private scope: DatabaseScope;
  private migration: Migration;
  private ready: Promise<void>;
  private tick?: Promise<void>;
  private generation = crypto.randomUUID();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = new ActorDatabase(ctx.storage);
    this.scope = new DatabaseScope(this.db);
    this.migration = new Migration(this.db);
    this.ready = ctx.blockConcurrencyWhile(async () => { await ctx.storage.transaction(async () => this.db.bootstrap()); });
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  private run<T>(fn: () => T): T { return runWithDatabaseScope(this.scope, () => withEvents(this, fn)); }
  private attachment(ws: WebSocket): Identity { return ws.deserializeAttachment() as Identity; }
  private send(ws: WebSocket, event: string, data: any, requestId?: string) {
    try { ws.send(JSON.stringify({ event, data, ...(requestId ? { requestId } : {}) })); }
    catch { try { ws.close(1011, 'send failed'); } catch {} }
  }
  private authenticated(ws: WebSocket): Identity | null {
    const identity = this.attachment(ws);
    if (!identity?.userId || !identity.exp || identity.exp * 1000 <= Date.now()) return null;
    return identity;
  }
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    for (const secret of ['JWT_SECRET', 'STUDENT_ID_SALT', 'XIAOZHI_COOKIE_SECRET'] as const) {
      if (!this.env[secret] || this.env[secret].length < 32) return Response.json({ error: 'Missing deployment secret' }, { status: 503 });
    }
    return this.run(async () => {
      const path = new URL(request.url).pathname;
      if (path.startsWith('/api/migration/')) {
        if (!authorized(request, this.env.MIGRATION_SECRET)) return new Response('Unauthorized', { status: 401 });
        // Migration commands share the actor's database operation queue.
        if (path === '/api/migration/diagnostics') return Response.json((await pool.query("SELECT value FROM actor_meta WHERE key='voice_diagnostic'")).rows.map(row => JSON.parse(row.value)));
        const result = await withTransaction(() => this.migration.handle(request));
        await this.schedule(); return result;
      }
      if (!this.migration.active()) return Response.json({ code: 50300, message: '系统迁移维护中，请稍后再试', data: null }, { status: 503, headers: { 'Retry-After': '60' } });
      if (path === '/api/realtime/socket') {
        const origin = request.headers.get('origin');
        if (!origin || origin !== new URL(request.url).origin) return new Response('Forbidden origin', { status: 403 });
        if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({ rooms: [], deadline: Date.now() + 10000 } satisfies Identity);
        await this.schedule();
        return new Response(null, { status: 101, webSocket: client });
      }
      if (path === '/api/xiaozhi/socket') return bridgeXiaozhi(request, (stage, detail) => this.run(() => withTransaction(async () => {
        const previous = (await pool.query("SELECT value FROM actor_meta WHERE key='voice_diagnostic'")).rows[0]?.value;
        const parsed = previous ? JSON.parse(previous) : [];
        const history = Array.isArray(parsed) ? parsed : [parsed];
        history.push({ stage, detail, time: new Date().toISOString() });
        await pool.query("INSERT INTO actor_meta(key,value) VALUES('voice_diagnostic',$1) ON CONFLICT(key) DO UPDATE SET value=$1", [JSON.stringify(history.slice(-24))]);
      })));
      if (path === '/api/cron') return new Response('Use Durable Object alarms', { status: 404 });
      const response = await handleAsNodeRequest(3001, request);
      // Consume the response while the actor scope is still active. Express may finish
      // writes after response headers; waiting here also makes outbox delivery reliable.
      const bytes = await response.arrayBuffer();
      await this.deliverCommittedEvents();
      await this.schedule();
      const headers = new Headers(response.headers);
      if (path === '/health') headers.set('X-MoveMate-Actor-Generation', this.generation);
      return new Response(bytes, { status: response.status, headers });
    });
  }
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.ready;
    return this.run(async () => {
      if (!this.migration.active()) { ws.close(1013, 'maintenance'); return; }
      if (typeof raw !== 'string' || raw.length > 8192) { ws.close(1009, 'message too large'); return; }
      let message: { event: string; data?: any; requestId?: string };
      try { message = JSON.parse(raw); } catch { ws.close(1007, 'invalid JSON'); return; }
      const ack = (data: any) => message.requestId ? this.send(ws, 'ack', data, message.requestId) : undefined;
      if (!this.authenticated(ws)) {
        const attachment = this.attachment(ws);
        if (message.event !== 'auth' || attachment?.userId || attachment.deadline < Date.now()) { ws.close(4401, 'authentication required'); return; }
        try {
          const claims = verifyToken(message.data?.token || '');
          const user = (await pool.query('SELECT id FROM users WHERE id=$1', [claims.sub])).rows[0];
          if (!user || !claims.exp) throw new Error('Unknown account');
          ws.serializeAttachment({ userId: user.id, exp: claims.exp, rooms: [], deadline: 0 } satisfies Identity);
          this.send(ws, 'authenticated', { userId: user.id });
        } catch { ws.close(4401, 'invalid credentials'); }
        await this.schedule(); return;
      }
      const identity = this.authenticated(ws)!;
      const gameId = Number(message.data?.gameId);
      if (!Number.isSafeInteger(gameId) || gameId < 1) { ack({ error: '缺少有效 gameId' }); return; }
      if (message.event === 'leave_room') {
        identity.rooms = identity.rooms.filter(id => id !== gameId); ws.serializeAttachment(identity); ack({ ok: true }); return;
      }
      try {
        if (message.event === 'join_room') {
          const game = (await pool.query('SELECT g.status FROM games g JOIN game_members gm ON gm.game_id=g.id WHERE g.id=$1 AND gm.user_id=$2 AND gm.left_at IS NULL', [gameId, identity.userId])).rows[0];
          if (!game || !canReadMessages(game.status)) throw new Error('你未加入该局，或聊天已关闭');
          identity.rooms = [...new Set([...identity.rooms, gameId])];
          if (identity.rooms.length > 25) throw new Error('加入的房间过多');
          ws.serializeAttachment(identity);
          this.send(ws, 'chat_mode', { gameId, chatMode: canSendMessage(game.status) ? 'active' : 'readonly' }); ack({ ok: true });
        } else if (message.event === 'send_message') {
          const content = message.data?.content;
          if (typeof content !== 'string' || !content.trim() || content.length > 500) throw new Error('消息不能为空且不能超过 500 字');
          const payload = await withTransaction(async () => {
            const game = (await pool.query('SELECT g.status FROM games g JOIN game_members gm ON gm.game_id=g.id WHERE g.id=$1 AND gm.user_id=$2 AND gm.left_at IS NULL', [gameId, identity.userId])).rows[0];
            if (!game || !canSendMessage(game.status)) throw new Error('当前活动不可发送消息');
            const user = (await pool.query('SELECT nickname,avatar_url FROM users WHERE id=$1', [identity.userId])).rows[0];
            const saved = await saveMessage(gameId, identity.userId!, content.trim());
            return { id: saved.id, gameId, sender: { id: identity.userId, nickname: user.nickname, avatar: user.avatar_url }, content: saved.content, createdAt: saved.created_at, created_at: saved.created_at };
          });
          this.broadcast(gameId, 'new_message', payload); ack({ message: payload });
          await notifyGameMembers(gameId, identity.userId!, content.trim());
        } else ack({ error: '未知事件' });
      } catch (error) {
        const detail = error instanceof Error ? error.message : '操作失败';
        ack({ error: detail }); this.send(ws, 'error', { message: detail });
      }
      await this.deliverCommittedEvents(); await this.schedule();
    });
  }
  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> { try { ws.close(code, reason); } catch {} }
  async webSocketError(ws: WebSocket): Promise<void> { ws.close(1011, 'connection error'); }
  private eligible(ws: WebSocket, gameId: number, excludeUserId?: number): boolean {
    const identity = this.authenticated(ws);
    if (!identity || identity.userId === excludeUserId || !identity.rooms.includes(gameId)) return false;
    // Re-check the database after hibernation and before every private broadcast.
    const row = this.ctx.storage.sql.exec('SELECT g.status FROM game_members m JOIN games g ON g.id=m.game_id WHERE m.game_id=? AND m.user_id=? AND m.left_at IS NULL', gameId, identity.userId!).toArray()[0];
    if (row && canReadMessages(String(row.status) as any)) return true;
    identity.rooms = identity.rooms.filter(id => id !== gameId); ws.serializeAttachment(identity); return false;
  }
  broadcast(gameId: number, event: string, data: any, excludeUserId?: number): void {
    for (const ws of this.ctx.getWebSockets()) if (this.eligible(ws, gameId, excludeUserId)) this.send(ws, event, data);
  }
  revoke(gameId: number, userId: number): void {
    for (const ws of this.ctx.getWebSockets()) {
      const identity = this.attachment(ws);
      if (identity?.userId === userId) { identity.rooms = identity.rooms.filter(id => id !== gameId); ws.serializeAttachment(identity); }
    }
  }
  async push(userId: number, data: any): Promise<void> {
    // Persisted notifications are delivered by the atomic SQL outbox trigger.
    if (data.id) return;
    for (const ws of this.ctx.getWebSockets()) if (this.authenticated(ws)?.userId === userId) this.send(ws, 'notification', data);
  }
  private async flushOutbox(): Promise<void> {
    const rows = (await pool.query('SELECT * FROM event_outbox ORDER BY id LIMIT 500')).rows;
    for (const row of rows) {
      const data = JSON.parse(String(row.payload));
      if (row.event === 'notification') {
        for (const ws of this.ctx.getWebSockets()) if (this.authenticated(ws)?.userId === data.userId) this.send(ws, 'notification', data);
      } else this.broadcast(data.gameId, String(row.event), data);
      await pool.query('DELETE FROM event_outbox WHERE id=$1', [row.id]);
    }
  }
  private async deliverCommittedEvents(): Promise<void> {
    try { await this.flushOutbox(); }
    catch (error) { console.error('[Outbox] Delivery deferred to alarm', error instanceof Error ? error.message : 'delivery failed'); }
  }
  private async schedule(): Promise<void> {
    const deadlines = this.ctx.getWebSockets().map(ws => this.attachment(ws)).filter(id => !id.userId).map(id => id.deadline);
    if (this.migration.active()) {
      const pending = (await pool.query("SELECT 1 FROM games WHERE status IN ('recruiting','full','ready','in_progress','completed') LIMIT 1")).rowCount;
      const outbox = (await pool.query('SELECT 1 FROM event_outbox LIMIT 1')).rowCount;
      if (pending || outbox) {
        if (!this.migration.meta('lifecycle_due')) this.migration.set('lifecycle_due', String(Math.ceil((Date.now() + 1) / 60000) * 60000));
        deadlines.push(Number(this.migration.meta('lifecycle_due')));
      } else this.migration.set('lifecycle_due', '');
    }
    const existing = await this.ctx.storage.getAlarm();
    if (!deadlines.length) { if (existing) await this.ctx.storage.deleteAlarm(); return; }
    const deadline = Math.max(Date.now() + 1, Math.min(...deadlines));
    if (!existing || existing > deadline || existing < Date.now()) await this.ctx.storage.setAlarm(deadline);
  }
  async alarm(): Promise<void> {
    await this.ready;
    await this.run(async () => {
      for (const ws of this.ctx.getWebSockets()) {
        const identity = this.attachment(ws);
        if (!identity?.userId && identity.deadline <= Date.now()) ws.close(4401, 'authentication timeout');
        else if (identity.exp && identity.exp * 1000 <= Date.now()) ws.close(4401, 'session expired');
      }
      if (this.migration.active() && Number(this.migration.meta('lifecycle_due') || Infinity) <= Date.now()) {
        if (!this.tick) this.tick = runCronTick().finally(() => { this.tick = undefined; });
        await this.tick; await this.flushOutbox();
        this.migration.set('lifecycle_due', '');
        this.ctx.storage.sql.exec('DELETE FROM ephemeral_cache WHERE expires_at<?', Date.now());
        this.ctx.storage.sql.exec('DELETE FROM email_codes WHERE expires_at<?', Date.now());
      }
      await this.schedule();
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === 'www.dongban.xyz') { url.hostname = 'dongban.xyz'; return Response.redirect(url.toString(), 308); }
    if (/^\/(api|ai|uploads|health)(\/|$)/.test(url.pathname)) {
      const id = env.BACKEND.idFromName(env.INSTANCE || 'production');
      return env.BACKEND.get(id, { locationHint: 'apac' }).fetch(request);
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    // Vite content hashes make long browser caching safe. Keep HTML revalidated.
    if (url.pathname.startsWith('/assets/')) {
      // An SPA fallback is not a valid script. Never cache a temporary missing
      // chunk's HTML response for a year: that would keep a tab broken even
      // after the matching asset is deployed.
      if (!response.ok || headers.get('Content-Type')?.includes('text/html')) {
        return new Response('Asset not found', { status: 404, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain', 'X-Content-Type-Options': 'nosniff' } });
      }
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
    else if (headers.get('Content-Type')?.includes('text/html')) headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'camera=(self), microphone=(self)');
    return new Response(response.body, { status: response.status, headers });
  },
} satisfies ExportedHandler<Env>;
