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

export class PitrOps {
  constructor(private storage: PitrStorageLike, private instance: string | undefined) {}

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
}
