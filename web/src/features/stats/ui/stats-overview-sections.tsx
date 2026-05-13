"use client";

import Link from "next/link";
import { memo } from "react";
import { useLocale } from "@/components/locale-provider";
import { PageHeader, SectionHeading, StateBlock } from "@/components/ui/page-layout";
import { APP_ROUTES } from "@/lib/app-routes";
import type { StatsBundleResult } from "@/server/stats/bundle-service";

export function StatsPageHeader() {
  const { locale } = useLocale();

  return (
    <PageHeader
      eyebrow={locale === "ko" ? "퍼포먼스" : "Performance"}
      title={locale === "ko" ? "통계" : "Stats"}
      description={
        locale === "ko"
          ? "훈련 성과, 볼륨 추이, 종목별 최고 기록을 분석합니다."
          : "Analyze training performance, volume trends, and exercise-specific records."
      }
    />
  );
}

export function StatsSectionHeading({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description?: string;
}) {
  return (
    <SectionHeading eyebrow={label} title={title} description={description} />
  );
}

const PrRow = memo(function PrRow({
  row,
}: {
  row: StatsBundleResult["prs90d"][number];
}) {
  const { locale } = useLocale();
  const improvement = row.improvement;
  const improvementColor =
    improvement > 0 ? "var(--v2-c-success)" : "var(--v2-ink-3)";

  return (
    <Link
      href={`${APP_ROUTES.statsHome}&exerciseId=${encodeURIComponent(row.exerciseId ?? "")}`}
      className="v2-pressable"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--v2-s-2)",
        padding: "var(--v2-s-3) var(--v2-s-3)",
        borderRadius: "var(--v2-r-2)",
        background: "var(--v2-paper)",
        boxShadow: "var(--v2-elev-1)",
        textDecoration: "none",
        transition: "background 0.12s ease",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          className="v2-body"
          style={{
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {row.exerciseName}
        </p>
        <div
          style={{
            display: "flex",
            gap: "var(--v2-s-3)",
            fontSize: 11,
            color: "var(--v2-ink-3)",
            fontFamily: "var(--v2-f-num)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>
            {locale === "ko" ? "최신" : "Latest"}{" "}
            <span
              style={{
                color: "var(--v2-ink)",
                fontWeight: 600,
              }}
            >
              {row.latest?.e1rm ?? "—"}kg
            </span>
          </span>
          <span>
            {locale === "ko" ? "최고" : "Best"}{" "}
            <span
              style={{
                color: "var(--v2-ink)",
                fontWeight: 600,
              }}
            >
              {row.best?.e1rm ?? "—"}kg
            </span>
          </span>
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p
          className="v2-num-sm"
          style={{
            color: improvementColor,
            letterSpacing: "-0.3px",
          }}
        >
          {improvement > 0
            ? `+${improvement}`
            : improvement === 0
              ? "0.0"
              : improvement}
        </p>
        <p
          className="v2-eyebrow"
          style={{
            letterSpacing: "0.08em",
          }}
        >
          IMPROVED
        </p>
      </div>
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: 16,
          color: "var(--v2-ink-3)",
          opacity: 0.5,
          flexShrink: 0,
          fontVariationSettings: "'FILL' 0, 'wght' 300",
        }}
        aria-hidden="true"
      >
        chevron_right
      </span>
    </Link>
  );
});

export function StatsPrSection({
  items,
}: {
  items: StatsBundleResult["prs90d"];
}) {
  const { locale } = useLocale();

  return (
    <div style={{ marginBottom: "var(--v2-s-7)" }}>
      <StatsSectionHeading
        label={locale === "ko" ? "개인 최고 기록" : "Personal Records"}
        title={locale === "ko" ? "PR 기록 추적" : "PR Tracking"}
        description={
          locale === "ko"
            ? "종목별 최고 기록과 기간 내 향상도"
            : "Review best lifts by exercise and improvement across the selected period."
        }
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-1)",
        }}
      >
        {items.length > 0 ? (
          items.map((row) => (
            <PrRow key={row.exerciseId ?? row.exerciseName} row={row} />
          ))
        ) : (
          <StateBlock
            title={
              locale === "ko" ? "표시할 PR 데이터가 없습니다" : "No PR data yet"
            }
            description={
              locale === "ko"
                ? "현재 선택한 기간에 개인 최고 기록 추이를 계산할 데이터가 없습니다."
                : "There is not enough data in the selected range to calculate personal record changes."
            }
            tone="accent"
          />
        )}
      </div>
    </div>
  );
}
