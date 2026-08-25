"use client";

import { useId, useMemo } from "react";

/**
 * 도메인 무관 추이 라인 차트 — e1RM과 체중이 같은 구현을 쓴다.
 *
 * 원래 e1RM 전용이었고 스크럽·가이드선·영역 그라디언트는 처음부터 도메인 무관이었다.
 * 체중 추이를 붙이면서 복제 대신 여기로 뽑았다 — 같은 역할의 컴포넌트를 둘 두지
 * 않는다는 규칙(Hard Rule 5)이고, 실용적으로도 스크럽 상호작용을 두 벌 관리하고
 * 싶지 않다.
 */

export type TrendChartPoint = {
  /** 배지 매칭과 React key에 쓰는 안정 식별자(보통 날짜). */
  key: string;
  value: number;
};

export function clampIndex(index: number, length: number) {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

export function resolveIndex(clientX: number, left: number, width: number, length: number) {
  if (length <= 1 || width <= 0) return 0;
  const ratio = (clientX - left) / width;
  const bounded = Math.max(0, Math.min(1, ratio));
  return clampIndex(Math.round(bounded * (length - 1)), length);
}

export function TrendLineChart({
  points,
  activeIndex,
  onActiveIndexChange,
  ariaLabel,
  colorToken,
  guideDecimals = 0,
  badgeKeys,
  badgeLabel,
}: {
  points: TrendChartPoint[];
  activeIndex: number;
  onActiveIndexChange: (nextIndex: number) => void;
  ariaLabel: string;
  /** 선·영역 색. `currentColor`로 흘러 들어간다. */
  colorToken: string;
  /** y축 눈금 소수 자릿수. 체중은 변동 폭이 작아 1자리가 읽기 좋다. */
  guideDecimals?: number;
  /** 이 key를 가진 점에 배지를 그린다(e1RM의 PR 표시). */
  badgeKeys?: ReadonlySet<string>;
  badgeLabel?: string;
}) {
  // 한 화면에 차트가 둘 이상 있을 수 있다. 그라디언트 id가 고정이면 두 번째 차트가
  // 첫 번째의 정의를 물어 색이 어긋난다 — 인스턴스마다 유일한 id를 쓴다.
  const gradientId = `trend-chart-gradient-${useId().replace(/:/g, "")}`;

  const width = 1000;
  const height = 400;
  const padX = 60;
  const padY = 40;
  const drawWidth = width - padX * 2;
  const drawHeight = height - padY * 2;

  const chartGeometry = useMemo(() => {
    if (points.length === 0) {
      return {
        max: 0,
        span: 1,
        coords: [] as Array<{ x: number; y: number }>,
        linePath: "",
        areaPath: "",
      };
    }

    const values = points.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    const coords = points.map((point, index) => {
      const x =
        padX + (points.length === 1 ? drawWidth / 2 : (index * drawWidth) / (points.length - 1));
      const y = padY + drawHeight - ((point.value - min) / span) * drawHeight;
      return { x, y };
    });
    const linePath = coords
      .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x},${coord.y}`)
      .join(" ");
    const lastCoord = coords[coords.length - 1];
    const firstCoord = coords[0];
    const areaPath =
      lastCoord && firstCoord
        ? `${linePath} L ${lastCoord.x},${height - padY} L ${firstCoord.x},${height - padY} Z`
        : "";

    return { max, span, coords, linePath, areaPath };
  }, [drawHeight, drawWidth, height, padX, padY, points]);

  const selectedCoord = chartGeometry.coords[activeIndex];
  const yGuides = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div style={{ position: "relative", width: "100%", overflow: "hidden" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: "auto", display: "block", color: colorToken }}
        role="img"
        aria-label={ariaLabel}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onActiveIndexChange(resolveIndex(event.clientX, rect.left, rect.width, points.length));
        }}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          onActiveIndexChange(resolveIndex(event.clientX, rect.left, rect.width, points.length));
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {yGuides.map((ratio) => {
          const y = padY + drawHeight * ratio;
          const value = chartGeometry.max - chartGeometry.span * ratio;
          return (
            <g className="v2-font-num" key={ratio} style={{ color: "var(--v2-hairline)" }}>
              <line
                x1={padX}
                y1={y}
                x2={width - padX}
                y2={y}
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={padX - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                style={{
                  fill: "var(--v2-ink-3)",
                  fontSize: "var(--v2-t-14)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {value.toFixed(guideDecimals)}
              </text>
            </g>
          );
        })}

        {chartGeometry.areaPath ? (
          <path d={chartGeometry.areaPath} fill={`url(#${gradientId})`} />
        ) : null}
        {chartGeometry.linePath ? (
          <path
            d={chartGeometry.linePath}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {badgeKeys && badgeKeys.size > 0 && badgeLabel
          ? points.map((point, index) => {
              if (!badgeKeys.has(point.key)) return null;
              const pos = chartGeometry.coords[index];
              if (!pos) return null;
              return (
                <g className="v2-font-display" key={`badge-${point.key}`} aria-hidden>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={9}
                    fill="var(--v2-c-pr)"
                    stroke="var(--v2-bg)"
                    strokeWidth={2}
                    opacity={0.95}
                  />
                  <text
                    x={pos.x}
                    y={pos.y + 4.5}
                    textAnchor="middle"
                    style={{
                      fontSize: "var(--v2-t-label)",
                      fontWeight: 800,
                      fill: "var(--v2-ink-on-accent)",
                    }}
                  >
                    {badgeLabel}
                  </text>
                </g>
              );
            })
          : null}

        {selectedCoord ? (
          <g>
            <line
              x1={selectedCoord.x}
              y1={padY}
              x2={selectedCoord.x}
              y2={height - padY}
              stroke="var(--v2-accent)"
              strokeWidth="2"
              strokeDasharray="2 2"
            />
            <circle
              cx={selectedCoord.x}
              cy={selectedCoord.y}
              r={7}
              fill="var(--v2-bg)"
              stroke="var(--v2-accent)"
              strokeWidth="3"
            />
          </g>
        ) : null}
      </svg>
    </div>
  );
}
