import { io } from 'socket.io-client';

type Listener = (...args: any[]) => void;
export interface RealtimeSocket {
  connected: boolean;
  on(event: string, listener: Listener): this;
  off(event: string, listener?: Listener): this;
  emit(event: string, data: any, ack?: Listener): this;
  timeout(ms: number): { emit(event: string, data: any, ack: Listener): unknown };
  connect(): this;
  disconnect(): this;
  removeAllListeners(): this;
}

/** Same subscription/ack contract as the local Socket.IO transport. */
export class CloudflareSocket implements RealtimeSocket {
  connected = false;
  private listeners = new Map<string, Set<Listener>>();
  private ws?: WebSocket;
  private stopped = true;
  private retries = 0;
  private retry?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private authDeadline?: ReturnType<typeof setTimeout>;
  private pending = new Map<string, { ack: Listener; timer: ReturnType<typeof setTimeout> }>();
  private lastPong = 0;
  constructor(private token: string) {}
  on(event: string, listener: Listener): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener); return this;
  }
  off(event: string, listener?: Listener): this {
    if (listener) this.listeners.get(event)?.delete(listener); else this.listeners.delete(event);
    return this;
  }
  removeAllListeners(): this { this.listeners.clear(); return this; }
  private dispatch(event: string, ...args: any[]) { this.listeners.get(event)?.forEach(fn => fn(...args)); }
  connect(): this {
    if (this.ws && this.ws.readyState < WebSocket.CLOSING) return this;
    this.stopped = false;
    clearTimeout(this.retry);
    const url = new URL('/api/realtime/socket', location.origin);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = this.ws = new WebSocket(url);
    this.authDeadline = setTimeout(() => ws.close(4000, 'authentication timeout'), 10000);
    ws.onopen = () => ws.send(JSON.stringify({ event: 'auth', data: { token: this.token } }));
    ws.onmessage = ({ data }) => {
      if (data === 'pong') { this.lastPong = Date.now(); return; }
      try {
        const message = JSON.parse(data);
        if (message.event === 'authenticated') {
          clearTimeout(this.authDeadline); this.connected = true; this.retries = 0; this.lastPong = Date.now();
          clearInterval(this.heartbeat);
          this.heartbeat = setInterval(() => {
            if (Date.now() - this.lastPong > 60000) ws.close(4000, 'heartbeat timeout');
            else if (ws.readyState === WebSocket.OPEN) ws.send('ping');
          }, 25000);
          this.dispatch('connect'); return;
        }
        if (message.event === 'ack' && message.requestId) {
          const pending = this.pending.get(message.requestId);
          if (pending) { clearTimeout(pending.timer); this.pending.delete(message.requestId); pending.ack(null, message.data); }
          return;
        }
        this.dispatch(message.event, message.data);
      } catch { this.dispatch('error', { message: '实时消息格式无效' }); }
    };
    ws.onerror = () => this.dispatch('connect_error', new Error('实时连接失败，正在重连'));
    ws.onclose = ({ code }) => {
      if (this.ws !== ws) return;
      clearTimeout(this.authDeadline); clearInterval(this.heartbeat);
      this.connected = false; this.ws = undefined;
      this.pending.forEach(({ ack, timer }) => { clearTimeout(timer); ack(new Error('连接已断开')); });
      this.pending.clear(); this.dispatch('disconnect');
      if (code === 4401 || code === 4403) { this.stopped = true; this.dispatch('connect_error', new Error('登录已过期，请重新登录')); }
      if (!this.stopped) this.retry = setTimeout(() => this.connect(), Math.min(15000, 1000 * 2 ** Math.min(this.retries++, 4)));
    };
    return this;
  }
  emit(event: string, data: any, ack?: Listener): this {
    return this.send(event, data, ack ? (_error, reply) => ack(reply) : undefined, 10000);
  }
  timeout(ms: number) { return { emit: (event: string, data: any, ack: Listener) => this.send(event, data, ack, ms) }; }
  private send(event: string, data: any, ack: Listener | undefined, ms: number): this {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) { ack?.(new Error('连接未建立')); return this; }
    const requestId = ack ? crypto.randomUUID() : undefined;
    if (ack && requestId) this.pending.set(requestId, { ack, timer: setTimeout(() => {
      this.pending.delete(requestId); ack(new Error('请求超时'));
    }, ms) });
    this.ws.send(JSON.stringify({ event, data, requestId })); return this;
  }
  disconnect(): this {
    this.stopped = true; clearTimeout(this.retry); clearInterval(this.heartbeat); clearTimeout(this.authDeadline);
    this.ws?.close(1000, 'account disconnected'); return this;
  }
}

export function createRealtimeSocket(token: string): RealtimeSocket {
  if (import.meta.env.VITE_REALTIME_TRANSPORT === 'cloudflare') return new CloudflareSocket(token);
  return io('/', {
    path: import.meta.env.VITE_WEBSOCKET_ONLY === 'true' ? '/socket.io/connect' : '/socket.io',
    addTrailingSlash: import.meta.env.VITE_WEBSOCKET_ONLY !== 'true',
    autoConnect: false, auth: { token },
    transports: import.meta.env.VITE_WEBSOCKET_ONLY === 'true' ? ['websocket'] : ['websocket', 'polling'],
    reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1000, timeout: 10000,
  });
}
