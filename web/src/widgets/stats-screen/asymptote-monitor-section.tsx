"use client";

import { V2Card, V2Chip, type V2ChipTone } from "@/components/v2/primitives";
import type { AsymptoteMonitorResult } from "@/server/stats/asymptote-monitor-service";
import type { DriverKey, DriverTrendDirection } from "@/server/program-engine/asymptote-monitor";

type Locale = "ko" | "en";

const DRIVER_LABELS: Record<DriverKey, { ko: string; en: string; icon: string }> = {
  SQUAT: { ko: "스쿼트", en: "Squat", icon: "exercise" },
  BENCH: { ko: "벤치프레스", en: "Bench Press", icon: "fitness_center" },
  PULL: { ko: "중량풀업", en: "Weighted Pull-Up", icon: "trending_up" },
};

function trendChip(
  trend: DriverTrendDirection,
  locale: Locale,
): { tone: V2ChipTone; icon: string; label: string } {
  switch (trend) {
    case "RISING":
      return { tone: "success", icon: "trending_up", label: locale === "ko" ? "상승" : "Rising" };
    case "FALLING":
      return { tone: "danger", icon: "trending_down", label: locale === "ko" ? "하락" : "Falling" };
    case "FLAT":
      return { tone: "neutral", icon: "trending_flat", label: locale === "ko" ? "정체" : "Flat" };
    default:
      return {
        tone: "info",
        icon: "hourglass_empty",
        label: locale === "ko" ? "데이터 부족" : "Building",
      };
  }
}

export function AsymptoteMonitorSection({
  data,
  locale,
}: {
  data: AsymptoteMonitorResult;
  locale: Locale;
}) {
  return (
    <section style={{ display: "grid", gap: "var(--v2-s-3)" }}>
      <div style={{ display: "grid", gap: "var(--v2-s-1)" }}>
        <p className="v2-label">{locale === "ko" ? "하이브리드 모니터" : "Hybrid Monitor"}</p>
        <h2 className="v2-h2" style={{ letterSpacing: 0 }}>
          {locale === "ko" ? "드라이버 e1RM 추세" : "Driver e1RM Trend"}
        </h2>
        <p className="v2-small" style={{ maxWidth: "62ch", color: "var(--v2-ink-2)" }}>
          {locale === "ko"
            ? `드라이버 탑세트 e1RM의 ${data.window}세션 이동평균. AMRAP 블록 사이의 정체·하락을 미리 감지합니다.`
            : `${data.window}-session moving average of driver top-set e1RM — surfaces stalls between AMRAP blocks.`}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(144px, 1fr))",
          gap: "var(--v2-s-3)",
        }}
      >
        {data.drivers.map((driver) => {
          const meta = DRIVER_LABELS[driver.target];
          const chip = trendChip(driver.trend, locale);
          return (
            <V2Card
              key={driver.target}
              tone="paper"
              padding="var(--v2-s-4)"
              radius="var(--v2-r-2)"
              style={{
                minHeight: "var(--v2-s-9)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "var(--v2-s-3)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--v2-s-2)" }}>
                <p className="v2-label" style={{ color: "var(--v2-ink-2)" }}>
                  {locale === "ko" ? meta.ko : meta.en}
                </p>
                <V2Chip tone={chip.tone} icon={chip.icon}>
                  {chip.label}
                </V2Chip>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "var(--v2-s-1)" }}>
                  <span
                    className="v2-num-md v2-font-display"
                    style={{ color: "var(--v2-ink)", letterSpacing: 0 }}
                  >
                    {driver.latestMovingAvg !== null ? driver.latestMovingAvg.toFixed(1) : "-"}
                  </span>
                  <span className="v2-label" style={{ color: "var(--v2-ink-2)" }}>
                    kg
                  </span>
                </div>
                <p className="v2-small" style={{ marginTop: "var(--v2-s-1)", color: "var(--v2-ink-2)" }}>
                  {locale === "ko"
                    ? `이동평균 · ${driver.exposures}노출`
                    : `moving avg · ${driver.exposures} exposures`}
                </p>
              </div>
            </V2Card>
          );
        })}
      </div>
    </section>
  );
}
