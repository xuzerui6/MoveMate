// PITR (point-in-time recovery) operations for the SQLite-backed Durable Object.
//
// Bookmarks are per-object and restores happen in place on the same object, so
// these endpoints only wrap ctx.storage bookmark calls; there is no cross-object
// or cross-namespace restore path on the platform.
//
// Safety: the restore action is hard-guarded to the preview instance. A build
// deployed anywhere else (including production) can read bookmarks but can
// never schedule a restore through this module.
export class PitrError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export interface PitrSqlLike {
  databaseSize: number;
  exec(query: string, ...params: any[]): { toArray(): Record<string, any>[] };
}
export interface PitrStorageLike {
  sql: PitrSqlLike;
  getCurrentBookmark(): Promise<string | null>;
  getBookmarkForTime(timestamp: number): Promise<string | null>;
  onNextSessionRestoreBookmark(bookmark: string): Promise<string>;
}

const identifier = (name: string) => { if (!/^[a-z_][a-z_0-9]*$/i.test(name)) throw new Error('Invalid identifier'); return '"' + name + '"'; };
const internalTable = (name: string) => name.startsWith('sqlite_') || name.startsWith('_cf_') || name.startsWith('__cf_');

/** Restore scheduling is only ever allowed on the preview instance. */
export function restoreAllowed(instance: string | undefined): boolean {
  return instance === 'preview';
}

export const DRILL_MARKER_KEY = 'restore_drill_marker';
export const DRILL_CODE_PREFIX = 'restore-drill-';
export const DRILL_SCHOOL_NAME = '恢复演练标记（勿用）';

/** School-row code for a drill batch id (accepts '20261107' or 'restore-drill-20261107'). */
export function drillSchoolCode(batch: string): string {
  const suffix = batch.startsWith(DRILL_CODE_PREFIX) ? batch.slice(DRILL_CODE_PREFIX.length) : batch;
  return DRILL_CODE_PREFIX + suffix;
}

export class PitrOps {
  constructor(private storage: PitrStorageLike, private instance: string | undefined) {}

  /** Drill-marker state (read-only): the actor_meta value and marker school-row count. */
  drillState() {
    const value = this.storage.sql.exec('SELECT value FROM actor_meta WHERE key=?', DRILL_MARKER_KEY).toArray()[0]?.value;
    const rows = this.storage.sql.exec("SELECT COUNT(*) AS n FROM schools WHERE code LIKE 'restore-drill-%'").toArray()[0]?.n;
    return {
      drillMarker: typeof value === 'string' ? value : null,
      drillSchoolRows: Number(rows ?? 0),
    };
  }

  /** Read-only snapshot: identity, current bookmark, size, per-table counts. */
  async status() {
    const bookmark = await this.storage.getCurrentBookmark();
    const names = this.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").toArray()
      .map(row => String(row.name)).filter(name => !internalTable(name));
    const tables: Record<string, number> = {};
    for (const name of names) {
      tables[name] = Number(this.storage.sql.exec(`SELECT COUNT(*) AS n FROM ${identifier(name)}`).toArray()[0]?.n ?? 0);
    }
    const foreignKeyViolations = this.storage.sql.exec('PRAGMA foreign_key_check').toArray().length;
    return {
      instance: this.instance ?? null,
      bookmark,
      databaseSize: this.storage.sql.databaseSize,
      tables,
      foreignKeyViolations,
      ...this.drillState(),
      generatedAt: new Date().toISOString(),
    };
  }

  /** Read-only: bookmark for an arbitrary past timestamp (ms since epoch). */
  async bookmarkForTime(ts: number) {
    if (!Number.isSafeInteger(ts) || ts <= 0) throw new PitrError('Query parameter ts must be a positive integer (ms since epoch)', 400);
    if (ts > Date.now() + 24 * 60 * 60 * 1000) throw new PitrError('Query parameter ts is too far in the future', 400);
    const bookmark = await this.storage.getBookmarkForTime(ts);
    if (!bookmark) throw new PitrError('No bookmark available for that time', 404);
    return { ts, bookmark };
  }

  /**
   * Restore action (guarded): schedules `bookmark` to take effect on the next
   * session restart and returns the undo bookmark for the pre-restore point.
   * The caller is responsible for triggering the restart (ctx.abort()).
   */
  async restore(bookmark: unknown) {
    if (!restoreAllowed(this.instance)) {
      throw new PitrError(`Restore is disabled on instance '${this.instance ?? ''}': PITR restores may only be scheduled on the preview instance`, 403);
    }
    if (typeof bookmark !== 'string' || !bookmark) throw new PitrError('Body must be { bookmark: <non-empty string> }', 400);
    const undoBookmark = await this.storage.onNextSessionRestoreBookmark(bookmark);
    return { targetBookmark: bookmark, undoBookmark };
  }

  /**
   * Drill marker write (guarded, same level as restore): plants the two drill
   * markers from the drill plan — actor_meta.restore_drill_marker and one
   * inactive schools row coded restore-drill-<batch>. Refuses (409) while any
   * marker is present so an A-3 evidence chain is never silently overwritten;
   * delete the existing marker first. Red line: markers go nowhere else.
   */
  async writeDrillMarker(batch: unknown) {
    if (!restoreAllowed(this.instance)) {
      throw new PitrError(`Drill markers are disabled on instance '${this.instance ?? ''}': drill markers may only be written on the preview instance`, 403);
    }
    if (typeof batch !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(batch) || !drillSchoolCode(batch).slice(DRILL_CODE_PREFIX.length)) {
      throw new PitrError('Body must be { batch: <batch id, letters/digits/dashes, e.g. restore-drill-20261107> }', 400);
    }
    const existing = this.drillState();
    if (existing.drillMarker !== null || existing.drillSchoolRows > 0) {
      throw new PitrError('A restore drill marker is already present; delete it before writing a new one', 409);
    }
    const marker = `${batch}+${new Date().toISOString()}`;
    const schoolCode = drillSchoolCode(batch);
    this.storage.sql.exec('INSERT INTO actor_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', DRILL_MARKER_KEY, marker);
    this.storage.sql.exec('INSERT INTO schools(code,name,is_active) VALUES(?,?,0)', schoolCode, DRILL_SCHOOL_NAME);
    return { batch, marker, schoolCode };
  }

  /**
   * Drill marker cleanup (guarded): removes exactly the two marker locations.
   * Idempotent — clearing when nothing is planted is a no-op success.
   */
  async deleteDrillMarker() {
    if (!restoreAllowed(this.instance)) {
      throw new PitrError(`Drill markers are disabled on instance '${this.instance ?? ''}': drill markers may only be deleted on the preview instance`, 403);
    }
    const before = this.drillState();
    this.storage.sql.exec('DELETE FROM actor_meta WHERE key=?', DRILL_MARKER_KEY);
    this.storage.sql.exec("DELETE FROM schools WHERE code LIKE 'restore-drill-%'");
    const after = this.drillState();
    return { removedMarker: before.drillMarker, removedSchoolRows: before.drillSchoolRows - after.drillSchoolRows, ...after };
  }
}
