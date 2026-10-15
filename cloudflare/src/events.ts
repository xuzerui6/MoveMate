import { AsyncLocalStorage } from 'node:async_hooks';
export interface EventSink {
  push(userId: number, data: any): Promise<void>;
  broadcast(gameId: number, event: string, data: any, excludeUserId?: number): void;
  revoke(gameId: number, userId: number): void;
}
const context = new AsyncLocalStorage<EventSink>();
export const withEvents = <T>(sink: EventSink, fn: () => T): T => context.run(sink, fn);
const sink = () => { const value = context.getStore(); if (!value) throw new Error('Missing actor event scope'); return value; };
export const pushToUser = (userId: number, data: any) => sink().push(userId, data);
export const broadcastToGame = (gameId: number, event: string, data: any, excludeUserId?: number) => sink().broadcast(gameId, event, data, excludeUserId);
export const removeUserFromGame = (gameId: number, userId: number) => sink().revoke(gameId, userId);
