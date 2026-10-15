import { withTransaction } from '../../server/src/db/pool';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { ActorDatabase } from './db';
import { readAvatar, saveAvatar } from '../../server/src/storage/avatars';

export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export type TableManifest = { name: string; columns: string[]; count: number; digest: string; order: string[] };
export type Manifest = { id: string; tables: TableManifest[]; source: string; createdAt: string };
const identifier = (name: string) => { if (!/^[a-z_][a-z_0-9]*$/i.test(name)) throw new Error('Invalid identifier'); return '"' + name + '"'; };
const allowed = new Set(['schools','campuses','venues','users','games','game_members','chat_messages','notifications','feedback','motion_profiles','sport_sessions','sport_intervals','xp_ledger','email_codes','uploaded_avatars']);
export const encode = (value: any): any => value instanceof ArrayBuffer || ArrayBuffer.isView(value) ? { $blob: Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value).toString('base64') } : value;
const decode = (value: any): any => value && typeof value === 'object' && typeof value.$blob === 'string' ? Buffer.from(value.$blob, 'base64') : value;
export function authorized(request: Request, secret?: string): boolean {
  if (!secret || secret.length < 32) return false;
  const actual = Buffer.from(request.headers.get('Authorization') || '');
  const expected = Buffer.from('Bearer ' + secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class Migration {
  constructor(private db: ActorDatabase) {}
  meta(key: string): string | undefined { return this.db.storage.sql.exec('SELECT value FROM actor_meta WHERE key=?', key).toArray()[0]?.value as string | undefined; }
  set(key: string, value: string) { this.db.storage.sql.exec('INSERT INTO actor_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value); }
  active() { return this.meta('active') === 'true'; }
  async handle(request: Request): Promise<Response> {
    const action = new URL(request.url).pathname.split('/').pop();
    try {
      const body = request.method === 'POST' ? await request.json() : null;
      if (action === 'status' && request.method === 'GET') return Response.json({ active: this.active(), manifest: JSON.parse(this.meta('manifest') || 'null'), verified: this.meta('verified') || null, parts: this.db.storage.sql.exec('SELECT snapshot,part,hash FROM import_checkpoints ORDER BY part').toArray() });
      if (action === 'begin' && request.method === 'POST') {
        const manifest = body as Manifest;
        if (!manifest.id || !Array.isArray(manifest.tables) || manifest.tables.length !== allowed.size || new Set(manifest.tables.map(t => t.name)).size !== allowed.size || manifest.tables.some(t => !allowed.has(t.name) || !t.columns.length || !t.order.length || !Number.isSafeInteger(t.count) || t.count < 0 || !t.order.every(c => t.columns.includes(c)))) throw new Error('Invalid manifest');
        manifest.tables.forEach(t => { t.columns.forEach(identifier); t.order.forEach(identifier); });
        await withTransaction(async () => {
          const previous = this.meta('manifest');
          if (previous) { if (hash(JSON.parse(previous)) !== hash(manifest)) throw new Error('A different snapshot already exists'); return; }
          if (this.active()) throw new Error('An active database cannot be overwritten');
          for (const table of allowed) {
            if (table === 'uploaded_avatars') continue;
            if (Number(this.db.storage.sql.exec(`SELECT COUNT(*) AS n FROM ${identifier(table)}`).one().n)) throw new Error('Target database is not empty');
          }
          if (Number(this.db.storage.sql.exec('SELECT COUNT(*) AS n FROM avatar_files').one().n)) throw new Error('Target avatars are not empty');
          this.set('manifest', JSON.stringify(manifest));
        });
        return Response.json({ ok: true, snapshot: manifest.id });
      }
      if (action === 'part' && request.method === 'POST') {
        if (this.active()) throw new Error('Import is closed');
        const manifest = JSON.parse(this.meta('manifest') || 'null') as Manifest | null;
        const part = body as { snapshot: string; part: number; table: string; rows: any[][]; hash: string };
        const table = manifest?.tables.find(t => t.name === part.table);
        if (!manifest || part.snapshot !== manifest.id || !table || !Number.isSafeInteger(part.part) || part.part < 0 || !Array.isArray(part.rows) || part.rows.length > 100 || part.rows.some(row => row.length !== table.columns.length) || hash(part.rows) !== part.hash) throw new Error('Invalid import part');
        await withTransaction(async () => {
          const old = this.db.storage.sql.exec('SELECT hash FROM import_checkpoints WHERE snapshot=? AND part=?', part.snapshot, part.part).toArray()[0];
          if (old) { if (old.hash !== part.hash) throw new Error('Checkpoint hash differs'); return; }
          const next = Number(this.db.storage.sql.exec('SELECT COUNT(*) AS n FROM import_checkpoints').one().n);
          if (part.part !== next) throw new Error('Out of order part');
          for (const row of part.rows) {
            const values = row.map(decode);
            if (table.name === 'uploaded_avatars') {
              const item = Object.fromEntries(table.columns.map((column, index) => [column, values[index]]));
              await saveAvatar(item.id, item.user_id, item.content, item.content_type);
              this.db.storage.sql.exec('UPDATE avatar_files SET created_at=? WHERE id=?', item.created_at, item.id);
            } else this.db.storage.sql.exec(`INSERT INTO ${identifier(table.name)} (${table.columns.map(identifier).join(',')}) VALUES (${values.map(() => '?').join(',')})`, ...values.map(value => Buffer.isBuffer(value) ? new Uint8Array(value).buffer : value));
          }
          this.db.storage.sql.exec('INSERT INTO import_checkpoints(snapshot,part,hash) VALUES(?,?,?)', part.snapshot, part.part, part.hash);
          this.set('verified', '');
        });
        return Response.json({ ok: true, part: part.part });
      }
      if (action === 'verify' && request.method === 'POST') {
        const manifest = JSON.parse(this.meta('manifest') || 'null') as Manifest | null;
        if (!manifest) throw new Error('No snapshot');
        const results = [];
        for (const table of manifest.tables) {
          let rows: any[][];
          if (table.name === 'uploaded_avatars') {
            rows = [];
            for (const file of this.db.storage.sql.exec('SELECT * FROM avatar_files ORDER BY id').toArray()) {
              const avatar = await readAvatar(String(file.id));
              const item = { ...file, content: avatar!.content };
              rows.push(table.columns.map(c => encode(item[c as keyof typeof item])));
            }
          } else rows = this.db.storage.sql.exec(`SELECT ${table.columns.map(identifier).join(',')} FROM ${identifier(table.name)} ORDER BY ${table.order.map(identifier).join(',')}`).toArray().map(row => table.columns.map(c => encode(row[c])));
          const digest = hash(rows);
          results.push({ table: table.name, count: rows.length, digest, ok: rows.length === table.count && digest === table.digest });
        }
        const foreignKeys = this.db.storage.sql.exec('PRAGMA foreign_key_check').toArray();
        const invalidLedger = this.db.storage.sql.exec('SELECT l.session_id FROM xp_ledger l JOIN sport_sessions s ON s.id=l.session_id WHERE l.user_id!=s.user_id OR l.xp!=s.xp OR s.settled!=1').toArray();
        const growth = this.db.storage.sql.exec('SELECT p.user_id,p.total_xp,COALESCE(SUM(l.xp),0) AS ledger_xp FROM motion_profiles p LEFT JOIN xp_ledger l ON l.user_id=p.user_id GROUP BY p.user_id HAVING p.total_xp!=COALESCE(SUM(l.xp),0)').toArray();
        const ok = results.every(r => r.ok) && !foreignKeys.length && !invalidLedger.length && !growth.length;
        if (ok) this.set('verified', manifest.id);
        return Response.json({ ok, results, foreignKeys, invalidLedger, growth }, { status: ok ? 200 : 409 });
      }
      if (action === 'open' && request.method === 'POST') {
        if (this.active()) return Response.json({ ok: true, active: true });
        const manifest = JSON.parse(this.meta('manifest') || 'null') as Manifest | null;
        if (!manifest || this.meta('verified') !== manifest.id) throw new Error('Snapshot has not passed verification');
        await withTransaction(async () => { this.db.storage.sql.exec('DELETE FROM event_outbox'); this.set('active', 'true'); });
        return Response.json({ ok: true, active: true });
      }
      return Response.json({ error: 'Unknown migration action' }, { status: 404 });
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Import failed' }, { status: 409 }); }
  }
}
