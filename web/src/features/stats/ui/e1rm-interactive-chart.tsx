"use client";

import { useMemo } from "react";
import type { E1RMPoint } from "@/features/stats/model/stats-1rm-types";
import { TrendLineChart } from "./trend-line-chart";

// 스크럽 좌표 계산은 TrendLineChart가 소유한다. 기존 import 경로를 쓰는 호출자·테스트를
// 위해 여기서 재수출한다.
export { clampIndex, resolveIndex } from "./trend-line-chart";

/** e1RM 추이 — 공통 차트에 도메인 라벨·색·PR 배지를 입힌 얇은 래퍼. */
export function E1RMInteractiveChart({
  series,
  activeIndex,
  onActiveIndexChange,
  locale,
  prDates,
}: {
  series: E1RMPoint[];
  activeIndex: number;
  onActiveIndexChange: (nextIndex: number) => void;
  locale: "ko" | "en";
  prDates?: ReadonlySet<string>;
}) {
  const points = useMemo(
    () => series.map((point) => ({ key: point.date, value: point.e1rm })),
    [series],
  );

  return (
    <TrendLineChart
      points={points}
      activeIndex={activeIndex}
      onActiveIndexChange={onActiveIndexChange}
      ariaLabel={locale === "ko" ? "1RM 추이 차트" : "1RM trend chart"}
      colorToken="var(--v2-c-onerm)"
      badgeKeys={prDates}
      badgeLabel="PR"
    />
  );
}
