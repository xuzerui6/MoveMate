import type { DatabaseRuntime } from '../../server/src/db/scope';
import { pgToSqlite, toSqliteDialect, coerceRow, coerceParams } from '../../server/src/db/sql-dialect';
import bootstrap from './schema.json';

export class ActorDatabase implements DatabaseRuntime {
  constructor(readonly storage: DurableObjectStorage) {}
  async init(): Promise<void> {}
  bootstrap(): void {
    for (const sql of bootstrap.schema) this.storage.sql.exec(sql);
    this.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS email_codes(email TEXT PRIMARY KEY,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,last_sent_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS actor_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS avatar_files(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),content_type TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS avatar_chunks(file_id TEXT NOT NULL REFERENCES avatar_files(id),part INTEGER NOT NULL,content BLOB NOT NULL,PRIMARY KEY(file_id,part));
      CREATE TABLE IF NOT EXISTS event_outbox(id INTEGER PRIMARY KEY AUTOINCREMENT,event TEXT NOT NULL,payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ephemeral_cache(key TEXT PRIMARY KEY,value TEXT NOT NULL,expires_at INTEGER);
      CREATE TABLE IF NOT EXISTS import_checkpoints(snapshot TEXT NOT NULL,part INTEGER NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(snapshot,part));
      CREATE TABLE IF NOT EXISTS voice_devices(slot INTEGER PRIMARY KEY CHECK(slot BETWEEN 1 AND 5),identity TEXT,state TEXT NOT NULL DEFAULT 'empty',enabled INTEGER NOT NULL DEFAULT 0,verified INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS voice_leases(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),slot INTEGER NOT NULL UNIQUE REFERENCES voice_devices(slot),client_id TEXT NOT NULL,connection_id TEXT,phase TEXT NOT NULL DEFAULT 'pending',expires_at INTEGER NOT NULL,last_activity INTEGER NOT NULL,generation TEXT NOT NULL,is_test INTEGER NOT NULL DEFAULT 0);
      INSERT OR IGNORE INTO voice_devices(slot) VALUES(1),(2),(3),(4),(5);
      CREATE TRIGGER IF NOT EXISTS notification_outbox AFTER INSERT ON notifications BEGIN
        INSERT INTO event_outbox(event,payload) VALUES('notification',json_object('userId',NEW.user_id,'id',NEW.id,'type',NEW.type,'title',NEW.title,'content',NEW.content,'gameId',NEW.game_id,'createdAt',NEW.created_at));
      END;
      CREATE TRIGGER IF NOT EXISTS game_outbox AFTER UPDATE OF status,member_count ON games BEGIN
        INSERT INTO event_outbox(event,payload) VALUES('game_update',json_object('gameId',NEW.id,'changes',json_object('status',NEW.status,'member_count',NEW.member_count)));
        INSERT INTO event_outbox(event,payload) VALUES('member_change',json_object('gameId',NEW.id,'changes',json_object('status',NEW.status,'member_count',NEW.member_count)));
      END;
    `);
  }
  seedMetadata(): void { for (const row of bootstrap.metadata) this.storage.sql.exec(row.sql, ...row.args); }
  async query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    const converted = pgToSqlite(toSqliteDialect(sql), params);
    if (/^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/i.test(converted.sql)) throw new Error('Use storage.transaction');
    const args = coerceParams(converted.params).map(value => ArrayBuffer.isView(value) ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) : value);
    const cursor = this.storage.sql.exec(converted.sql, ...args);
    const rows = cursor.toArray().map(row => coerceRow(row, Object.keys(row))) as T[];
    const writes = /^\s*(INSERT|UPDATE|DELETE)\b/i.test(converted.sql);
    const rowCount = writes ? Number(this.storage.sql.exec('SELECT changes() AS n').one().n) : rows.length;
    return { rows, rowCount };
  }
  transaction<T>(operation: () => Promise<T>): Promise<T> { return this.storage.transaction(operation); }
}
