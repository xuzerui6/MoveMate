/**
 * 新版本提示的纯逻辑：比对构建戳、记住被「稍后」的版本、拉取线上 version.json。
 *
 * 背景：部署后，已经开着的旧标签页会一直跑旧代码（2026-11-14 实测：跨部署的
 * 浏览器检查读到的就是旧一代样式）。构建端（cloudflare/scripts/web.mjs）把
 * 本次构建的版本戳同时嵌入包体（VITE_BUILD_ID）并写成静态文件 version.json；
 * 这里负责「线上戳 ≠ 本页戳 → 有新版本」的判定。组件层（UpdateBanner）只做
 * 接线：定时/回前台/换路由时检查、训练中不展示、只有点「刷新」才整页刷新——
 * 本模块与组件都不存在任何自动刷新路径。
 */

export const UPDATE_CHECK_INTERVAL_MS = 180_000;
export const UPDATE_DISMISSED_KEY = 'movemate:update-dismissed';
export const VERSION_FILE_URL = '/version.json';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** version.json 形如 {"version":"<构建戳>"}；形状不对一律当作读不到。 */
export function parseVersionFile(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const version = (data as { version?: unknown }).version;
  return typeof version === 'string' && version.trim() ? version : null;
}

/** 线上版本与本标签页构建时嵌入的版本不同 → 有新版本。任一缺失都不提示。 */
export function isUpdateAvailable(
  current: string | null | undefined,
  latest: string | null | undefined,
): boolean {
  if (!current || !latest) return false;
  return current !== latest;
}

export function readDismissedVersion(storage: StorageLike | null): string | null {
  try {
    return storage?.getItem(UPDATE_DISMISSED_KEY) || null;
  } catch {
    return null;
  }
}

/** 「稍后」只记住这一个版本：它不再提示；之后再部署更新的版本会重新提示。 */
export function dismissVersion(storage: StorageLike | null, version: string): void {
  try {
    storage?.setItem(UPDATE_DISMISSED_KEY, version);
  } catch {
    /* 存储不可用时静默：本次会话内仍由组件状态挡住 */
  }
}

/**
 * 是否展示提示条：有新版本、这个版本没被「稍后」过、且当前不在训练中。
 * sessionActive 由运动 store 的 sessions 推导（running/paused 即进行中，
 * 与 Training 页自己的「进行中」判定同一条线），训练结束状态变化后自然放行。
 */
export function shouldShowUpdateBanner(input: {
  current: string | null | undefined;
  latest: string | null | undefined;
  dismissedVersion: string | null;
  sessionActive: boolean;
}): boolean {
  if (input.sessionActive) return false;
  if (!isUpdateAvailable(input.current, input.latest)) return false;
  return input.dismissedVersion !== input.latest;
}

export type VersionFetch = (
  url: string,
  init?: { cache?: string },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** 拉线上版本；任何失败（断网、404、内容不对）都静默返回 null，绝不抛错、绝不提示。 */
export async function fetchLatestVersion(
  fetchImpl: VersionFetch,
  url: string = VERSION_FILE_URL,
): Promise<string | null> {
  try {
    const res = await fetchImpl(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return parseVersionFile(await res.json());
  } catch {
    return null;
  }
}
