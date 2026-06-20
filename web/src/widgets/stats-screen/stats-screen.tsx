"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { V2Card, V2Chip, V2Hairline } from "@/components/v2/primitives";
import { AppPage } from "@/components/ui/page-layout";
import type { Stats1RMDetailedRef } from "@/features/stats/ui/stats-1rm-detailed";
import type { StatsPageBootstrap } from "@/server/services/stats/get-stats-page-bootstrap";
import { useLocale } from "@/components/locale-provider";
import { useThemeSkin } from "@/components/use-theme-skin";
import { StatsTuiView } from "@/features/stats/ui/stats-tui-view";
import { APP_ROUTES } from "@/lib/app-routes";
import { GoalSection } from "@/widgets/goal-aware/home-goal-section";
import { WeeklyVolumeSection } from "./weekly-volume-section";
import { AsymptoteMonitorSection } from "./asymptote-monitor-section";

const Stats1RMDetailed = dynamic(
  () =>
    import("@/features/stats/ui/stats-1rm-detailed").then((mod) => ({
      default: mod.Stats1RMDetailed,
    })),
  { ssr: false },
);

type StatsScreenProps = StatsPageBootstrap;

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
      <h2 className="v2-h2" style={{ letterSpacing: 0 }}>
        {title}
      </h2>
      {description ? (
        <p className="v2-small" style={{ maxWidth: "62ch" }}>
          {description}
        </p>
      ) : null}
    </div>
  );
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
      radius="var(--v2-r-2)"
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
            <span className="v2-label" style={{ color: "var(--v2-ink-2)" }}>
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

function PrList({
  items,
  locale,
}: {
  items: StatsScreenProps["initialBundle"]["prs90d"];
  locale: "ko" | "en";
}) {
  if (items.length === 0) {
    return (
      <V2Card
        tone="inset"
        padding="var(--v2-s-5)"
        radius="var(--v2-r-2)"
      >
        <p className="v2-h3">
          {locale === "ko" ? "표시할 PR 데이터가 없습니다" : "No PR data yet"}
        </p>
        <p className="v2-small" style={{ marginTop: "var(--v2-s-1)" }}>
          {locale === "ko"
            ? "운동 기록이 쌓이면 최근 90일 기준 최고 기록 변화를 보여줍니다."
            : "Recent 90-day personal record changes appear here after more logs are added."}
        </p>
      </V2Card>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--v2-s-2)" }}>
      {items.slice(0, 8).map((row) => {
        const improvement = row.improvement;
        const tone = improvement > 0 ? "success" : "neutral";
        const card = (
            <V2Card
              tone="paper"
              padding="var(--v2-s-3) var(--v2-s-4)"
              radius="var(--v2-r-2)"
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto auto",
                alignItems: "center",
                gap: "var(--v2-s-3)",
              }}
            >
              <div className="v2-font-display" style={{ minWidth: 0 }}>
                <div
                  className="v2-body"
                  style={{
                    fontWeight: 700,
                    color: "var(--v2-ink)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.exerciseName}
                </div>
                <div
                  className="v2-small"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "var(--v2-s-1) var(--v2-s-3)",
                    marginTop: "var(--v2-s-1)",
                    color: "var(--v2-ink-2)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <span>
                    {locale === "ko" ? "최신" : "Latest"}{" "}
                    <strong style={{ color: "var(--v2-ink)" }}>
                      {row.latest?.e1rm ?? "-"}kg
                    </strong>
                  </span>
                  <span>
                    {locale === "ko" ? "최고" : "Best"}{" "}
                    <strong style={{ color: "var(--v2-ink)" }}>
                      {row.best?.e1rm ?? "-"}kg
                    </strong>
                  </span>
                </div>
              </div>
              <V2Chip tone={tone}>
                {improvement > 0
                  ? `+${improvement.toFixed(1)}`
                  : improvement.toFixed(1)}
              </V2Chip>
              <span
                className="material-symbols-outlined"
                style={{ color: "var(--v2-ink-3)", fontSize: "var(--v2-t-18)" }}
                aria-hidden="true"
              >
                chevron_right
              </span>
            </V2Card>
        );

        if (!row.exerciseId) {
          return (
            <div
              key={row.exerciseName}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              {card}
            </div>
          );
        }

        return (
          <Link
            key={row.exerciseId}
            href={APP_ROUTES.exerciseDetail(row.exerciseId)}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            {card}
          </Link>
        );
      })}
    </div>
  );
}

export function StatsScreen({
  initialBundle,
  initialExercises,
  initialPlans,
  initialE1rm,
  initialVolumeWeekly,
  initialSelectedExerciseId,
  initialSelectedPlanId,
  goal,
  goalMetrics,
  asymptoteMonitor,
}: StatsScreenProps) {
  const { locale } = useLocale();
  const skin = useThemeSkin();
  const searchParams = useSearchParams();
  const detailedRef = useRef<Stats1RMDetailedRef>(null);
  const detailedSectionRef = useRef<HTMLDivElement>(null);
  const handledScrollRef = useRef<string | null>(null);
  const latestPoint = initialE1rm?.series.at(-1) ?? null;
  const improvedPrCount = initialBundle.prs90d.filter((item) => item.improvement > 0).length;

  useEffect(() => {
    const exerciseId = searchParams.get("exerciseId");
    const exerciseName = searchParams.get("exercise");
    const target = exerciseId ?? exerciseName ?? "";
    if (!target || handledScrollRef.current === target) return;

    handledScrollRef.current = target;
    requestAnimationFrame(() => {
      if (detailedRef.current) {
        detailedRef.current.selectExercise(target);
        detailedSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  }, [searchParams]);

  // terminal(ironlog) 본문 — 1RM 추세(SVG)·기간탭·메트릭·PR. paper는 아래 트리 그대로.
  if (skin === "terminal") {
    return (
      <StatsTuiView
        initialBundle={initialBundle}
        initialExercises={initialExercises}
        initialPlans={initialPlans}
        initialE1rm={initialE1rm}
        initialVolumeWeekly={initialVolumeWeekly}
        initialSelectedExerciseId={initialSelectedExerciseId}
        initialSelectedPlanId={initialSelectedPlanId}
        goal={goal}
        goalMetrics={goalMetrics}
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
          <div style={{ display: "grid", gap: "var(--v2-s-1)" }}>
            <p className="v2-label">{locale === "ko" ? "퍼포먼스" : "Performance"}</p>
            <h1 className="v2-h1" style={{ letterSpacing: 0 }}>
              {locale === "ko" ? "통계" : "Stats"}
            </h1>
            <p className="v2-body" style={{ maxWidth: 640, color: "var(--v2-ink-2)" }}>
              {locale === "ko"
                ? "최근 훈련 빈도, 볼륨, e1RM, PR 변화를 한 화면에서 확인합니다."
                : "Review recent training frequency, volume, e1RM, and PR movement in one place."}
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(144px, 1fr))",
              gap: "var(--v2-s-3)",
            }}
          >
            <MetricCard
              label={locale === "ko" ? "30일 세션" : "30d sessions"}
              value={initialBundle.sessions30d.toLocaleString()}
              unit={locale === "ko" ? "회" : ""}
              caption={locale === "ko" ? "최근 훈련 빈도" : "Recent training frequency"}
              color="var(--v2-c-progress)"
              icon="calendar_month"
            />
            <MetricCard
              label={locale === "ko" ? "30일 볼륨" : "30d volume"}
              value={formatKg(initialBundle.tonnage30d)}
              caption={locale === "ko" ? "총 중량 합계" : "Total tonnage"}
              color="var(--v2-c-volume)"
              icon="fitness_center"
            />
            <MetricCard
              label={locale === "ko" ? "최고 e1RM" : "Best e1RM"}
              value={initialE1rm?.best ? initialE1rm.best.e1rm.toFixed(1) : "-"}
              unit="kg"
              caption={
                initialE1rm?.best
                  ? formatDate(initialE1rm.best.date, locale)
                  : locale === "ko"
                    ? "선택 운동 데이터 없음"
                    : "No selected exercise data"
              }
              color="var(--v2-c-onerm)"
              icon="show_chart"
            />
            <MetricCard
              label={locale === "ko" ? "90일 PR" : "90d PRs"}
              value={initialBundle.prs90d.length.toLocaleString()}
              unit={locale === "ko" ? "개" : ""}
              caption={
                locale === "ko"
                  ? `${improvedPrCount}개 종목 향상`
                  : `${improvedPrCount} improved lifts`
              }
              color="var(--v2-c-pr)"
              icon="workspace_premium"
            />
          </div>
        </header>

        <GoalSection goal={goal} metrics={goalMetrics} />

        {asymptoteMonitor ? (
          <AsymptoteMonitorSection data={asymptoteMonitor} locale={locale} />
        ) : null}

        <WeeklyVolumeSection data={initialVolumeWeekly} locale={locale} />

        <section
          style={{ display: "grid", gap: "var(--v2-s-3)" }}
          ref={detailedSectionRef}
        >
          <SectionTitle
            label={locale === "ko" ? "추이 분석" : "Trend Analysis"}
            title={locale === "ko" ? "상세 추이 분석" : "Detailed Trend Analysis"}
            description={
              locale === "ko"
                ? "운동별 e1RM 변화와 전체 기간 최고 기록을 필터별로 확인합니다."
                : "Track e1RM changes by exercise and best results across the selected range."
            }
          />
          <V2Card
            tone="inset"
            padding="var(--v2-s-3)"
            radius="var(--v2-r-2)"
          >
            <Stats1RMDetailed
              ref={detailedRef}
              refreshTick={0}
              initialExercises={initialExercises}
              initialPlans={initialPlans}
              initialStats={initialE1rm}
              initialSelectedExerciseId={initialSelectedExerciseId}
              initialSelectedPlanId={initialSelectedPlanId}
            />
          </V2Card>
        </section>

        <section style={{ display: "grid", gap: "var(--v2-s-3)" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: "var(--v2-s-3)",
              alignItems: "end",
            }}
          >
            <SectionTitle
              label={locale === "ko" ? "개인 최고 기록" : "Personal Records"}
              title={locale === "ko" ? "PR 기록 추적" : "PR Tracking"}
              description={
                locale === "ko"
                  ? "최근 90일 기준 종목별 최고 기록과 향상도를 정리합니다."
                  : "Review recent 90-day best lifts and improvement by exercise."
              }
            />
            <div style={{ display: "flex", gap: "var(--v2-s-2)", alignItems: "center" }}>
              {latestPoint ? (
                <V2Chip tone="accent" icon="bolt">
                  {locale === "ko" ? "최근 " : "Latest "}
                  {formatDate(latestPoint.date, locale)}
                </V2Chip>
              ) : null}
              <Link
                href={APP_ROUTES.prHistory}
                className="v2-mono-label v2-pressable"
                style={{
                  color: "var(--v2-accent-ink)",
                  textDecoration: "none",
                  padding: "var(--v2-s-1) var(--v2-s-3)",
                  borderRadius: "var(--v2-r-pill)",
                  background: "var(--v2-accent-weak)",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {locale === "ko" ? "전체 보기" : "View all"}
              </Link>
            </div>
          </div>
          <V2Hairline />
          <PrList items={initialBundle.prs90d} locale={locale} />
        </section>
      </div>
    </AppPage>
  );
}
