import { pool, withTransaction } from '../../server/src/db/pool';
import type { RequestHandler } from 'express';
export default function rateLimit(options: { windowMs: number; max: number; message: unknown }): RequestHandler {
  return async (request, response, next) => {
    try {
      const key = `rate:${options.max}:${request.headers['cf-connecting-ip'] || request.ip}`;
      const result = await withTransaction(async () => {
        const row = (await pool.query('SELECT value,expires_at FROM ephemeral_cache WHERE key=$1', [key])).rows[0];
        const expires = row && Number(row.expires_at) > Date.now() ? Number(row.expires_at) : Date.now() + options.windowMs;
        const count = row && Number(row.expires_at) > Date.now() ? Number(row.value) + 1 : 1;
        await pool.query('INSERT INTO ephemeral_cache(key,value,expires_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=$2,expires_at=$3', [key, String(count), expires]);
        return { count, expires };
      });
      response.setHeader('RateLimit-Limit', options.max);
      response.setHeader('RateLimit-Remaining', Math.max(0, options.max - result.count));
      if (result.count > options.max) {
        response.setHeader('Retry-After', Math.ceil((result.expires - Date.now()) / 1000));
        response.status(429).json(options.message); return;
      }
      next();
    } catch (error) { next(error); }
  };
}
