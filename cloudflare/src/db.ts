import type { DatabaseRuntime } from '../../server/src/db/scope';
import { pgToSqlite, toSqliteDialect, coerceRow, coerceParams } from '../../server/src/db/sql-dialect';
import bootstrap from './schema.json';

/** 按顶层逗号拆分 CREATE TABLE 的列定义体（跳过括号与字符串字面量内的逗号）。 */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      current += ch;
      if (ch === "'") {
        if (body[i + 1] === "'") { current += body[++i]; } else quoted = false;
      }
      continue;
    }
    if (ch === "'") { quoted = true; current += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

const TABLE_CONSTRAINT_HEADS = new Set(['PRIMARY', 'UNIQUE', 'FOREIGN', 'CHECK', 'CONSTRAINT']);

/** 解析一条 CREATE TABLE 语句，返回表名与「列名 → 列定义」列表（表级约束跳过）。 */
function parseCreateTable(statement: string): { table: string; columns: Array<{ name: string; definition: string }> } | null {
  const match = /CREATE TABLE IF NOT EXISTS\s+"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\(([\s\S]*)\)\s*;?\s*$/.exec(statement.trim());
  if (!match) return null;
  const columns: Array<{ name: string; definition: string }> = [];
  for (const segment of splitTopLevel(match[2])) {
    const head = /^"?([A-Za-z_][A-Za-z0-9_]*)"?\s+([\s\S]*)$/.exec(segment.trim());
    if (!head || TABLE_CONSTRAINT_HEADS.has(head[1].toUpperCase())) continue;
    columns.push({ name: head[1], definition: head[2].trim() });
  }
  return { table: match[1], columns };
}

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
    this.upgradeColumns();
  }
  /**
   * 已有实例的列升级（每次启动幂等执行）：schema.json 里的 CREATE TABLE IF NOT EXISTS
   * 只对新建的表生效，给已有表后加的列（社交一期：users.invite_code、
   * games.visibility/fill_open/auto_fill/rebooked_from_id、chat_messages.kind）
   * 到不了长期运行的实例，相关查询会直接报「no column」500。
   * Node 侧有 sqlite-adapter 的 ensureColumn，DO 侧在这里按 schema.json 的目标结构
   * 逐表比对、缺列就地 ADD COLUMN。只加列不写行：快照导入 begin 只校验行数，
   * 不受影响；导入 open 后还会再跑一次（与 seedSchoolRegistry 同一模式）。
   */
  upgradeColumns(): void {
    for (const statement of bootstrap.schema) {
      const parsed = parseCreateTable(statement);
      if (!parsed) continue;
      const existing = this.storage.sql.exec(`PRAGMA table_info(${parsed.table})`).toArray().map(row => String(row.name));
      if (!existing.length) continue;
      for (const column of parsed.columns) {
        if (!existing.includes(column.name)) this.addColumn(parsed.table, column.name, column.definition);
      }
    }
  }
  private addColumn(table: string, column: string, definition: string): void {
    // SQLite 的 ADD COLUMN 不允许 UNIQUE / PRIMARY KEY / AUTOINCREMENT：退化为普通列补齐即可。
    const plain = definition.replace(/\bPRIMARY\s+KEY\b/gi, '').replace(/\bAUTOINCREMENT\b/gi, '').replace(/\bUNIQUE\b/gi, '').replace(/\s+/g, ' ').trim();
    try {
      this.storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${plain}`);
    } catch {
      // NOT NULL 且无默认值的列同样加不上：去掉 NOT NULL 再补（约束无法对存量数据追溯补建）。
      const loosened = plain.replace(/\bNOT\s+NULL\b/gi, '').replace(/\s+/g, ' ').trim();
      this.storage.sql.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${loosened}`);
    }
  }
  seedMetadata(): void { for (const row of bootstrap.metadata) this.storage.sql.exec(row.sql, ...row.args); }
  /**
   * 学校/校区注册表（每次启动幂等执行）：只补 schools/campuses 两张注册表，
   * 让「只挂列表、暂未开放注册」的学校（吉林体育学院）能落到已有库里。
   * 不走 seedMetadata 全量补种：venues 含管理员可删数据，全量 INSERT OR IGNORE 会把删掉的场地塞回来。
   */
  seedSchoolRegistry(): void {
    // 空库不补：全新实例要先走快照导入（begin 校验目标库必须为空），这里抢先写行会把导入挡死；
    // 已有学校数据的库才补齐缺失的注册表行。导入完成（open）后会再调用一次。
    const count = this.storage.sql.exec('SELECT COUNT(*) AS n FROM schools').one().n;
    if (!Number(count)) return;
    for (const row of bootstrap.metadata) {
      if (/^INSERT OR IGNORE INTO (schools|campuses) /.test(row.sql)) this.storage.sql.exec(row.sql, ...row.args);
    }
  }
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
