import { pool, withTransaction } from '../../server/src/db/pool';
export { pool, PoolClient, withTransaction, afterCommit } from '../../server/src/db/pool';
export const getClient = () => pool.connect();
export async function testConnection() { await pool.query('SELECT 1'); return true; }

// Compatibility for notification counters/cooldowns, kept in the same actor database.
export const redis = {
  async get(key: string) {
    const row = (await pool.query('SELECT value FROM ephemeral_cache WHERE key=$1 AND (expires_at IS NULL OR expires_at>$2)', [key, Date.now()])).rows[0];
    return row?.value ?? null;
  },
  async exists(key: string) { return (await this.get(key)) === null ? 0 : 1; },
  async set(key: string, value: any, _mode?: string, ttl?: number) {
    await pool.query('INSERT INTO ephemeral_cache(key,value,expires_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=$2,expires_at=$3', [key, String(value), ttl ? Date.now() + ttl * 1000 : null]);
    return 'OK';
  },
  async incr(key: string) {
    return withTransaction(async () => { const n = Number(await this.get(key) || 0) + 1; await this.set(key, n); return n; });
  },
  async del(key: string) { return (await pool.query('DELETE FROM ephemeral_cache WHERE key=$1', [key])).rowCount; },
};
