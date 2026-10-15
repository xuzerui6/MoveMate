import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import schema from '../src/schema.json' with { type: 'json' };
const require = createRequire(import.meta.url);
const bcrypt = require('../../server/node_modules/bcryptjs');
export const password = 'cloudflare-test-password';
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function fixture({ largeAvatar = false } = {}) {
  const db = new DatabaseSync(':memory:');
  for (const sql of schema.schema) db.exec(sql);
  for (const row of schema.metadata) db.prepare(row.sql).run(...row.args);
  db.exec('CREATE TABLE email_codes(email TEXT PRIMARY KEY,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL,last_sent_at INTEGER NOT NULL)');
  db.exec('CREATE TABLE uploaded_avatars(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,content BLOB NOT NULL,content_type TEXT NOT NULL,created_at TEXT NOT NULL)');
  const passwordHash = bcrypt.hashSync(password, 10);
  for (const [index, email] of ['host@dajju.local','player1@dajju.local','player2@dajju.local'].entries()) db.prepare('INSERT INTO users(id,nickname,email,password_hash,student_id,email_verified) VALUES(?,?,?,?,?,1)').run(index + 1, '测试账号' + index, email, passwordHash, 'synthetic-' + index);
  if (largeAvatar) {
    const bytes = Buffer.alloc(3 * 1024 * 1024 + 97, 0x31); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
    db.prepare('INSERT INTO uploaded_avatars VALUES(?,1,?,?,?)').run('migrated-large.png', bytes, 'image/png', '2026-10-15T00:00:00.000Z');
  }
  const order = ['schools','campuses','venues','users','games','game_members','chat_messages','notifications','feedback','motion_profiles','sport_sessions','sport_intervals','xp_ledger','email_codes','uploaded_avatars'];
  const tables = [], parts = [];
  for (const name of order) {
    const columns = db.prepare(`PRAGMA table_info(${name})`).all();
    const sort = columns.filter(c => c.pk).sort((a,b) => a.pk - b.pk).map(c => c.name);
    const names = columns.map(c => c.name);
    const rows = db.prepare(`SELECT * FROM ${name} ORDER BY ${sort.join(',')}`).all().map(row => names.map(c => row[c] instanceof Uint8Array ? { $blob: Buffer.from(row[c]).toString('base64') } : row[c]));
    tables.push({ name, columns: names, count: rows.length, digest: hash(rows), order: sort });
    for (let offset = 0; offset < rows.length; offset += 50) parts.push({ table: name, rows: rows.slice(offset, offset + 50) });
  }
  db.close();
  const manifest = { id: hash(tables), tables, source: 'synthetic-worker-test', createdAt: '2026-10-15T00:00:00.000Z' };
  return { manifest, parts: parts.map((part, index) => ({ ...part, part: index, snapshot: manifest.id, hash: hash(part.rows) })) };
}
