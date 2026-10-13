/**
 * 数据库统一导出模块
 */
export { pool, PoolClient, withTransaction, afterCommit } from './pool';
import { pool, PoolClient } from './pool';

/** 获取专用客户端（用于事务操作） */
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

/** 测试数据库连接 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await pool.query("SELECT datetime('now') AS current_time");
    console.log(`[DB] 数据库连接成功，时间: ${result.rows[0]?.current_time}`);
    return true;
  } catch (err) {
    console.error('[DB] 数据库连接失败:', err);
    return false;
  }
}

// Redis 模拟（本地开发用内存 Map）
class MemoryRedis {
  private store = new Map<string, any>();
  private expirations = new Map<string, number>();

  async set(key: string, value: string, _mode?: string, ttl?: number) {
    this.store.set(key, value);
    if (ttl) this.expirations.set(key, Date.now() + ttl * 1000);
    return 'OK';
  }
  async get(key: string): Promise<string | null> {
    this._cleanup();
    return this.store.get(key) ?? null;
  }
  async del(key: string): Promise<number> {
    this.expirations.delete(key);
    return this.store.delete(key) ? 1 : 0;
  }
  async incr(key: string): Promise<number> {
    const val = (parseInt(this.store.get(key) ?? '0', 10)) + 1;
    this.store.set(key, String(val));
    return val;
  }
  async decr(key: string): Promise<number> {
    const val = Math.max(0, (parseInt(this.store.get(key) ?? '0', 10)) - 1);
    this.store.set(key, String(val));
    return val;
  }
  async sadd(key: string, member: string): Promise<number> {
    let arr = JSON.parse(this.store.get(key) ?? '[]');
    if (!arr.includes(member)) { arr.push(member); this.store.set(key, JSON.stringify(arr)); return 1; }
    return 0;
  }
  async srem(key: string, member: string): Promise<number> {
    const arr = JSON.parse(this.store.get(key) ?? '[]');
    const idx = arr.indexOf(member);
    if (idx >= 0) { arr.splice(idx, 1); this.store.set(key, JSON.stringify(arr)); return 1; }
    return 0;
  }
  async smembers(key: string): Promise<string[]> {
    return JSON.parse(this.store.get(key) ?? '[]');
  }
  async scard(key: string): Promise<number> {
    return JSON.parse(this.store.get(key) ?? '[]').length;
  }
  async exists(key: string): Promise<number> {
    this._cleanup();
    return this.store.has(key) ? 1 : 0;
  }
  async expire(key: string, ttl: number): Promise<number> {
    if (this.store.has(key)) { this.expirations.set(key, Date.now() + ttl * 1000); return 1; }
    return 0;
  }
  private _cleanup() {
    const now = Date.now();
    for (const [k, exp] of this.expirations) {
      if (exp <= now) { this.store.delete(k); this.expirations.delete(k); }
    }
  }
  on(_: string, __: Function) {}
}

export const redis = new MemoryRedis() as any;
