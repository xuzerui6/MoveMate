import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { pool, withTransaction } from './db/pool';

export const SOURCE_TABLES = ['schools','campuses','venues','users','games','game_members','chat_messages','notifications','feedback','motion_profiles','sport_sessions','sport_intervals','xp_ledger','email_codes','uploaded_avatars'];
let initialized: Promise<void> | undefined;
const enabled = () => process.env.CLOUDFLARE !== '1' && Boolean(process.env.TURSO_DATABASE_URL);
async function init() {
  if (!initialized) initialized = pool.query('CREATE TABLE IF NOT EXISTS migration_control(key TEXT PRIMARY KEY,value TEXT NOT NULL)').then(() => {}).catch(error => { initialized = undefined; throw error; });
  await initialized;
}
export async function sourceMaintenance(): Promise<boolean> {
  if (!enabled()) return false;
  await init();
  return Boolean((await pool.query("SELECT value FROM migration_control WHERE key='frozen_at'")).rowCount);
}
const encode = (value: any) => value instanceof ArrayBuffer || ArrayBuffer.isView(value)
  ? { $blob: Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)).toString('base64') }
  : value;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Only the existing privileged deployment secret can control/export the source. */
export const sourceMigrationMiddleware: RequestHandler = async (request, response, next) => {
  if (!enabled()) { next(); return; }
  try {
    await init();
    if (request.path.startsWith('/api/source-migration/')) {
      const secret = process.env.CRON_SECRET;
      const actual = Buffer.from(request.headers.authorization || ''), expected = Buffer.from('Bearer ' + secret);
      if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) { response.status(401).end(); return; }
      response.setHeader('Cache-Control', 'no-store');
      const action = request.path.split('/').pop();
      if (action === 'status' && request.method === 'GET') {
        response.json({ frozen: await sourceMaintenance(), control: (await pool.query('SELECT key,value FROM migration_control')).rows }); return;
      }
      if (action === 'freeze' && request.method === 'POST') {
        await withTransaction(async () => {
          // Database triggers cover old immutable deployments and already-open sockets,
          // whose application code may predate the maintenance middleware.
          for (const table of SOURCE_TABLES) for (const operation of ['INSERT','UPDATE','DELETE']) {
            await pool.query(`CREATE TRIGGER IF NOT EXISTS freeze_${table}_${operation} BEFORE ${operation} ON ${table}
              WHEN EXISTS(SELECT 1 FROM migration_control WHERE key='frozen_at') BEGIN SELECT RAISE(ABORT,'MoveMate source is in migration maintenance'); END`);
          }
          await pool.query("INSERT INTO migration_control(key,value) VALUES('frozen_at',$1) ON CONFLICT(key) DO NOTHING", [new Date().toISOString()]);
        });
        response.json({ frozen: true }); return;
      }
      if (action === 'export' && request.method === 'POST') {
        const snapshot = await withTransaction(async () => {
          const frozen = (await pool.query("SELECT value FROM migration_control WHERE key='frozen_at'")).rows[0]?.value;
          if (!frozen || Date.now() - Date.parse(frozen) < 305000) throw new Error('Freeze source and drain old connections for at least 305 seconds');
          const tables = [], parts = [];
          for (const name of SOURCE_TABLES) {
            const info = (await pool.query(`PRAGMA table_info(${name})`)).rows;
            const columns = info.map(c => c.name);
            const order = info.filter(c => c.pk).sort((a,b) => a.pk - b.pk).map(c => c.name);
            const result = await pool.query(`SELECT * FROM ${name} ORDER BY ${order.join(',')}`);
            // pool normalizes date/boolean API values; export raw SQLite-compatible
            // representations consistently so target verification uses the same bytes.
            const rows = result.rows.map(row => columns.map(c => {
              const value = row[c];
              return typeof value === 'boolean' ? Number(value) : encode(value);
            }));
            tables.push({ name, columns, order, count: rows.length, digest: hash(rows) });
            let chunk: any[][] = [], size = 0;
            for (const row of rows) {
              const bytes = Buffer.byteLength(JSON.stringify(row));
              if (chunk.length && (chunk.length >= 50 || size + bytes > 6000000)) { parts.push({ table: name, rows: chunk }); chunk = []; size = 0; }
              chunk.push(row); size += bytes;
            }
            if (chunk.length) parts.push({ table: name, rows: chunk });
          }
          const manifest = { id: hash(tables), source: 'Vercel/Turso', createdAt: new Date().toISOString(), tables };
          return { manifest, parts: parts.map((part,index) => ({ ...part, snapshot: manifest.id, part: index, hash: hash(part.rows) })) };
        });
        response.json(snapshot); return;
      }
      if (action === 'seal' && request.method === 'POST' && await sourceMaintenance()) {
        await pool.query("INSERT INTO migration_control(key,value) VALUES('sealed_at',$1) ON CONFLICT(key) DO NOTHING", [new Date().toISOString()]);
        response.json({ sealed: true }); return;
      }
      response.status(404).end(); return;
    }
    if (await sourceMaintenance()) {
      response.setHeader('Retry-After', '300');
      response.status(503).json({ code: 50300, message: 'MoveMate 已迁移至 https://dongban.xyz，旧站维护中', data: null }); return;
    }
    next();
  } catch (error) { next(error); }
};
