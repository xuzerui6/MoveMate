import { AsyncLocalStorage } from 'node:async_hooks';

export interface DatabaseRuntime {
  init(): Promise<void>;
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }>;
  transaction?<T>(operation: () => Promise<T>): Promise<T>;
}

export class DatabaseScope {
  queue: Promise<unknown> = Promise.resolve();
  readonly transactions = new AsyncLocalStorage<any>();
  constructor(readonly database?: DatabaseRuntime) {}
}
const scopes = new AsyncLocalStorage<DatabaseScope>();
const local = new DatabaseScope();
export const currentDatabaseScope = () => scopes.getStore() || local;
export const runWithDatabaseScope = <T>(scope: DatabaseScope, operation: () => T): T => scopes.run(scope, operation);
