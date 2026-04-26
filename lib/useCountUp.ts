'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * requestAnimationFrame-based count-up hook.
 * Animates from 0 to `to` over `duration` ms using an ease-out cubic curve.
 */
export function useCountUp(to: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const rafRef  = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    startRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

    function step(ts: number) {
      if (startRef.current === null) startRef.current = ts;
      const elapsed  = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * to));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [to, duration]);

  return value;
}
