"use client";

import { useEffect, useRef, useState } from "react";

export function V2CountUp({
  to,
  duration = 800,
  format = (v: number) => Math.round(v).toString(),
}: {
  to: number;
  duration?: number;
  format?: (v: number) => string;
}) {
  const [v, setV] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    let start: number | null = null;
    const step = (t: number) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(eased * to);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [to, duration]);
  return <>{format(v)}</>;
}
