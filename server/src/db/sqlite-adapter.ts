/**
 * SQLite 适配层（基于 Node 22+ 内置 node:sqlite）
 *
 * 关键改动：
 *   - 引擎：node:sqlite（零依赖、原生 binding、随 Node 一起发布）
 *   - 占位符：上层继续使用 PG 风格的 $1, $2，内部改写为 SQLite 的 ?, ?
 *   - RETURNING *：原生支持（.all() 取所有返回行）
 *   - BOOLEAN：0/1 ↔ false/true 自动转换
 *   - 事务：db.exec('BEGIN/COMMIT/ROLLBACK') 显式管理
 *   - 持久化：WAL 模式，自动落盘（无需手动 saveToFile）
 */
import { DatabaseSync } from 'node:sqlite';
import '../config';
import * as fs from 'fs';
import * as path from 'path';

let db: DatabaseSync | null = null;
let initPromise: Promise<void> | null = null;

const DB_PATH = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'dajju.db');

// 布尔型字段名（SQLite 用 INTEGER 0/1 存）
const BOOLEAN_COLUMNS = new Set<string>([
  'is_active', 'email_verified', 'is_read',
]);

function openDatabase(): DatabaseSync {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const conn = new DatabaseSync(DB_PATH);
  // WAL：读写并发 + 崩溃安全
  conn.exec('PRAGMA journal_mode = WAL');
  // 适度内存缓存（KB）
  conn.exec('PRAGMA cache_size = -64000');
  // 外键约束
  conn.exec('PRAGMA foreign_keys = ON');
  // WAL 下 NORMAL 已足够安全
  conn.exec('PRAGMA synchronous = NORMAL');
  // node:sqlite 默认 TEXT 字段按字节存，加 encoding 提示以保证 UTF-8 中文往返正确
  conn.exec("PRAGMA encoding = 'UTF-8'");
  return conn;
}

/** PG 风格 $1, $2 占位符 → SQLite ?, ? */
function toSqlitePlaceholders(sql: string): string {
  return sql.replace(/\$\d+/g, '?');
}

interface ConvertResult { sql: string; params: any[]; }

/**
 * PG 风格 $1, $2, $3 ... → SQLite ?, ?, ? ...
 * 同时按 $N 出现顺序重排参数数组，使 ? 按出现顺序绑定到正确的参数。
 *
 * 例如：SQL = '... WHERE id = $1 AND name = $2'，params = [10, 'Alice']
 *   → SQL: '... WHERE id = ? AND name = ?', params: [10, 'Alice']
 *
 *      SQL = '... SET a = $2, b = $3, c = $1'，params = [1, 2, 3]
 *   → SQL: '... SET a = ?, b = ?, c = ?', params: [2, 3, 1]
 */
function pgToSqlite(sql: string, params: any[] = []): ConvertResult {
  const PH = new RegExp('\\$\\d+', 'g');
  const NAMES: number[] = [];
  const replaced = sql.replace(PH, (m) => {
    const idx = parseInt(m.slice(1), 10) - 1;
    NAMES.push(idx);
    return '?';
  });
  if (NAMES.length === 0) return { sql: replaced, params };
  const reordered = NAMES.map((i) => params[i] ?? null);
  return { sql: replaced, params: reordered };
}

/**
 * PG 方言 → SQLite 方言的轻量改写
 * 业务层继续使用 PG 习惯的 SQL（NOW() / TRUE / FALSE / CURRENT_TIMESTAMP），
 * 由适配层在执行前统一转换，保持上层代码与 PG 兼容。
 */
function toSqliteDialect(sql: string): string {
  return sql
    // 关键字大小写保留原文，仅替换函数/字面量
    .replace(/\bNOW\s*\(\s*\)/gi, "datetime('now')")
    .replace(/\bCURRENT_TIMESTAMP\b/gi, "datetime('now')")
    .replace(/\bTRUE\b/g, '1')
    .replace(/\bFALSE\b/g, '0')
    // 移除 PG 行级锁：SQLite 用 BEGIN IMMEDIATE 事务锁替代
    .replace(/\bFOR\s+UPDATE\b/gi, '');
}

/** 规范化布尔字段：DB 0/1 → JS boolean */
function coerceRow(row: any, columns: string[]): any {
  if (!row) return row;
  for (const col of columns) {
    if (BOOLEAN_COLUMNS.has(col) && typeof row[col] === 'number') {
      row[col] = row[col] !== 0;
    }
    // SQLite datetime('now') is UTC but omits its timezone. Keep API dates explicit.
    if ((col.endsWith('_at') || col === 'start_time' || col === 'end_time') &&
      typeof row[col] === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(row[col])) {
      row[col] = row[col].replace(' ', 'T') + 'Z';
    }
  }
  return row;
}

/** 规范化参数：JS boolean → 0/1 */
function coerceParams(params: any[] | undefined): any[] {
  if (!params) return [];
  return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
}

/**
 * 执行 SQL，返回 { rows, rowCount }
 *
 * SELECT                  → rows = 结果集，rowCount = 行数
 * INSERT/UPDATE/DELETE
 *   - 无 RETURNING         → rows = []，rowCount = changes
 *   - 有 RETURNING *       → rows = 返回行，rowCount = changes
 * BEGIN / COMMIT / ROLLBACK → 显式事务边界
 */
export function sqliteQuery<T = any>(
  sql: string,
  params?: any[]
): { rows: T[]; rowCount: number } {
  if (!db) throw new Error('[SQLite] 数据库未初始化，请先调用 initSQLite()');

  // 完整转换：占位符（按  出现顺序重排参数）+ PG 方言关键字
  const dialect = toSqliteDialect(sql);
  const { sql: converted, params: reorderedParams } = pgToSqlite(dialect, params);
  const effectiveParams = coerceParams(reorderedParams);

  const trimmed = converted.trim().toUpperCase();

  try {
    // ---- 显式事务边界 ----
    if (trimmed === 'BEGIN' || trimmed === 'BEGIN IMMEDIATE') {
      db.exec('BEGIN IMMEDIATE');
      return { rows: [], rowCount: 0 };
    }
    if (trimmed === 'COMMIT') {
      db.exec('COMMIT');
      return { rows: [], rowCount: 0 };
    }
    if (trimmed === 'ROLLBACK') {
      db.exec('ROLLBACK');
      return { rows: [], rowCount: 0 };
    }

    // ---- DDL ----
    if (
      trimmed.startsWith('CREATE') ||
      trimmed.startsWith('ALTER') ||
      trimmed.startsWith('DROP')
    ) {
      db.exec(converted);
      return { rows: [], rowCount: 0 };
    }

    // ---- 写操作 ----
    if (
      trimmed.startsWith('INSERT') ||
      trimmed.startsWith('UPDATE') ||
      trimmed.startsWith('DELETE')
    ) {
      const hasReturning = /\bRETURNING\b/i.test(converted);
      const stmt = db.prepare(converted);
      if (hasReturning) {
        const rows = stmt.all(...effectiveParams) as any[];
        const changes = Number((db.prepare('SELECT changes() AS n').get() as { n: number | bigint }).n);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        return {
          rows: rows.map((r) => coerceRow(r, columns)) as T[],
          rowCount: changes,
        };
      } else {
        const result = stmt.run(...effectiveParams);
        return { rows: [], rowCount: Number(result.changes) };
      }
    }

    // ---- SELECT ----
    const stmt = db.prepare(converted);
    const rows = (stmt.all(...effectiveParams) as any[]) || [];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return {
      rows: rows.map((r) => coerceRow(r, columns)) as T[],
      rowCount: rows.length,
    };
  } catch (err: any) {
    console.error('[SQLite] Query error:', err.message);
    console.error('[SQLite] SQL:', converted);
    throw err;
  }
}

/** 测试连接 */
export function testSQLiteConnection(): boolean {
  if (!db) return false;
  try {
    const result = sqliteQuery("SELECT datetime('now') AS current_time");
    console.log(`[SQLite] 时间: ${(result.rows[0] as any)?.current_time}`);
    return true;
  } catch {
    return false;
  }
}

// ================================================================
// Schema 初始化（与原 sql.js 适配器兼容）
// ================================================================

function ensureSchema(conn: DatabaseSync): void {
  const hasUsers=Boolean(conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get());
  const hasMotion=Boolean(conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sport_intervals'").get());
  const hasPreferences=hasUsers&&(conn.prepare('PRAGMA table_info(users)').all() as {name:string}[]).some(column=>column.name==='sport_preferences');
  if(hasUsers && (!hasMotion || !hasPreferences)) {
    const backupDir=path.join(path.dirname(path.resolve(DB_PATH)),'backups');
    fs.mkdirSync(backupDir,{recursive:true});
    const backupPath=path.join(backupDir,path.basename(DB_PATH,'.db')+(hasMotion?'-pre-profile-':'-pre-motion-')+new Date().toISOString().replace(/[:.]/g,'-')+'.db');
    conn.prepare('VACUUM INTO ?').run(backupPath);
    console.log('[SQLite] 迁移前备份: '+backupPath);
  }
  conn.exec(`
    CREATE TABLE IF NOT EXISTS motion_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id), total_xp INTEGER NOT NULL DEFAULT 0,
      avatar_gender TEXT NOT NULL DEFAULT 'male', active_outfit TEXT NOT NULL DEFAULT 'default',
      equipped TEXT NOT NULL DEFAULT '{}', seen_outfits TEXT NOT NULL DEFAULT '["default"]', age INTEGER NOT NULL DEFAULT 24
    );
    CREATE TABLE IF NOT EXISTS sport_sessions (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), game_id INTEGER REFERENCES games(id),
      sport_type TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running',
      active_since TEXT, effective_ms INTEGER NOT NULL DEFAULT 0, reps INTEGER NOT NULL DEFAULT 0,
      metrics TEXT NOT NULL DEFAULT '{}', xp INTEGER NOT NULL DEFAULT 0, settled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, ended_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_sport ON sport_sessions(user_id) WHERE status IN ('running','paused');
    CREATE UNIQUE INDEX IF NOT EXISTS one_game_sport ON sport_sessions(game_id,user_id) WHERE game_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS sport_intervals (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES sport_sessions(id),
      started_at TEXT NOT NULL, ended_at TEXT, effective_ms INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_open_interval ON sport_intervals(session_id) WHERE ended_at IS NULL;
    INSERT INTO sport_intervals(session_id,started_at)
      SELECT id,active_since FROM sport_sessions s WHERE status='running' AND active_since IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM sport_intervals i WHERE i.session_id=s.id AND i.ended_at IS NULL);
    CREATE TABLE IF NOT EXISTS xp_ledger (
      session_id TEXT PRIMARY KEY REFERENCES sport_sessions(id), user_id INTEGER NOT NULL REFERENCES users(id),
      xp INTEGER NOT NULL, created_at TEXT NOT NULL
    );
  `);
  conn.exec(`
    CREATE TABLE IF NOT EXISTS schools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS campuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER NOT NULL REFERENCES schools(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS venues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER NOT NULL REFERENCES schools(id),
      campus_id INTEGER NOT NULL REFERENCES campuses(id),
      name TEXT NOT NULL,
      sport_types TEXT DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nickname TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar_url TEXT DEFAULT '',
      department TEXT DEFAULT '',
      student_id TEXT NOT NULL,
      email_verified INTEGER DEFAULT 0,
      school_id INTEGER DEFAULT 1,
      campus_id INTEGER DEFAULT 1,
      is_admin INTEGER NOT NULL DEFAULT 0,
      reward_points INTEGER NOT NULL DEFAULT 0,
      reward_level INTEGER NOT NULL DEFAULT 1,
      reward_streak INTEGER NOT NULL DEFAULT 0,
      completed_games INTEGER NOT NULL DEFAULT 0,
      hosted_completed_games INTEGER NOT NULL DEFAULT 0,
      reward_badges TEXT DEFAULT '[]',
      last_rewarded_date TEXT,
      qq_email TEXT DEFAULT '',
      sport_preferences TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host_id INTEGER NOT NULL REFERENCES users(id),
      sport_type TEXT NOT NULL,
      title TEXT DEFAULT '',
      location TEXT NOT NULL,
      max_players INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      completed_at TEXT,
      status TEXT DEFAULT 'recruiting',
      tag TEXT,
      member_count INTEGER DEFAULT 1,
      school_id INTEGER DEFAULT 1,
      campus_id INTEGER DEFAULT 1,
      venue_id INTEGER,
      venue_name_snapshot TEXT DEFAULT '',
      meeting_note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS game_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      joined_at TEXT DEFAULT (datetime('now')),
      checked_in_at TEXT,
      attendance_confirmed_at TEXT,
      reward_points INTEGER NOT NULL DEFAULT 0,
      reward_granted_at TEXT,
      left_at TEXT,
      hidden_in_profile_at TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id),
      sender_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      game_id INTEGER REFERENCES games(id),
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      content TEXT NOT NULL,
      contact TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 兼容旧库的列扩展
  const tableColumns = (table: string): string[] => {
    const rows = conn
      .prepare(`PRAGMA table_info(${table})`)
      .all() as Array<{ name: string }>;
    return rows.map((r) => r.name);
  };

  const ensureColumn = (table: string, column: string, definition: string) => {
    if (!tableColumns(table).includes(column)) {
      conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    }
  };

  ensureColumn('users', 'school_id', 'INTEGER DEFAULT 1');
  ensureColumn('users', 'campus_id', 'INTEGER DEFAULT 1');
  ensureColumn('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'reward_points', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'reward_level', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('users', 'reward_streak', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'completed_games', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'hosted_completed_games', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'reward_badges', "TEXT DEFAULT '[]'");
  ensureColumn('users', 'last_rewarded_date', 'TEXT');
  ensureColumn('users', 'qq_email', "TEXT DEFAULT ''");
  ensureColumn('users', 'sport_preferences', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('games', 'school_id', 'INTEGER DEFAULT 1');
  ensureColumn('games', 'campus_id', 'INTEGER DEFAULT 1');
  ensureColumn('games', 'venue_id', 'INTEGER');
  ensureColumn('games', 'venue_name_snapshot', "TEXT DEFAULT ''");
  ensureColumn('games', 'meeting_note', "TEXT DEFAULT ''");
  ensureColumn('game_members', 'checked_in_at', 'TEXT');
  ensureColumn('game_members', 'attendance_confirmed_at', 'TEXT');
  ensureColumn('game_members', 'reward_points', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('game_members', 'reward_granted_at', 'TEXT');
  ensureColumn('game_members', 'hidden_in_profile_at', 'TEXT');
}

// ================================================================
// JLU 校园元数据 seed（保留原 sql.js 适配器的内容）
// ================================================================

const JLU_CAMPUSES: Array<[number, number, string, string]> = [
  [1, 1, 'qianwei-center', '前卫校区（中心校区）'],
  [2, 1, 'nanling', '南岭校区'],
  [3, 1, 'chaoyang', '朝阳校区（地质宫校区）'],
];

const JLU_VENUES: Array<[number, number, string, string]> = [
  [1, 1, '前卫校区田径场', '["running","soccer"]'],
  [1, 1, '前卫南区足球场', '["soccer"]'],
  [1, 1, '前卫校区北苑篮球场', '["basketball"]'],
  [1, 1, '前卫校区经信楼附近篮球场', '["basketball"]'],
  [1, 1, '前卫校区北苑排球场', '["volleyball"]'],
  [1, 1, '前卫校区经信楼东侧网球场', '["tennis"]'],
  [1, 1, '鼎新楼南侧轮滑场地', '["roller_skating","skateboarding"]'],
  [1, 1, '宋治平体育馆室内田径馆', '["running"]'],
  [1, 1, '宋治平体育馆篮球比赛馆', '["basketball"]'],
  [1, 1, '宋治平体育馆篮球训练馆', '["basketball"]'],
  [1, 1, '宋治平体育馆乒乓球馆', '["table_tennis"]'],
  [1, 1, '宋治平体育馆网球馆', '["tennis"]'],
  [1, 1, '宋治平体育馆排球馆', '["volleyball"]'],
  [1, 1, '宋治平体育馆健身馆', '["fitness"]'],
  [1, 1, '中心体育馆篮球馆', '["basketball"]'],
  [1, 1, '中心体育馆羽毛球馆', '["badminton"]'],
  [1, 1, '中心体育馆乒乓球馆', '["table_tennis"]'],
  [1, 1, '日新楼游泳馆', '["swimming"]'],
  [1, 1, '日新楼健身中心', '["fitness"]'],
  [1, 1, '鼎新楼健身中心', '["fitness"]'],
  [1, 2, '南岭校区田径场', '["running","soccer"]'],
  [1, 2, '南岭校区真草足球场', '["soccer","running"]'],
  [1, 2, '南岭校区二教东侧篮球场', '["basketball"]'],
  [1, 2, '南岭校区宿舍区篮球场', '["basketball"]'],
  [1, 2, '南岭校区排球场', '["volleyball"]'],
  [1, 2, '南岭校区东门网球场', '["tennis"]'],
  [1, 2, '南岭体育馆篮球馆', '["basketball"]'],
  [1, 2, '南岭体育馆羽毛球馆', '["badminton"]'],
  [1, 2, '南岭体育馆乒乓球馆', '["table_tennis"]'],
  [1, 2, '南岭体育馆二楼健身中心', '["fitness"]'],
  [1, 3, '朝阳校区田径场', '["running","soccer"]'],
  [1, 3, '朝阳校区宿舍区篮球场', '["basketball"]'],
  [1, 3, '朝阳校区排球场', '["volleyball"]'],
  [1, 3, '朝阳体育馆羽毛球馆', '["badminton"]'],
  [1, 3, '朝阳体育馆乒乓球馆', '["table_tennis"]'],
  [1, 3, '朝阳体育馆健身室', '["fitness"]'],
];

function seedJluMetadata(conn: DatabaseSync): void {
  const schoolCount = (conn.prepare('SELECT COUNT(*) AS total FROM schools').get() as { total: number }).total;
  if (schoolCount > 0) return;

  const insertSchool = conn.prepare('INSERT INTO schools (id, code, name, is_active) VALUES (?, ?, ?, 1)');
  const insertCampus = conn.prepare('INSERT INTO campuses (id, school_id, code, name, is_active) VALUES (?, ?, ?, ?, 1)');
  const insertVenue = conn.prepare('INSERT INTO venues (school_id, campus_id, name, sport_types, is_active) VALUES (?, ?, ?, ?, 1)');

  conn.exec('BEGIN');
  try {
    insertSchool.run(1, 'jlu', '吉林大学');
    for (const [id, schoolId, code, name] of JLU_CAMPUSES) {
      insertCampus.run(id, schoolId, code, name);
    }
    for (const [schoolId, campusId, name, sportTypes] of JLU_VENUES) {
      insertVenue.run(schoolId, campusId, name, sportTypes);
    }
    conn.exec('COMMIT');
  } catch (err) {
    conn.exec('ROLLBACK');
    throw err;
  }
}

/**
 * 初始管理员：读取 ADMIN_EMAIL 环境变量（多个用逗号分隔），
 * 将匹配邮箱的用户设为管理员。
 * 无匹配用户时静默跳过——等该用户注册后再设（幂等：每次启动都会执行）。
 */
function seedAdmin(conn: DatabaseSync): void {
  const adminEmails = (process.env.ADMIN_EMAIL || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.length === 0) return;

  const update = conn.prepare('UPDATE users SET is_admin = 1 WHERE email = ? AND is_admin = 0');
  let count = 0;
  for (const email of adminEmails) {
    count += Number(update.run(email).changes);
  }
  if (count > 0) {
    console.log(`[SQLite] 已设置 ${count} 个初始管理员`);
  }
}

function backfillLegacyData(conn: DatabaseSync): void {
  const tableExists = (t: string): boolean => {
    const row = conn
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(t) as { name: string } | undefined;
    return row !== undefined;
  };

  if (tableExists('users')) {
    conn.exec(`
      UPDATE users SET school_id = 1 WHERE school_id IS NULL;
      UPDATE users SET campus_id = 1 WHERE campus_id IS NULL;
      UPDATE users SET reward_points = 0 WHERE reward_points IS NULL;
      UPDATE users SET reward_level = 1 WHERE reward_level IS NULL;
      UPDATE users SET reward_streak = 0 WHERE reward_streak IS NULL;
      UPDATE users SET completed_games = 0 WHERE completed_games IS NULL;
      UPDATE users SET hosted_completed_games = 0 WHERE hosted_completed_games IS NULL;
      UPDATE users SET reward_badges = '[]' WHERE reward_badges IS NULL OR reward_badges = '';
    `);
  }
  if (tableExists('games')) {
    conn.exec(`
      UPDATE games SET school_id = 1 WHERE school_id IS NULL;
      UPDATE games SET campus_id = 1 WHERE campus_id IS NULL;
      UPDATE games
        SET venue_name_snapshot = location
        WHERE (venue_name_snapshot IS NULL OR venue_name_snapshot = '')
          AND location IS NOT NULL;
    `);
  }
  if (tableExists('game_members')) {
    conn.exec(`UPDATE game_members SET reward_points = 0 WHERE reward_points IS NULL;`);
  }
}

/** 初始化 SQLite 数据库 */
export async function initSQLite(): Promise<void> {
  if (initPromise) return initPromise;
  if (db) return;

  initPromise = (async () => {
    const connection = openDatabase();
    try {
      ensureSchema(connection);
      seedJluMetadata(connection);
      backfillLegacyData(connection);
      seedAdmin(connection);
      db = connection;
      console.log(`[SQLite] 数据库就绪: ${DB_PATH}`);
    } catch (error) {
      connection.close();
      throw error;
    }
  })();

  return initPromise;
}
