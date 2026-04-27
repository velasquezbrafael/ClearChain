'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * requestAnimationFrame count-up hook.
 * Animates from the previously displayed value to `to` over `duration` ms.
 * On the first render it counts up from 0. On subsequent changes it
 * animates from the current displayed value — so live +1 increments
 * feel like a smooth tick rather than a full reset.
 */
export function useCountUp(to: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  const rafRef  = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === to) return;

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    const startTs = performance.now();

    function step(ts: number) {
      const elapsed  = ts - startTs;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current  = Math.round(from + (to - from) * eased);
      setValue(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [to, duration]);

  return value;
}
