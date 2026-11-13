/**
 * lazyWithRetry —— 懒加载页面的「抗部署切换」包装。
 *
 * 背景（2026-11-13 实测根因）：预览/生产部署在不同工作树轮换构建，旧标签页
 * 在新部署后按旧文件名请求懒加载分块，服务端对缺失分块明确返回 404，
 * import() 直接失败 → React.lazy 抛错 → 全站 ErrorBoundary 整页报废，
 * 只能手动整页刷新。修复分两半：一半在构建端（web.mjs 跨工作树共享
 * 资源保留），一半在这里：分块加载失败先自动重试一次；仍失败则做一次
 * 受控的整页刷新（30 秒内最多一次，防循环），让用户自动落到新版本入口，
 * 而不是停在整页错误上；连刷新都救不回来才把错误上抛给边界。
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export const CHUNK_RELOAD_KEY = 'movemate:chunk-reload-at';
export const CHUNK_RELOAD_GUARD_MS = 30_000;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 30 秒内已经为分块错误刷新过一次 → 不再自动刷新，避免无限循环。 */
export function chunkReloadAllowed(now: number, lastReloadAt: number | null): boolean {
  if (!lastReloadAt || Number.isNaN(lastReloadAt)) return true;
  return now - lastReloadAt >= CHUNK_RELOAD_GUARD_MS;
}

function defaultStorage(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readLastReloadAt(storage: StorageLike | null): number | null {
  try {
    const raw = storage?.getItem(CHUNK_RELOAD_KEY);
    return raw == null ? null : Number(raw);
  } catch {
    return null;
  }
}

function markReload(storage: StorageLike | null, now: number): void {
  try {
    storage?.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    /* 存储不可用时静默：最多退化为边界页，不再循环 */
  }
}

export interface ChunkRecoveryDeps {
  storage?: StorageLike | null;
  now?: () => number;
  reload?: () => void;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * 一次分块加载的完整恢复策略（可单测）：
 * 首试 → 失败后等 400ms 重试一次 → 仍失败且允许刷新时，标记并整页刷新，
 * 返回一个永不落地的 Promise（刷新途中不要把错误抛给边界闪一帧）；
 * 不允许刷新（刚刷新过）则抛出最后一次错误，交给边界处理。
 */
export async function importWithChunkRecovery<T>(
  factory: () => Promise<T>,
  deps: ChunkRecoveryDeps = {},
): Promise<T> {
  try {
    return await factory();
  } catch (firstError) {
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    await sleep(400);
    try {
      return await factory();
    } catch {
      const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
      const now = (deps.now ?? Date.now)();
      if (chunkReloadAllowed(now, readLastReloadAt(storage))) {
        markReload(storage, now);
        (deps.reload ?? (() => window.location.reload()))();
        return new Promise<T>(() => {});
      }
      throw firstError;
    }
  }
}

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => importWithChunkRecovery(factory));
}
