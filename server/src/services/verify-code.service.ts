/**
 * 验证码服务 —— 内存存储，带过期清理
 */

interface CodeEntry {
  code: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}

// 允许的校园邮箱后缀
export const ALLOWED_EMAIL_SUFFIXES = [
  '@mails.jlu.edu.cn',
  '@jlu.edu.cn',
];

/** 发送冷却时间（毫秒）——防止刷验证码轰炸邮箱 */
export const SEND_COOLDOWN_MS = 60 * 1000;

const store = new Map<string, CodeEntry>();

// 每 60 秒清理过期验证码
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt < now) store.delete(key);
  }
}, 60000).unref();

/** 生成长度为 6 的数字验证码 */
function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** 校验邮箱后缀 */
export function isAllowedEmail(email: string): boolean {
  return ALLOWED_EMAIL_SUFFIXES.some(suffix => email.toLowerCase().endsWith(suffix));
}

/**
 * 生成并存储验证码
 * @throws 若距上次发送不足 SEND_COOLDOWN_MS，抛出错误拒绝发送
 */
export function createCode(email: string): string {
  const key = email.toLowerCase();
  const existing = store.get(key);
  if (existing && Date.now() - existing.lastSentAt < SEND_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((SEND_COOLDOWN_MS - (Date.now() - existing.lastSentAt)) / 1000);
    throw new Error(`发送过于频繁，请 ${waitSeconds} 秒后再试`);
  }

  const code = generateCode();
  store.set(key, {
    code,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 分钟
    attempts: 0,
    lastSentAt: Date.now(),
  });
  return code;
}

/** 验证验证码。成功返回 true 并删除记录，失败返回 false */
export function verifyCode(email: string, input: string): boolean {
  const key = email.toLowerCase();
  const entry = store.get(key);

  if (!entry) return false;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return false;
  }

  entry.attempts += 1;
  if (entry.attempts > 5) {
    store.delete(key); // 超过 5 次尝试，作废
    return false;
  }

  if (entry.code !== input) return false;

  // 验证成功，删除验证码
  store.delete(key);
  return true;
}
