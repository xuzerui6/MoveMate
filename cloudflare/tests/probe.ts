import { DurableObject } from 'cloudflare:workers';
import { ActorDatabase } from '../src/db';
import { DatabaseScope, runWithDatabaseScope } from '../../server/src/db/scope';
import { pool, withTransaction } from '../../server/src/db/pool';
export { default, MoveMateBackend } from '../src/worker';
import { MoveMateBackend } from '../src/worker';
import { VoicePool } from '../src/voice-pool';
import { PitrOps, PitrError } from '../src/pitr';
import { createGame, listGames } from '../../server/src/services/game.service';
import { ensureInviteCode, listBlocks } from '../../server/src/services/social.service';

export class TestBackend extends MoveMateBackend {
  async voiceMode(mode: string) { process.env.XIAOZHI_IDENTITY_MODE = mode; }
  async seedVoiceUsers() {
    const original = this.ctx.storage.sql.exec('SELECT password_hash FROM users WHERE id=1').one();
    for (const id of [5, 6]) this.ctx.storage.sql.exec("INSERT OR IGNORE INTO users(id,email,password_hash,nickname,campus_id,email_verified,student_id) VALUES(?,?,?,?,1,1,?)", id, `voice${id}@dajju.local`, original.password_hash, 'Voice test ' + id, 'synthetic-voice-' + id);
  }
  async ageVoiceLease(id: string, idle = false) {
    this.ctx.storage.sql.exec(`UPDATE voice_leases SET ${idle ? 'last_activity' : 'expires_at'}=? WHERE id=?`, Date.now() - (idle ? 121000 : 1000), id);
  }
  async voiceLeaseRows() { return this.ctx.storage.sql.exec('SELECT id,slot,connection_id,phase,expires_at FROM voice_leases').toArray(); }
  async encryptedDevices() { return this.ctx.storage.sql.exec('SELECT identity FROM voice_devices WHERE identity IS NOT NULL').toArray().every(row => !String(row.identity).includes('deviceId') && String(row.identity).split('.').length === 3); }
  async staleRelease(id: string, connection: string) { await this.run(() => new VoicePool('p'.repeat(64), 'test').release(id, connection)); }
  async testIdle(id: string, connection: string, actor: any) { return this.run(() => new VoicePool('p'.repeat(64), 'test').heartbeat(id, connection, actor, Date.now() - 121000)); }
  async simulateVoiceRestart() { await this.run(() => new VoicePool('p'.repeat(64), 'new-generation').restart()); }
  async forceAlarm() {
    this.ctx.storage.sql.exec("UPDATE actor_meta SET value='1' WHERE key='lifecycle_due'");
    await this.alarm();
  }
  async ageSession(id: string, seconds: number) {
    // A deterministic test clock; these RPCs do not exist in production.
    const since = new Date(Date.now() - seconds * 1000).toISOString();
    this.ctx.storage.sql.exec('UPDATE sport_sessions SET active_since=? WHERE id=?', since, id);
    this.ctx.storage.sql.exec('UPDATE sport_intervals SET started_at=? WHERE session_id=? AND ended_at IS NULL', since, id);
  }
  /** PITR unit cases against a mock storage: exercises PitrOps without platform PITR. */
  async pitrUnitCase(instance: string) {
    const calls: string[] = [];
    const storage: any = {
      sql: {
        databaseSize: 12345,
        exec: (query: string) => ({
          toArray: () => query.includes('sqlite_master') ? [{ name: 'users' }, { name: '_cf_INTERNAL' }] : query.includes('foreign_key_check') ? [] : [{ n: 7 }],
        }),
      },
      getCurrentBookmark: async () => 'bm-current',
      getBookmarkForTime: async () => 'bm-at-time',
      onNextSessionRestoreBookmark: async (bookmark: string) => { calls.push(bookmark); return 'bm-undo'; },
    };
    const ops = new PitrOps(storage, instance);
    const status = await ops.status();
    const atTime = await ops.bookmarkForTime(Date.now());
    let invalidTs: any = null;
    try { await ops.bookmarkForTime(-1); } catch (error) { invalidTs = { status: (error as PitrError).status }; }
    let restoreResult: any = null, restoreError: any = null;
    try { restoreResult = await ops.restore('bm-target'); } catch (error) { restoreError = { status: (error as PitrError).status, message: (error as Error).message }; }
    let badBookmark: any = null;
    try { await ops.restore(''); } catch (error) { badBookmark = { status: (error as PitrError).status }; }
    return { status, atTime, invalidTs, restoreResult, restoreError, badBookmark, calls };
  }
  /**
   * Drill-marker cases against a stateful fake SQL store. Records every exec
   * call so the guard tests can prove non-preview instances touch zero storage.
   */
  async pitrDrillCase(instance: string) {
    const meta = new Map<string, string>();
    const schools: { code: string; name: string; is_active: number }[] = [];
    let execCalls = 0;
    const storage: any = {
      sql: {
        databaseSize: 12345,
        exec: (query: string, ...params: any[]) => {
          execCalls++;
          const q = query.trim();
          let rows: Record<string, any>[] = [];
          if (q.includes('sqlite_master')) rows = [{ name: 'actor_meta' }, { name: 'schools' }, { name: 'users' }, { name: '_cf_INTERNAL' }];
          else if (q.includes('foreign_key_check')) rows = [];
          else if (q.startsWith('SELECT value FROM actor_meta')) { const v = meta.get(String(params[0])); rows = v === undefined ? [] : [{ value: v }]; }
          else if (q.startsWith('INSERT INTO actor_meta')) meta.set(String(params[0]), String(params[1]));
          else if (q.startsWith('DELETE FROM actor_meta')) meta.delete(String(params[0]));
          else if (q.startsWith('INSERT INTO schools')) schools.push({ code: String(params[0]), name: String(params[1]), is_active: Number(params[2] ?? 0) });
          else if (q.startsWith('DELETE FROM schools')) { for (let i = schools.length - 1; i >= 0; i--) if (schools[i].code.startsWith('restore-drill-')) schools.splice(i, 1); }
          else if (q.includes("code LIKE 'restore-drill-%'")) rows = [{ n: schools.filter(s => s.code.startsWith('restore-drill-')).length }];
          else if (q.includes('COUNT(*)')) {
            const table = /FROM "(\w+)"/.exec(q)?.[1];
            rows = [{ n: table === 'actor_meta' ? meta.size : table === 'schools' ? schools.length : 7 }];
          }
          return { toArray: () => rows };
        },
      },
      getCurrentBookmark: async () => 'bm-current',
      getBookmarkForTime: async () => 'bm-at-time',
      onNextSessionRestoreBookmark: async () => 'bm-undo',
    };
    const ops = new PitrOps(storage, instance);
    const attempt = async (fn: () => Promise<any>) => { try { return { result: await fn(), error: null as any }; } catch (error) { return { result: null, error: { status: (error as PitrError).status, message: (error as Error).message } }; } };
    const before = await ops.status();
    const callsBeforeWrite = execCalls;
    const write = await attempt(() => ops.writeDrillMarker('restore-drill-20261107'));
    const writeDelta = execCalls - callsBeforeWrite;
    const duplicate = await attempt(() => ops.writeDrillMarker('restore-drill-20261107'));
    const badBatch = await attempt(() => ops.writeDrillMarker('bad batch!'));
    const afterWrite = await ops.status();
    const schoolRowsAfterWrite = schools.map(s => ({ ...s }));
    const callsBeforeDelete = execCalls;
    const del = await attempt(() => ops.deleteDrillMarker());
    const deleteDelta = execCalls - callsBeforeDelete;
    const delAgain = await attempt(() => ops.deleteDrillMarker());
    const afterDelete = await ops.status();
    return { before, write, writeDelta, duplicate, badBatch, afterWrite, schoolRowsAfterWrite, del, deleteDelta, delAgain, afterDelete, schools };
  }
  /** Probe how the local runtime answers a real getCurrentBookmark() call. */
  async pitrRealBookmark() {
    try { return { ok: true, bookmark: await this.ctx.storage.getCurrentBookmark() }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  }
  async pendingEvents() { return this.ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM event_outbox').one().n; }
  /**
   * Existing-instance upgrade case (regression for the 2026-11-13 preview
   * outage): rewinds users/games/chat_messages in this dedicated instance to
   * their pre-social shape, proves the social-era operations fail there,
   * replays the constructor boot path, and proves they recover with the
   * pre-existing rows preserved.
   */
  async existingInstanceUpgradeCase() {
    const sql = this.ctx.storage.sql;
    const hostId = 9101, gameId = 9101;
    sql.exec('DROP TABLE IF EXISTS chat_messages');
    sql.exec('DROP TABLE IF EXISTS games');
    sql.exec('DROP TABLE IF EXISTS users');
    sql.exec(`CREATE TABLE users (
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
    )`);
    sql.exec(`CREATE TABLE games (
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
    )`);
    sql.exec(`CREATE TABLE chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL REFERENCES games(id),
      sender_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    sql.exec("INSERT OR IGNORE INTO schools(id,code,name,is_active) VALUES(1,'jlu','吉林大学',1)");
    sql.exec("INSERT OR IGNORE INTO campuses(id,school_id,code,name,is_active) VALUES(1,1,'qianwei-center','前卫校区（中心校区）',1)");
    sql.exec("INSERT INTO users(id,nickname,email,password_hash,student_id,school_id,campus_id) VALUES(9101,'老实例房主','old-host@test.local','unused','old-1',1,1)");
    sql.exec("INSERT INTO games(id,host_id,sport_type,title,location,max_players,start_time,status,member_count,school_id,campus_id) VALUES(9101,9101,'basketball','老实例的局','老场地',4,'2099-01-01 10:00:00','recruiting',1,1,1)");
    sql.exec("INSERT INTO chat_messages(id,game_id,sender_id,content) VALUES(9101,9101,9101,'老消息你好')");
    const before = await this.exerciseUpgradedOps(hostId);
    await this.ctx.storage.transaction(async () => {
      const db = new ActorDatabase(this.ctx.storage);
      db.bootstrap();
      db.seedSchoolRegistry();
    });
    const after = await this.exerciseUpgradedOps(hostId);
    const columns = (table: string) => sql.exec(`PRAGMA table_info(${table})`).toArray().map(row => String(row.name));
    return {
      before,
      after,
      columns: { users: columns('users'), games: columns('games'), chat_messages: columns('chat_messages') },
      preserved: {
        game: sql.exec('SELECT title, member_count FROM games WHERE id=?', gameId).one(),
        user: sql.exec('SELECT nickname FROM users WHERE id=?', hostId).one(),
        chat: sql.exec('SELECT content FROM chat_messages WHERE id=?', gameId).one(),
        createdGames: Number(sql.exec('SELECT COUNT(*) AS n FROM games WHERE host_id=? AND id!=?', hostId, gameId).one().n),
      },
    };
  }
  private async exerciseUpgradedOps(hostId: number) {
    const attempt = async (fn: () => Promise<unknown>) => {
      try { return { ok: true, value: await fn() }; }
      catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
    };
    return this.run(async () => ({
      list: await attempt(async () => (await listGames({}, hostId)).pagination.total),
      create: await attempt(async () => (await createGame({
        host_id: hostId, sport_type: 'basketball', campus_id: 1, location: '新场地',
        max_players: 2, start_time: '2099-01-02T11:00:00.000Z', end_time: '2099-01-02T13:00:00.000Z',
        visibility: 'friends', auto_fill: false,
      })).id),
      invite: await attempt(() => ensureInviteCode(hostId)),
      blocks: await attempt(async () => (await listBlocks(hostId)).length),
    }));
  }
  async brokenOutbox(repair = false) {
    if (repair) this.ctx.storage.sql.exec("UPDATE event_outbox SET payload='{}' WHERE payload='not-json'");
    else this.ctx.storage.sql.exec("INSERT INTO event_outbox(event,payload) VALUES('notification','not-json')");
  }
}

/** Test-only entry point, excluded from the production bundle. */
export class RuntimeProbe extends DurableObject {
  scope: DatabaseScope;
  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    const db = new ActorDatabase(ctx.storage);
    this.scope = new DatabaseScope(db);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS probe(id INTEGER PRIMARY KEY,value INTEGER)');
  }
  async fetch(request: Request) {
    return runWithDatabaseScope(this.scope, async () => {
      const url = new URL(request.url);
      if (url.pathname === '/write') {
        const id = Number(url.searchParams.get('id'));
        try {
          await withTransaction(async () => {
            await pool.query('INSERT INTO probe(id,value) VALUES($1,10)', [id]);
            await withTransaction(async () => { await pool.query('UPDATE probe SET value=value+1 WHERE id=$1', [id]); });
            // Yield to a competing request to exercise native transaction isolation.
            await new Promise(resolve => setTimeout(resolve, 20));
            if (url.searchParams.has('fail')) throw new Error('rollback');
          });
        } catch { return new Response('rolled back', { status: 409 }); }
      }
      return Response.json((await pool.query('SELECT * FROM probe ORDER BY id')).rows);
    });
  }
}
