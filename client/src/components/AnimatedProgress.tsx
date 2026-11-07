import { useEffect, useRef, useState } from 'react';
import { animatedValueAt, prefersReducedMotion } from '../hooks/animateValue';

/**
 * 评分条生长（全局动效层 S2）：渲染原生 <progress>，元素首次进入视口后
 * 从 0 生长到目标值（放在 <details> 等折叠容器中时，展开后才触发）。
 * 系统开启减动效时直接到位。
 */
export default function AnimatedProgress({
  value,
  max = 100,
  duration = 320,
  delay = 0,
}: {
  value: number;
  max?: number;
  duration?: number;
  delay?: number;
}) {
  const ref = useRef<HTMLProgressElement>(null);
  const [shown, setShown] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    let raf = 0;
    let timer: number | undefined;
    let cleanupTimer = false;
    const run = () => {
      if (started.current) return;
      started.current = true;
      const start = () => {
        const t0 = performance.now();
        const step = (now: number) => {
          setShown(animatedValueAt(0, value, now - t0, duration));
          if (now - t0 < duration) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      };
      if (delay > 0) {
        timer = window.setTimeout(start, delay);
        cleanupTimer = true;
      } else start();
    };
    if (typeof IntersectionObserver === 'undefined') {
      run();
      return () => {
        cancelAnimationFrame(raf);
        if (cleanupTimer && timer !== undefined) window.clearTimeout(timer);
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      if (cleanupTimer && timer !== undefined) window.clearTimeout(timer);
    };
  }, [value, duration, delay]);

  return <progress ref={ref} max={max} value={shown} />;
}
