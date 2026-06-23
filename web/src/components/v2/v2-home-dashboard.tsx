"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { APP_ROUTES } from "@/lib/app-routes";
import { V2Hairline } from "@/components/v2/primitives";
import { resolveStartHref } from "@/lib/workout/start-href";
import { useLocale } from "@/components/locale-provider";
import { useThemeSkin } from "@/components/use-theme-skin";
import { HomeTuiView } from "@/components/v2/home-tui-view";
import type { AppCopy, AppLocale } from "@/lib/i18n/messages";
import type {
  HomeData,
  HomeStrengthItem,
  HomeTodaySummary,
  HomeWeeklySummary,
} from "@/lib/home/home-data-source";
import {
  V2Card,
  V2Chip,
  V2PrimaryBtn,
} from "./primitives";
import { useV2BottomDockTabs } from "./v2-bottom-dock-context";
import { StatsContainer } from "@/widgets/stats-screen";
import { HomeGoalSection } from "@/widgets/goal-aware/home-goal-section";

/* ─────────────────────────── helpers ────────────────────────────── */

function formatDateEyebrow(locale: AppLocale): string {
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions =
    locale === "ko"
      ? { weekday: "long", month: "long", day: "numeric" }
      : { weekday: "long", month: "short", day: "numeric" };
  return now
    .toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", opts)
    .toUpperCase();
}

/* ─────────────────────────── Today Deck ─────────────────────────── */

function TodayDeck({
  today,
  weekly,
  strength,
  copy,
  locale,
  isComplete,
  hasPlan,
}: {
  today: HomeTodaySummary;
  weekly: HomeWeeklySummary;
  strength: HomeStrengthItem[];
  copy: AppCopy;
  locale: AppLocale;
  isComplete: boolean;
  hasPlan: boolean;
}) {
  const greetingName = copy.home.welcome?.active ?? "";
  void greetingName;

  const ctaLabel = isComplete
    ? copy.home.protocol.logMore
    : today.completedSets > 0
      ? copy.home.protocol.continue
      : hasPlan
        ? copy.home.protocol.start
        : copy.home.protocol.chooseProgram;

  const completedDays = weekly.days.filter((d) => d.hasWorkout).length;

  // 헤더: 카드/하단 스트릭과 겹치지 않도록 시간대 인사말 + 오늘 상태 한 줄로 구성한다.
  const hour = new Date().getHours();
  const greeting =
    locale === "ko"
      ? hour < 5
        ? "늦은 밤이에요"
        : hour < 12
          ? "좋은 아침이에요"
          : hour < 18
            ? "좋은 오후예요"
            : "좋은 저녁이에요"
      : hour < 5
        ? "Still up"
        : hour < 12
          ? "Good morning"
          : hour < 18
            ? "Good afternoon"
            : "Good evening";

  const weekText =
    locale === "ko"
      ? `이번 주 ${weekly.activeDays}일째`
      : `${weekly.activeDays} day${weekly.activeDays === 1 ? "" : "s"} this week`;

  const statusLine = !hasPlan
    ? locale === "ko"
      ? "프로그램을 선택하고 오늘 운동을 시작하세요"
      : "Pick a program to start today's workout"
    : isComplete
      ? locale === "ko"
        ? `오늘 운동 완료 · ${weekText}`
        : `Workout done · ${weekText}`
      : today.completedSets > 0
        ? locale === "ko"
          ? `운동 진행 중 · ${weekText}`
          : `Workout in progress · ${weekText}`
        : weekly.activeDays > 0
          ? locale === "ko"
            ? `오늘도 가볼까요 · ${weekText}`
            : `Let's keep it going · ${weekText}`
          : locale === "ko"
            ? "오늘 첫 세트를 시작해보세요"
            : "Start your first set today";

  return (
    <div style={{ paddingTop: "var(--v2-s-4)", paddingBottom: "var(--v2-s-6)" }}>
      {/* eyebrow */}
      <div style={{ padding: "0px 0px var(--v2-s-2)" }}>
        <p className="v2-eyebrow">{formatDateEyebrow(locale)}</p>
        <h1 className="v2-h1" style={{ marginTop: "var(--v2-s-1)" }}>
          {greeting}
        </h1>
        <p
          className="v2-small"
          style={{ marginTop: "var(--v2-s-1)", color: "var(--v2-ink-2)" }}
        >
          {statusLine}
        </p>
      </div>

      {/* hero card — 오늘의 세션 */}
      <div style={{ padding: "var(--v2-s-4) 0px 0px" }}>
        <V2Card padding={0} radius="var(--v2-r-4)">
          <div style={{ padding: "var(--v2-s-5) var(--v2-s-5) var(--v2-s-4)" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--v2-s-2)",
                marginBottom: "var(--v2-s-3)",
              }}
            >
              {today.programName ? (
                <V2Chip tone="accent" icon="bolt">
                  {today.programName}
                </V2Chip>
              ) : (
                <V2Chip tone="neutral">
                  {copy.home.protocol.noProgram}
                </V2Chip>
              )}
              {hasPlan && today.totalPlannedSets > 0 && (
                <span
                  className="v2-mono-label"
                  style={{ color: "var(--v2-ink-3)" }}
                >
                  {today.completedSets}/{today.totalPlannedSets}{" "}
                  {locale === "ko" ? "세트" : "sets"}
                </span>
              )}
            </div>
            <h2 className="v2-h2" style={{ margin: 0, letterSpacing: "-0.025em" }}>
              {hasPlan
                ? today.headline
                : copy.home.protocol.selectProgram}
            </h2>
          </div>

          {/* 운동 목록 */}
          {hasPlan && today.plannedExercises.length > 0 && (
            <div
              style={{ background: "var(--v2-paper-2)", padding: "var(--v2-s-4) var(--v2-s-5)" }}
            >
              {today.plannedExercises.map((ex, i, arr) => (
                <Fragment key={`${ex.name}-${i}`}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--v2-s-3)",
                      padding: "var(--v2-s-3) 0px",
                    }}
                  >
                    <div
                      className="v2-mono-label"
                      style={{
                        width: "var(--v2-s-7)",
                        height: "var(--v2-s-7)",
                        borderRadius: "var(--v2-r-1)",
                        background:
                          ex.role === "MAIN"
                            ? "var(--v2-accent)"
                            : "var(--v2-paper-3)",
                        color:
                          ex.role === "MAIN"
                            ? "var(--v2-ink-on-accent)"
                            : "var(--v2-ink-3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        className="v2-body"
                        style={{
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {ex.name}
                      </div>
                      <div
                        className="v2-mono-label"
                        style={{ color: "var(--v2-ink-3)", marginTop: 2 }}
                      >
                        {ex.summary || `${ex.totalSets} ${locale === "ko" ? "세트" : "sets"}`}
                      </div>
                    </div>
                    {ex.role === "MAIN" && (
                      <span
                        className="v2-mono-label"
                        style={{ color: "var(--v2-accent)" }}
                      >
                        {locale === "ko" ? "메인" : "MAIN"}
                      </span>
                    )}
                  </div>
                  {i < arr.length - 1 ? <V2Hairline /> : null}
                </Fragment>
              ))}
            </div>
          )}

          {/* CTA — bottom-nav "시작" 버튼과 동일한 핸들러를 공유 */}
          <div style={{ padding: "var(--v2-s-4) var(--v2-s-4) var(--v2-s-4)" }}>
            <Link
              href={resolveStartHref({ hasPlan, todayHref: today.href })}
              style={{ textDecoration: "none", display: "block" }}
            >
              <V2PrimaryBtn full icon={isComplete ? "add" : "play_arrow"}>
                {ctaLabel}
              </V2PrimaryBtn>
            </Link>
          </div>
        </V2Card>
      </div>

      {/* 보조 카드: 스트릭 + 이번 주 */}
      <div
        style={{
          padding: "var(--v2-s-4) 0px 0px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--v2-s-3)",
        }}
      >
        <V2Card>
          <div className="v2-label">
            {locale === "ko" ? "스트릭" : "Streak"}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "var(--v2-s-1)",
              marginTop: "var(--v2-s-2)",
            }}
          >
            <span className="v2-num-md" style={{ color: "var(--v2-c-pr)" }}>
              {weekly.activeDays}
            </span>
            <span className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
              {locale === "ko" ? "일" : "d"}
            </span>
          </div>
          <div style={{ display: "flex", gap: "var(--v2-s-1)", marginTop: "var(--v2-s-3)" }}>
            {weekly.days.map((d) => (
              <div
                key={d.key}
                style={{
                  flex: 1,
                  height: "var(--v2-s-2)",
                  borderRadius: "var(--v2-r-pill)",
                  background: d.hasWorkout
                    ? "var(--v2-c-pr)"
                    : "var(--v2-paper-3)",
                  outline: d.isToday
                    ? "2px solid var(--v2-accent)"
                    : undefined,
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>
          <div
            className="v2-mono-label"
            style={{ color: "var(--v2-ink-3)", marginTop: "var(--v2-s-2)" }}
          >
            {locale === "ko"
              ? `이번 주 ${completedDays}/${weekly.days.length}`
              : `This week ${completedDays}/${weekly.days.length}`}
          </div>
        </V2Card>

        <V2Card>
          <div className="v2-label">
            {locale === "ko" ? "주간 세션" : "Sessions"}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "var(--v2-s-1)",
              marginTop: "var(--v2-s-2)",
            }}
          >
            <span
              className="v2-num-md"
              style={{ color: "var(--v2-c-progress)" }}
            >
              {weekly.sessionCount}
            </span>
            <span className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
              {locale === "ko" ? "회" : ""}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              gap: "var(--v2-s-1)",
              marginTop: "var(--v2-s-3)",
            }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: "var(--v2-s-2)",
                  borderRadius: "var(--v2-r-pill)",
                  background:
                    i < Math.min(5, weekly.sessionCount)
                      ? "var(--v2-c-progress)"
                      : "var(--v2-paper-3)",
                }}
              />
            ))}
          </div>
          <div
            className="v2-mono-label"
            style={{ color: "var(--v2-ink-3)", marginTop: "var(--v2-s-2)" }}
          >
            {locale === "ko"
              ? `${weekly.completedSets} 세트 완료`
              : `${weekly.completedSets} sets done`}
          </div>
        </V2Card>
      </div>

      {/* 메인 리프트 — 현재 플랜 메인 운동의 1RM */}
      {strength.length > 0 && (
        <>
          <div style={{ padding: "var(--v2-s-6) 0px var(--v2-s-2)" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <div className="v2-label">
                {locale === "ko" ? "메인 리프트" : "Main Lifts"}
              </div>
              <Link
                href={APP_ROUTES.statsHome}
                style={{ textDecoration: "none" }}
              >
                <span
                  className="v2-mono-label"
                  style={{ color: "var(--v2-accent)" }}
                >
                  {locale === "ko" ? "모두 보기 →" : "View all →"}
                </span>
              </Link>
            </div>
          </div>
          <div style={{ padding: 0 }}>
            {strength.map((s) => {
              const isPr = s.trend === "up" && s.improvement > 0;
              return (
                <V2Card
                  key={s.exerciseName}
                  tone="inset"
                  style={{ marginBottom: "var(--v2-s-2)" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--v2-s-4)",
                    }}
                  >
                    <div
                      style={{
                        width: "var(--v2-s-8)",
                        height: "var(--v2-s-8)",
                        borderRadius: "var(--v2-r-2)",
                        background: isPr
                          ? "color-mix(in srgb, var(--v2-c-pr) 16%, var(--v2-paper))"
                          : "color-mix(in srgb, var(--v2-c-weight) 16%, var(--v2-paper))",
                        color: isPr
                          ? "var(--v2-c-pr)"
                          : "var(--v2-c-weight)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: "var(--v2-t-h2)",
                          fontVariationSettings:
                            "'FILL' 1, 'wght' 500",
                        }}
                        aria-hidden
                      >
                        {isPr ? "workspace_premium" : "fitness_center"}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        className="v2-body"
                        style={{
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {s.exerciseName}
                      </div>
                      <div
                        className="v2-mono-label"
                        style={{
                          color: "var(--v2-ink-3)",
                          marginTop: 2,
                        }}
                      >
                        1RM {s.bestE1rm.toFixed(1)} kg
                        {s.improvement > 0
                          ? ` · +${s.improvement.toFixed(1)}`
                          : ""}
                      </div>
                    </div>
                  </div>
                </V2Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── Deck container ─────────────────────── */

const DECKS: { key: string; icon: string; label: string; labelEn: string }[] = [
  { key: "today", icon: "today", label: "오늘", labelEn: "Today" },
  { key: "stats", icon: "monitoring", label: "통계", labelEn: "Stats" },
];

/* ─────────────────────────── Public API ─────────────────────────── */

// skin 분기 래퍼 — terminal이면 HomeTuiView(또는 deck=stats 시 StatsContainer),
// paper는 기존 대시보드(무수정). paper는 내부에서 deck를 bottom-dock 탭으로 토글하지만,
// terminal은 셸 탭(stats href=/?deck=stats)으로 진입하므로 여기서 deck를 라우팅한다.
export function V2HomeDashboard({ data }: { data: HomeData }) {
  const skin = useThemeSkin();
  const requestedDeck = useSearchParams().get("deck");
  if (skin === "terminal") {
    return requestedDeck === "stats" || requestedDeck === "progress" ? (
      <StatsContainer />
    ) : (
      <HomeTuiView data={data} />
    );
  }
  return <V2HomeDashboardPaper data={data} />;
}

function V2HomeDashboardPaper({ data }: { data: HomeData }) {
  const { copy, locale } = useLocale();
  const searchParams = useSearchParams();
  const requestedDeck = searchParams.get("deck");
  const [deck, setDeck] = useState(0);

  const handleSetDeck = useCallback(
    (i: number) => {
      setDeck(i);
    },
    [],
  );

  useEffect(() => {
    if (!requestedDeck) return;
    const normalized = requestedDeck === "progress" ? "stats" : requestedDeck;
    const nextDeck = DECKS.findIndex((d) => d.key === normalized);
    if (nextDeck >= 0) setDeck(nextDeck);
  }, [requestedDeck]);

  const hasPlan = data.planOverview.totalPlans > 0;
  const isComplete =
    data.today.totalPlannedSets > 0 &&
    data.today.completedSets >= data.today.totalPlannedSets;

  const bottomDockTabs = useMemo(
    () => ({
      id: "home-decks",
      items: DECKS.map((d, i) => ({
        key: `home-${d.key}`,
        icon: d.icon,
        label: locale === "ko" ? d.label : d.labelEn,
        onClick: () => handleSetDeck(i),
        active: i === deck,
      })),
    }),
    [deck, handleSetDeck, locale],
  );

  useV2BottomDockTabs(bottomDockTabs);

  return (
    <div style={{ width: "100%" }}>
      {deck === 0 && (
        <>
          <TodayDeck
            today={data.today}
            weekly={data.weeklySummary}
            strength={data.strengthProgress}
            copy={copy}
            locale={locale}
            isComplete={isComplete}
            hasPlan={hasPlan}
          />
          <HomeGoalSection data={data} />
        </>
      )}
      {deck === 1 && <StatsContainer />}
    </div>
  );
}
