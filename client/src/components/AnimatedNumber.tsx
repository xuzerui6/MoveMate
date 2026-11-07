import { useEffect, useRef, useState } from 'react';
import { animatedValueAt, prefersReducedMotion } from '../hooks/animateValue';

/**
 * 数字滚动（全局动效层 S2/S5）：
 * - fromZero 时挂载后从 0 滚动到目标值（结算分数 / 获得 XP 等达成时刻）；
 * - 否则挂载直接显示目标值，后续数值变化时从当前显示值平滑过渡（连续天数 / 当前经验）；
 * - 系统开启减动效时直接显示最终值，不滚动。
 */
export default function AnimatedNumber({
  value,
  duration = 480,
  delay = 0,
  fromZero = false,
}: {
  value: number;
  duration?: number;
  delay?: number;
  fromZero?: boolean;
}) {
  const [display, setDisplay] = useState(() => (fromZero ? 0 : value));
  const displayRef = useRef(display);
  displayRef.current = display;
  const mounted = useRef(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
      mounted.current = true;
      return;
    }
    const from = !mounted.current && !fromZero ? value : displayRef.current;
    mounted.current = true;
    if (from === value) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    let timer: number | undefined;
    const start = () => {
      const t0 = performance.now();
      const step = (now: number) => {
        setDisplay(Math.round(animatedValueAt(from, value, now - t0, duration)));
        if (now - t0 < duration) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    if (delay > 0) timer = window.setTimeout(start, delay);
    else start();
    return () => {
      cancelAnimationFrame(raf);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [value, duration, delay, fromZero]);

  return <>{display}</>;
}
