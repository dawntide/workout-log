"use client";

import { useCallback, useEffect, useState } from "react";

// 소형 휴식 타이머(client-only) — TUI 휴식바용. 세트 완료(✓) 시 start(seconds)로
// 시작, [−15]/[+15]로 adjust, 0 도달 시 자동 정지. Date.now() 기반(서버 비의존,
// 렌더에서 시간 안 읽음 → SSR/하이드레이션 영향 0). redesign-target.md §6.
export type RestTimer = {
  running: boolean;
  remainingSec: number;
  totalSec: number;
  start: (seconds: number) => void;
  adjust: (deltaSeconds: number) => void;
  stop: () => void;
};

const TICK_MS = 500;

export function useRestTimer(): RestTimer {
  const [endAt, setEndAt] = useState<number | null>(null);
  const [totalSec, setTotalSec] = useState(0);
  const [now, setNow] = useState(0);

  // endAt이 설정된 동안만 tick → 비활성 시 re-render/타이머 0.
  useEffect(() => {
    if (endAt === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [endAt]);

  const remainingMs = endAt === null ? 0 : Math.max(0, endAt - now);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const running = endAt !== null && remainingMs > 0;

  // 0 도달 시 자동 정지.
  useEffect(() => {
    if (endAt !== null && remainingMs <= 0) setEndAt(null);
  }, [endAt, remainingMs]);

  const start = useCallback((seconds: number) => {
    const safe = Math.max(1, Math.round(seconds));
    setTotalSec(safe);
    setNow(Date.now());
    setEndAt(Date.now() + safe * 1000);
  }, []);

  const adjust = useCallback((deltaSeconds: number) => {
    setEndAt((prev) => (prev === null ? prev : prev + deltaSeconds * 1000));
    setTotalSec((t) => Math.max(1, t + deltaSeconds));
    setNow(Date.now());
  }, []);

  const stop = useCallback(() => setEndAt(null), []);

  return { running, remainingSec, totalSec, start, adjust, stop };
}
