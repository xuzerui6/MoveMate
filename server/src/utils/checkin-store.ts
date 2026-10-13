/**
 * 签到短码存储（内存，服务重启后失效）
 * 用短随机码替代 JWT 长链接，避免 QQ 邮箱安全拦截
 */
import crypto from 'crypto';

interface CheckinEntry {
  userId: number;
  gameId: number;
  expiresAt: number;
}

const store = new Map<string, CheckinEntry>();

// 每小时清理一次过期条目
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of store) {
    if (entry.expiresAt < now) store.delete(code);
  }
}, 60 * 60 * 1000).unref();

/** 生成一个 8 位短码，有效 24 小时 */
export function createCheckinCode(userId: number, gameId: number): string {
  const code = crypto.randomBytes(4).toString('hex'); // 8 hex chars
  store.set(code, { userId, gameId, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return code;
}

/** 验证并消费短码，返回 {userId, gameId} 或 null */
export function verifyCheckinCode(code: string): { userId: number; gameId: number } | null {
  const entry = store.get(code);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(code);
    return null;
  }
  // 一次性的：验证完就删除
  store.delete(code);
  return { userId: entry.userId, gameId: entry.gameId };
}
