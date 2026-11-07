/**
 * 全局动效层 · 数值动画纯函数（设计 v1，S2/S5 共用）
 * 缓动取向与 design-system.css 的 --ease-out 令牌一致（快进慢停），
 * 这里给出可在 JS/rAF 中使用的三次方近似实现。
 */

/** easeOut 三次方曲线：t∈[0,1] → [0,1]，快进慢停 */
export function easeOutCubic(t: number): number {
  const p = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - p, 3);
}

/**
 * 在 elapsedMs 时刻，数值从 from 到 to 的插值结果。
 * elapsed<=0 取 from，elapsed>=duration 取 to，duration<=0 直接取 to。
 */
export function animatedValueAt(from: number, to: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return to;
  if (elapsedMs <= 0) return from;
  if (elapsedMs >= durationMs) return to;
  return from + (to - from) * easeOutCubic(elapsedMs / durationMs);
}

/** 当前环境是否要求减动效（prefers-reduced-motion: reduce） */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
