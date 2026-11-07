import { DurableObject } from 'cloudflare:workers';
import { ActorDatabase } from '../src/db';
import { DatabaseScope, runWithDatabaseScope } from '../../server/src/db/scope';
import { pool, withTransaction } from '../../server/src/db/pool';
export { default, MoveMateBackend } from '../src/worker';
import { MoveMateBackend } from '../src/worker';
import { VoicePool } from '../src/voice-pool';
import { PitrOps, PitrError } from '../src/pitr';

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
  /** Probe how the local runtime answers a real getCurrentBookmark() call. */
  async pitrRealBookmark() {
    try { return { ok: true, bookmark: await this.ctx.storage.getCurrentBookmark() }; }
    catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  }
  async pendingEvents() { return this.ctx.storage.sql.exec('SELECT COUNT(*) AS n FROM event_outbox').one().n; }
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
