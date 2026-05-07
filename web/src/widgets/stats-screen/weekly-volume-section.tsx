"use client";

import { useMemo } from "react";
import { V2Card, V2Chip } from "@/components/v2/primitives";
import type { VolumeSeriesResult } from "@/server/stats/volume-series-service";

const TARGET_WEEKS = 8;

function formatTonnage(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}Mkg`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}t`;
  return `${Math.round(value).toLocaleString()}kg`;
}

function formatWeekLabel(period: string, locale: "ko" | "en") {
  const date = new Date(period);
  if (Number.isNaN(date.getTime())) return period;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

function takeLastWeeks(
  series: VolumeSeriesResult["series"],
  count: number,
): VolumeSeriesResult["series"] {
  if (series.length <= count) return series;
  return series.slice(series.length - count);
}

function VolumeBarChart({
  series,
  locale,
}: {
  series: VolumeSeriesResult["series"];
  locale: "ko" | "en";
}) {
  const width = 700;
  const height = 220;
  const padX = 24;
  const padY = 28;
  const drawWidth = width - padX * 2;
  const drawHeight = height - padY * 2;

  const max = useMemo(
    () => series.reduce((acc, point) => Math.max(acc, point.tonnage), 0),
    [series],
  );

  if (series.length === 0) {
    return (
      <p className="v2-small" style={{ color: "var(--v2-ink-2)", padding: 12 }}>
        {locale === "ko"
          ? "최근 8주 동안의 볼륨 데이터가 없습니다."
          : "No volume data for the last 8 weeks."}
      </p>
    );
  }

  const slotCount = Math.max(series.length, 1);
  const slotWidth = drawWidth / slotCount;
  const barWidth = Math.max(8, slotWidth * 0.62);
  const gap = slotWidth - barWidth;
  const safeMax = max <= 0 ? 1 : max;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label={locale === "ko" ? "주간 볼륨 트렌드" : "Weekly volume trend"}
    >
      <line
        x1={padX}
        y1={height - padY}
        x2={width - padX}
        y2={height - padY}
        stroke="var(--v2-hairline)"
        strokeWidth="1"
      />
      {series.map((point, index) => {
        const ratio = point.tonnage / safeMax;
        const barHeight = Math.max(2, ratio * drawHeight);
        const x = padX + index * slotWidth + gap / 2;
        const y = height - padY - barHeight;
        const isLast = index === series.length - 1;
        return (
          <g key={point.period}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={4}
              ry={4}
              fill={
                isLast
                  ? "var(--v2-accent)"
                  : "color-mix(in srgb, var(--v2-c-volume) 50%, var(--v2-paper))"
              }
            />
            <text
              x={x + barWidth / 2}
              y={height - padY + 14}
              textAnchor="middle"
              style={{
                fontFamily: "var(--v2-f-display)",
                fontSize: 9,
                fontWeight: 700,
                fill: "var(--v2-ink-3)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatWeekLabel(point.period, locale)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function WeeklyVolumeSection({
  data,
  locale,
}: {
  data: VolumeSeriesResult | null;
  locale: "ko" | "en";
}) {
  const series = useMemo(
    () => takeLastWeeks(data?.series ?? [], TARGET_WEEKS),
    [data],
  );

  const { recentTotal, priorTotal, deltaPct } = useMemo(() => {
    if (series.length === 0) {
      return { recentTotal: 0, priorTotal: 0, deltaPct: null as number | null };
    }
    const splitIndex = Math.max(1, Math.floor(series.length / 2));
    const recent = series.slice(splitIndex);
    const prior = series.slice(0, splitIndex);
    const sumTon = (rows: typeof series) =>
      rows.reduce((acc, row) => acc + row.tonnage, 0);
    const recentSum = sumTon(recent);
    const priorSum = sumTon(prior);
    let pct: number | null = null;
    if (priorSum > 0) {
      pct = ((recentSum - priorSum) / priorSum) * 100;
    } else if (recentSum > 0) {
      pct = 100;
    }
    return { recentTotal: recentSum, priorTotal: priorSum, deltaPct: pct };
  }, [series]);

  const deltaTone =
    deltaPct == null
      ? "neutral"
      : deltaPct > 0
        ? "success"
        : deltaPct < 0
          ? "danger"
          : "neutral";

  const deltaText =
    deltaPct == null
      ? "—"
      : `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%`;

  return (
    <section style={{ display: "grid", gap: "var(--v2-s-3)" }}>
      <div style={{ display: "grid", gap: 4 }}>
        <p className="v2-label">
          {locale === "ko" ? "볼륨 트렌드" : "Volume Trend"}
        </p>
        <h2 className="v2-h2" style={{ fontSize: 22, letterSpacing: 0 }}>
          {locale === "ko" ? "주간 볼륨 (최근 8주)" : "Weekly Volume (Last 8 Weeks)"}
        </h2>
        <p className="v2-small" style={{ maxWidth: 560 }}>
          {locale === "ko"
            ? "최근 8주 주간 총 톤수 추이와 전반·후반 비교 변화량을 확인합니다."
            : "Weekly tonnage over the last 8 weeks and the percent change between the first and second halves."}
        </p>
      </div>

      <V2Card
        tone="paper"
        padding="var(--v2-s-4)"
        radius="var(--v2-r-1)"
        style={{ border: "1px solid var(--v2-hairline)" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: "var(--v2-s-3)",
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <span
              className="v2-num-md"
              style={{
                color: "var(--v2-ink)",
                letterSpacing: 0,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatTonnage(recentTotal)}
            </span>
            <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
              {locale === "ko" ? "최근 4주 합계" : "Recent 4 weeks total"}
            </span>
          </div>
          <div style={{ display: "grid", gap: 4, alignItems: "flex-end" }}>
            <V2Chip tone={deltaTone} icon={
              deltaPct == null
                ? "remove"
                : deltaPct > 0
                  ? "trending_up"
                  : deltaPct < 0
                    ? "trending_down"
                    : "remove"
            }>
              {deltaText}
            </V2Chip>
            <span className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
              {locale === "ko"
                ? `전반 4주 ${formatTonnage(priorTotal)} 대비`
                : `vs. prior 4 weeks ${formatTonnage(priorTotal)}`}
            </span>
          </div>
        </div>

        <VolumeBarChart series={series} locale={locale} />
      </V2Card>
    </section>
  );
}
