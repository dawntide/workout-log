"use client";

import { useMemo, useState } from "react";

import { useLocale } from "@/components/locale-provider";
import { V2Card, V2SecondaryBtn } from "@/components/v2/primitives";
import { useBodyweightHistory } from "@/features/stats/model/use-bodyweight-history";
import { BodyweightRecordSheet } from "@/features/stats/ui/bodyweight-record-sheet";
import { TrendLineChart } from "@/features/stats/ui/trend-line-chart";

type Locale = "ko" | "en";

function formatDate(iso: string, locale: Locale) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * 체중 추이. 차트는 e1RM과 같은 구현(TrendLineChart)을 쓰고 색·라벨만 다르다.
 *
 * 기록이 없으면 빈 상태다 — 설정의 단일 체중값을 점 하나로 그리지 않는다. 그 값은
 * "오늘 체중"이지 측정 이력이 아니라서, 차트에 올리면 없는 시점을 지어내게 된다
 * (계획서 docs/bodyweight-timeseries-plan.md 결정 1).
 */
export function BodyweightTrendSection({ locale }: { locale: Locale }) {
  const { locale: contextLocale } = useLocale();
  const resolvedLocale = locale ?? contextLocale;
  const ko = resolvedLocale === "ko";

  const { entries, loading, record } = useBodyweightHistory();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // API는 최신순으로 준다. 차트는 시간순이라 뒤집는다.
  const chronological = useMemo(() => (entries ? [...entries].reverse() : []), [entries]);
  const points = useMemo(
    () => chronological.map((entry) => ({ key: entry.id, value: entry.valueKg })),
    [chronological],
  );

  const latest = entries?.[0] ?? null;
  const selectedIndex = activeIndex >= 0 ? Math.min(activeIndex, points.length - 1) : points.length - 1;
  const selected = chronological[selectedIndex] ?? null;

  const delta = useMemo(() => {
    if (chronological.length < 2) return null;
    const first = chronological[0]!.valueKg;
    const last = chronological[chronological.length - 1]!.valueKg;
    return Math.round((last - first) * 10) / 10;
  }, [chronological]);

  return (
    <section style={{ display: "grid", gap: "var(--v2-s-3)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "var(--v2-s-3)",
        }}
      >
        <div style={{ display: "grid", gap: "var(--v2-s-1)" }}>
          <p className="v2-label">{ko ? "신체" : "Body"}</p>
          <h2 className="v2-h2" style={{ letterSpacing: 0 }}>
            {ko ? "체중 추이" : "Bodyweight Trend"}
          </h2>
        </div>
        <V2SecondaryBtn icon="add" onClick={() => setSheetOpen(true)}>
          {ko ? "기록" : "Record"}
        </V2SecondaryBtn>
      </div>

      <V2Card>
        {loading && entries === null ? (
          <p className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
            {ko ? "불러오는 중…" : "Loading…"}
          </p>
        ) : points.length === 0 ? (
          <p className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
            {ko
              ? "기록이 없습니다. 체중을 기록하면 추이가 그려지고, 강도 지표가 그 시점 체중으로 계산됩니다."
              : "No entries yet. Record your bodyweight to see the trend and have strength metrics use the weight from each session."}
          </p>
        ) : (
          <div style={{ display: "grid", gap: "var(--v2-s-3)" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div className="v2-font-num">
                <span className="v2-h1" style={{ letterSpacing: 0 }}>
                  {(selected ?? latest)?.valueKg.toFixed(1)}
                </span>
                <span className="v2-small" style={{ marginLeft: 2, color: "var(--v2-ink-2)" }}>
                  kg
                </span>
                <span
                  className="v2-small"
                  style={{ display: "block", color: "var(--v2-ink-2)" }}
                >
                  {selected ? formatDate(selected.measuredAt, resolvedLocale) : "-"}
                </span>
              </div>
              {delta !== null ? (
                <div style={{ textAlign: "right" }}>
                  <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
                    {ko ? "구간 변화" : "Change"}
                  </span>
                  <span
                    className="v2-font-num"
                    style={{
                      display: "block",
                      fontSize: "var(--v2-t-18)",
                      fontWeight: 700,
                      color: delta === 0 ? "var(--v2-ink-2)" : "var(--v2-c-weight)",
                    }}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(1)}kg
                  </span>
                </div>
              ) : null}
            </div>

            <TrendLineChart
              points={points}
              activeIndex={selectedIndex}
              onActiveIndexChange={setActiveIndex}
              ariaLabel={ko ? "체중 추이 차트" : "Bodyweight trend chart"}
              colorToken="var(--v2-c-weight)"
              guideDecimals={1}
            />
          </div>
        )}
      </V2Card>

      <BodyweightRecordSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        currentKg={latest?.valueKg ?? null}
        onSubmit={record}
      />
    </section>
  );
}
