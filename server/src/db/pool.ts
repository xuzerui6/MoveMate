import { AsyncLocalStorage } from 'node:async_hooks';
import { initSQLite, sqliteQuery } from './sqlite-adapter';

type QueryResult<T> = { rows: T[]; rowCount: number };
type Transaction = { client: PoolClient; active: boolean; effects: Array<() => void | Promise<void>> };
const context = new AsyncLocalStorage<Transaction>();
let queue: Promise<unknown> = Promise.resolve();

// A single connection must never interleave asynchronous transactions.
function exclusive<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation);
  queue = result.catch(() => undefined);
  return result;
}

export class PoolClient {
  private released = false;
  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    if (this.released) throw new Error('Client already released');
    const current = context.getStore();
    if (current?.active && current.client === this) return sqliteQuery<T>(sql, params);
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)) throw new Error('Use withTransaction()');
    return pool.query<T>(sql, params);
  }
  release(): void { this.released = true; }
}

export const pool = {
  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    if (context.getStore()?.active) return sqliteQuery<T>(sql, params);
    return exclusive(async () => {
      await initSQLite();
      return sqliteQuery<T>(sql, params);
    });
  },
  async connect(): Promise<PoolClient> {
    await pool.query('SELECT 1');
    return new PoolClient();
  },
  on(_event: string, _handler: Function): void {},
};

export function afterCommit(effect: () => void | Promise<void>): void {
  const current = context.getStore();
  if (!current?.active) throw new Error('afterCommit requires an active transaction');
  current.effects.push(effect);
}

export async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const parent = context.getStore();
  if (parent?.active) return operation(parent.client);
  const effects: Transaction['effects'] = [];
  const result = await exclusive(async () => {
    await initSQLite();
    const client = new PoolClient();
    const transaction: Transaction = { client, active: true, effects };
    sqliteQuery('BEGIN IMMEDIATE');
    try {
      const value = await context.run(transaction, () => operation(client));
      sqliteQuery('COMMIT');
      return value;
    } catch (error) {
      try { sqliteQuery('ROLLBACK'); } catch (rollbackError) { console.error('[DB] Rollback failed:', rollbackError); }
      throw error;
    } finally {
      transaction.active = false;
      client.release();
    }
  });
  // Release the lock before network work; failed effects never undo a commit.
  for (const effect of effects) {
    try { await effect(); } catch (error) { console.error('[AfterCommit] Failed:', error); }
  }
  return result;
}
