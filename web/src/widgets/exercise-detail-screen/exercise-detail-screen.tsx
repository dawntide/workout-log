"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { V2Card, V2Chip, V2Hairline, V2IconBtn } from "@/components/v2/primitives";
import { AppPage } from "@/components/ui/page-layout";
import { useLocale } from "@/components/locale-provider";
import { useThemeSkin } from "@/components/use-theme-skin";
import { ExerciseDetailTuiView } from "./exercise-detail-tui-view";
import {
  E1RMInteractiveChart,
  clampIndex,
} from "@/features/stats/ui/e1rm-interactive-chart";
import { Stats1RMChartSection } from "@/features/stats/ui/stats-1rm-chart-section";
import type { E1RMResponse } from "@/features/stats/model/stats-1rm-types";
import type {
  ExerciseDetailBootstrap,
  ExerciseDetailPrPoint,
  ExerciseDetailSet,
} from "@/server/services/exercises/get-exercise-detail-bootstrap";

type LoadedBootstrap = Extract<ExerciseDetailBootstrap, { exercise: object }>;
type ExerciseDetailScreenProps = LoadedBootstrap;

function formatKg(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}t`;
  return `${Math.round(value).toLocaleString()}kg`;
}

function formatDate(value: string | null | undefined, locale: "ko" | "en") {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatYearMonthDay(value: string, locale: "ko" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function MetricCard({
  label,
  value,
  unit,
  caption,
  color,
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  caption: string;
  color: string;
  icon: string;
}) {
  return (
    <V2Card
      tone="paper"
      padding="var(--v2-s-4)"
      radius="var(--v2-r-1)"
      style={{
        minHeight: "var(--v2-s-9)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--v2-s-3)" }}>
        <p className="v2-label" style={{ color: "var(--v2-ink-2)" }}>
          {label}
        </p>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "var(--v2-t-18)", color }}
          aria-hidden="true"
        >
          {icon}
        </span>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "var(--v2-s-1)" }}>
          <span
            className="v2-num-md v2-font-display"
            style={{ color: "var(--v2-ink)", letterSpacing: 0 }}
          >
            {value}
          </span>
          {unit ? (
            <span
              style={{
                fontSize: "var(--v2-t-small)",
                fontWeight: 700,
                color: "var(--v2-ink-2)",
              }}
            >
              {unit}
            </span>
          ) : null}
        </div>
        <p className="v2-small" style={{ marginTop: "var(--v2-s-1)", color: "var(--v2-ink-2)" }}>
          {caption}
        </p>
      </div>
    </V2Card>
  );
}

function SectionTitle({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description?: string;
}) {
  return (
    <div style={{ display: "grid", gap: "var(--v2-s-1)" }}>
      <p className="v2-label">{label}</p>
      <h2 className="v2-h2" style={{ fontSize: "var(--v2-t-h2)", letterSpacing: 0 }}>
        {title}
      </h2>
      {description ? (
        <p className="v2-small" style={{ maxWidth: 560 }}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

function PrHistory({
  items,
  locale,
}: {
  items: ExerciseDetailPrPoint[];
  locale: "ko" | "en";
}) {
  if (items.length === 0) {
    return (
      <V2Card
        tone="inset"
        padding="var(--v2-s-5)"
        radius="var(--v2-r-1)"
      >
        <p className="v2-h3" style={{ fontSize: "var(--v2-t-16)" }}>
          {locale === "ko" ? "PR 기록이 아직 없습니다" : "No PR history yet"}
        </p>
        <p className="v2-small" style={{ marginTop: "var(--v2-s-1)" }}>
          {locale === "ko"
            ? "최근 90일 동안 더 많은 세트를 기록하면 PR 진행이 표시됩니다."
            : "PR progression appears after more sets are logged in the last 90 days."}
        </p>
      </V2Card>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--v2-s-2)" }}>
      {items.map((row) => (
        <V2Card
          key={`${row.date}-${row.e1rm}`}
          tone="paper"
          padding="14px 16px"
          radius="var(--v2-r-1)"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            alignItems: "center",
            gap: "var(--v2-s-3)",
          }}
        >
          <div className="v2-font-display" style={{ minWidth: 0 }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: "var(--v2-t-body)",
                color: "var(--v2-ink)",
              }}
            >
              {row.e1rm.toFixed(1)}kg
              <span
                style={{
                  fontWeight: 600,
                  fontSize: "var(--v2-t-12)",
                  color: "var(--v2-ink-2)",
                  marginLeft: 8,
                }}
              >
                {row.weightKg}kg × {row.reps}
                {locale === "ko" ? "회" : " reps"}
              </span>
            </div>
            <div
              style={{
                marginTop: "var(--v2-s-1)",
                fontSize: "var(--v2-t-12)",
                color: "var(--v2-ink-2)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatYearMonthDay(row.date, locale)}
            </div>
          </div>
          <V2Chip tone="pr" icon="workspace_premium">
            PR
          </V2Chip>
        </V2Card>
      ))}
    </div>
  );
}

function RecentSets({
  items,
  locale,
}: {
  items: ExerciseDetailSet[];
  locale: "ko" | "en";
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, ExerciseDetailSet[]>();
    for (const set of items) {
      const dayKey = set.performedAt.slice(0, 10);
      const list = map.get(dayKey) ?? [];
      list.push(set);
      map.set(dayKey, list);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [items]);

  if (grouped.length === 0) {
    return (
      <V2Card
        tone="inset"
        padding="var(--v2-s-5)"
        radius="var(--v2-r-1)"
      >
        <p className="v2-h3" style={{ fontSize: "var(--v2-t-16)" }}>
          {locale === "ko" ? "최근 세트 기록이 없습니다" : "No recent sets"}
        </p>
        <p className="v2-small" style={{ marginTop: "var(--v2-s-1)" }}>
          {locale === "ko"
            ? "운동 기록이 추가되면 최근 세트가 여기 표시됩니다."
            : "Recent sets appear here once logs are added."}
        </p>
      </V2Card>
    );
  }

  return (
    <div className="v2-font-display" style={{ display: "grid", gap: "var(--v2-s-3)" }}>
      {grouped.map(([day, sets]) => (
        <V2Card
          key={day}
          tone="inset"
          padding="14px 16px"
          radius="var(--v2-r-1)"
          >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: "var(--v2-s-2)",
            }}
          >
            <span
              style={{
                fontWeight: 800,
                fontSize: "var(--v2-t-14)",
                color: "var(--v2-ink)",
              }}
            >
              {formatYearMonthDay(`${day}T00:00:00.000Z`, locale)}
            </span>
            <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
              {sets.length}
              {locale === "ko" ? " 세트" : " sets"}
            </span>
          </div>
          <div style={{ display: "grid", gap: "var(--v2-s-1)" }}>
            {sets.map((set, idx) => (
              <div
                key={`${set.logId}-${idx}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "baseline",
                  gap: "var(--v2-s-3)",
                  fontSize: "var(--v2-t-small)",
                  color: "var(--v2-ink)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span style={{ color: "var(--v2-ink-3)", minWidth: "var(--v2-s-7)" }}>
                  #{idx + 1}
                </span>
                <span>
                  <strong style={{ fontWeight: 700 }}>{set.weightKg}kg</strong>
                  <span style={{ color: "var(--v2-ink-2)", margin: "0 6px" }}>×</span>
                  <strong style={{ fontWeight: 700 }}>{set.reps}</strong>
                  {locale === "ko" ? "회" : " reps"}
                </span>
                <span style={{ color: "var(--v2-ink-2)" }}>
                  {set.rpe == null
                    ? locale === "ko"
                      ? "RPE -"
                      : "RPE -"
                    : `RPE ${set.rpe}`}
                </span>
              </div>
            ))}
          </div>
        </V2Card>
      ))}
    </div>
  );
}

export function ExerciseDetailScreen({
  exercise,
  bestE1rm,
  e1rmSeries,
  recentSets,
  prHistory,
  sessions90d,
  totalVolume90d,
  avgRpe90d,
  rangeFrom,
  rangeTo,
}: ExerciseDetailScreenProps) {
  const { locale } = useLocale();
  const router = useRouter();
  const skin = useThemeSkin();
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    Math.max(0, e1rmSeries.length - 1),
  );

  const hasChartData = e1rmSeries.length > 0;
  const resolvedActiveIndex = hasChartData
    ? clampIndex(activeIndex, e1rmSeries.length)
    : 0;
  const activePoint = hasChartData ? e1rmSeries[resolvedActiveIndex] : null;
  const prDateSet = useMemo(
    () => new Set(prHistory.map((point) => point.date)),
    [prHistory],
  );

  const statsForChart: E1RMResponse | null = hasChartData
    ? {
        from: rangeFrom,
        to: rangeTo,
        rangeDays: 90,
        exercise: exercise.name,
        exerciseId: exercise.id,
        best: bestE1rm,
        series: e1rmSeries,
      }
    : null;

  if (skin === "terminal") {
    return (
      <ExerciseDetailTuiView
        exercise={exercise}
        bestE1rm={bestE1rm}
        e1rmSeries={e1rmSeries}
        recentSets={recentSets}
        prHistory={prHistory}
        sessions90d={sessions90d}
        totalVolume90d={totalVolume90d}
        avgRpe90d={avgRpe90d}
        rangeFrom={rangeFrom}
        rangeTo={rangeTo}
      />
    );
  }

  return (
    <AppPage>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: "var(--v2-s-5)",
          paddingBottom: "var(--v2-s-8)",
        }}
      >
        <header
          style={{
            display: "grid",
            gap: "var(--v2-s-4)",
            paddingTop: "var(--v2-s-2)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--v2-s-3)",
            }}
          >
            <V2IconBtn
              icon="arrow_back"
              onClick={() => router.back()}
              label={locale === "ko" ? "뒤로" : "Back"}
              size={36}
            />
            <p className="v2-label">
              {locale === "ko" ? "운동 상세" : "Exercise detail"}
            </p>
          </div>
          <div style={{ display: "grid", gap: "var(--v2-s-1)" }}>
            <h1
              className="v2-h1"
              style={{ letterSpacing: 0, fontSize: "var(--v2-t-28)" }}
            >
              {exercise.name}
            </h1>
            <div style={{ display: "flex", gap: "var(--v2-s-2)", flexWrap: "wrap" }}>
              {exercise.category ? (
                <V2Chip tone="neutral">{exercise.category}</V2Chip>
              ) : null}
              <V2Chip tone="accent" icon="bolt">
                {locale === "ko" ? "최근 90일" : "Last 90 days"}
              </V2Chip>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(144px, 1fr))",
              gap: "var(--v2-s-3)",
            }}
          >
            <MetricCard
              label={locale === "ko" ? "최고 e1RM" : "Best e1RM"}
              value={bestE1rm ? bestE1rm.e1rm.toFixed(1) : "-"}
              unit="kg"
              caption={
                bestE1rm
                  ? formatDate(bestE1rm.date, locale)
                  : locale === "ko"
                    ? "데이터 없음"
                    : "No data"
              }
              color="var(--v2-c-onerm)"
              icon="show_chart"
            />
            <MetricCard
              label={locale === "ko" ? "90일 세션" : "90d sessions"}
              value={sessions90d.toLocaleString()}
              unit={locale === "ko" ? "회" : ""}
              caption={locale === "ko" ? "수행 횟수" : "Total sessions"}
              color="var(--v2-c-progress)"
              icon="calendar_month"
            />
            <MetricCard
              label={locale === "ko" ? "90일 볼륨" : "90d volume"}
              value={formatKg(totalVolume90d)}
              caption={locale === "ko" ? "총 중량 합계" : "Total tonnage"}
              color="var(--v2-c-volume)"
              icon="fitness_center"
            />
            <MetricCard
              label={locale === "ko" ? "평균 RPE" : "Avg RPE"}
              value={avgRpe90d == null ? "-" : avgRpe90d.toFixed(1)}
              caption={
                avgRpe90d == null
                  ? locale === "ko"
                    ? "RPE 기록 없음"
                    : "No RPE entries"
                  : locale === "ko"
                    ? "최근 90일 평균"
                    : "Last 90 days"
              }
              color="var(--v2-c-reps)"
              icon="bolt"
            />
          </div>
        </header>

        <section style={{ display: "grid", gap: "var(--v2-s-3)" }}>
          <SectionTitle
            label={locale === "ko" ? "추이 분석" : "Trend Analysis"}
            title={locale === "ko" ? "e1RM 추이" : "e1RM Trend"}
            description={
              locale === "ko"
                ? "최근 90일 동안의 1RM 추정 변화를 차트로 확인합니다."
                : "Estimated 1RM changes across the last 90 days."
            }
          />
          {hasChartData ? (
            <Stats1RMChartSection
              locale={locale}
              stats={statsForChart}
              activePoint={activePoint}
              chart={
                <E1RMInteractiveChart
                  series={e1rmSeries}
                  activeIndex={resolvedActiveIndex}
                  onActiveIndexChange={setActiveIndex}
                  prDates={prDateSet}
                  locale={locale}
                />
              }
            />
          ) : (
            <V2Card
              tone="inset"
              padding="var(--v2-s-5)"
              radius="var(--v2-r-1)"
                  >
              <p className="v2-h3" style={{ fontSize: "var(--v2-t-16)" }}>
                {locale === "ko" ? "표시할 차트 데이터가 없습니다" : "No chart data"}
              </p>
              <p className="v2-small" style={{ marginTop: "var(--v2-s-1)" }}>
                {locale === "ko"
                  ? "운동 기록이 추가되면 e1RM 추이가 표시됩니다."
                  : "The e1RM trend appears once logs are added."}
              </p>
            </V2Card>
          )}
        </section>

        <section style={{ display: "grid", gap: "var(--v2-s-3)" }}>
          <SectionTitle
            label={locale === "ko" ? "PR 진행" : "PR Progression"}
            title={locale === "ko" ? "최근 PR" : "Recent PRs"}
            description={
              locale === "ko"
                ? "최근 90일 동안 새로 갱신된 e1RM PR 기록입니다."
                : "PRs set within the last 90 days."
            }
          />
          <V2Hairline />
          <PrHistory items={prHistory} locale={locale} />
        </section>

        <section style={{ display: "grid", gap: "var(--v2-s-3)" }}>
          <SectionTitle
            label={locale === "ko" ? "최근 세트" : "Recent Sets"}
            title={locale === "ko" ? "최근 세트 기록" : "Recent Set Log"}
            description={
              locale === "ko"
                ? "최근 30개 세트를 날짜별로 묶어 보여줍니다."
                : "Last 30 sets grouped by date."
            }
          />
          <V2Hairline />
          <RecentSets items={recentSets} locale={locale} />
        </section>
      </div>
    </AppPage>
  );
}
