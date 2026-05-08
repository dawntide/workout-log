"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { APP_ROUTES } from "@/lib/app-routes";
import { resolveStartHref } from "@/lib/workout/start-href";
import { useLocale } from "@/components/locale-provider";
import type { AppCopy, AppLocale } from "@/lib/i18n/messages";
import type {
  HomeData,
  HomeRecentSession,
  HomeStrengthItem,
  HomeTodaySummary,
  HomeVolumeTrendPoint,
  HomeWeeklySummary,
} from "@/lib/home/home-data-source";
import {
  V2Card,
  V2Chip,
  V2PrimaryBtn,
} from "./primitives";

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

function formatVolumeShort(kg: number): string {
  if (kg >= 1000) {
    const t = kg / 1000;
    return t % 1 === 0 ? `${t.toFixed(0)}k` : `${t.toFixed(1)}k`;
  }
  return Math.round(kg).toLocaleString();
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

  return (
    <div style={{ paddingTop: 16, paddingBottom: 24 }}>
      {/* eyebrow */}
      <div style={{ padding: "0 24px 8px" }}>
        <p className="v2-eyebrow">{formatDateEyebrow(locale)}</p>
        <h1 className="v2-h1" style={{ marginTop: 6 }}>
          {today.headline || (locale === "ko" ? "오늘" : "Today")}
        </h1>
        {today.meta && (
          <p
            className="v2-small"
            style={{ marginTop: 4, color: "var(--v2-ink-2)" }}
          >
            {today.meta}
          </p>
        )}
      </div>

      {/* hero card — 오늘의 세션 */}
      <div style={{ padding: "14px 16px 0" }}>
        <V2Card padding={0} radius="var(--v2-r-4)">
          <div style={{ padding: "20px 22px 16px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
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
            <div
              className="v2-h1"
              style={{ letterSpacing: "-0.025em", fontSize: 26 }}
            >
              {hasPlan
                ? today.headline
                : copy.home.protocol.selectProgram}
            </div>
          </div>

          {/* 운동 목록 */}
          {hasPlan && today.plannedExercises.length > 0 && (
            <div
              style={{ background: "var(--v2-paper-2)", padding: "14px 22px" }}
            >
              {today.plannedExercises.slice(0, 4).map((ex, i, arr) => (
                <div
                  key={`${ex.name}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 0",
                    borderBottom:
                      i < arr.length - 1
                        ? "1px solid var(--v2-hairline)"
                        : "none",
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
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
                      fontFamily: "var(--v2-f-num)",
                      fontWeight: 700,
                      fontSize: 13,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="v2-h3"
                      style={{
                        fontSize: 15,
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
              ))}
            </div>
          )}

          {/* CTA — bottom-nav "시작" 버튼과 동일한 핸들러를 공유 */}
          <div style={{ padding: "14px 16px 16px" }}>
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
          padding: "14px 16px 0",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
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
              gap: 4,
              marginTop: 8,
            }}
          >
            <span className="v2-num-md" style={{ color: "var(--v2-c-pr)" }}>
              {weekly.activeDays}
            </span>
            <span className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
              {locale === "ko" ? "일" : "d"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 3, marginTop: 12 }}>
            {weekly.days.map((d) => (
              <div
                key={d.key}
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 9999,
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
            style={{ color: "var(--v2-ink-3)", marginTop: 8 }}
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
              gap: 4,
              marginTop: 8,
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
              gap: 4,
              marginTop: 12,
            }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 9999,
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
            style={{ color: "var(--v2-ink-3)", marginTop: 8 }}
          >
            {locale === "ko"
              ? `${weekly.completedSets} 세트 완료`
              : `${weekly.completedSets} sets done`}
          </div>
        </V2Card>
      </div>

      {/* 최근 PR */}
      {strength.length > 0 && (
        <>
          <div style={{ padding: "24px 24px 8px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
              }}
            >
              <div className="v2-label">
                {locale === "ko" ? "최근 PR" : "Recent PRs"}
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
          <div style={{ padding: "0 16px" }}>
            {strength.slice(0, 3).map((s) => {
              const isPr = s.trend === "up" && s.improvement > 0;
              return (
                <V2Card
                  key={s.exerciseName}
                  tone="inset"
                  style={{ marginBottom: 8 }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
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
                          fontSize: 22,
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
                        className="v2-h3"
                        style={{
                          fontSize: 15,
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

/* ───────────────────────── Progress Deck ───────────────────────── */

function ProgressDeck({
  trend,
  strength,
  copy,
  locale,
}: {
  trend: HomeVolumeTrendPoint[];
  strength: HomeStrengthItem[];
  copy: AppCopy;
  locale: AppLocale;
}) {
  void copy;
  const top = strength[0];
  return (
    <div style={{ paddingTop: 16, paddingBottom: 24 }}>
      <div style={{ padding: "0 24px 8px" }}>
        <p className="v2-eyebrow">{locale === "ko" ? "진행" : "PROGRESS"}</p>
        <h1 className="v2-h1" style={{ marginTop: 6 }}>
          {locale === "ko" ? "지난 12주." : "Last 12 weeks."}
        </h1>
      </div>

      {/* 큰 1RM 카드 */}
      {top && (
        <div style={{ padding: "14px 16px 0" }}>
          <V2Card padding="22px">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  className="v2-label"
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  EST. 1RM · {top.exerciseName.toUpperCase()}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    marginTop: 8,
                  }}
                >
                  <span
                    className="v2-num-lg"
                    style={{ color: "var(--v2-c-onerm)" }}
                  >
                    {top.bestE1rm.toFixed(1)}
                  </span>
                  <span className="v2-h3" style={{ color: "var(--v2-ink-3)" }}>
                    kg
                  </span>
                </div>
              </div>
              {top.improvement > 0 && (
                <V2Chip tone="success" icon="trending_up">
                  +{top.improvement.toFixed(1)}
                </V2Chip>
              )}
            </div>
            <BigChart points={trendToPoints(trend)} />
          </V2Card>
        </div>
      )}

      {/* 리프트별 진행 */}
      {strength.length > 0 && (
        <>
          <div style={{ padding: "24px 24px 8px" }}>
            <div className="v2-label">
              {locale === "ko" ? "리프트별 진행" : "Lifts"}
            </div>
          </div>
          <div style={{ padding: "0 16px" }}>
            {strength.slice(0, 6).map((s) => {
              const max = Math.max(
                ...strength.map((x) => x.bestE1rm),
                1,
              );
              const frac = s.bestE1rm / max;
              const color =
                s.trend === "up"
                  ? "var(--v2-c-progress)"
                  : s.trend === "down"
                    ? "var(--v2-c-danger)"
                    : "var(--v2-c-weight)";
              return (
                <V2Card
                  key={s.exerciseName}
                  tone="inset"
                  style={{ marginBottom: 8 }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        className="v2-h3"
                        style={{
                          fontSize: 15,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {s.exerciseName}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: 6,
                          marginTop: 4,
                        }}
                      >
                        <span
                          className="v2-num-md"
                          style={{ fontSize: 22, color }}
                        >
                          {s.bestE1rm.toFixed(1)}
                        </span>
                        <span
                          className="v2-small"
                          style={{ color: "var(--v2-ink-3)" }}
                        >
                          kg
                        </span>
                        {s.improvement > 0 && (
                          <span
                            className="v2-mono-label"
                            style={{
                              color: "var(--v2-c-success)",
                              marginLeft: 6,
                            }}
                          >
                            +{s.improvement.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      height: 4,
                      background: "var(--v2-paper-3)",
                      borderRadius: 9999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, frac * 100)}%`,
                        height: "100%",
                        background: color,
                        borderRadius: 9999,
                      }}
                    />
                  </div>
                </V2Card>
              );
            })}
          </div>
        </>
      )}

      {/* 주간 볼륨 */}
      {trend.length > 0 && (
        <>
          <div style={{ padding: "16px 24px 8px" }}>
            <div className="v2-label">
              {locale === "ko" ? "주간 볼륨" : "Weekly volume"}
            </div>
          </div>
          <div style={{ padding: "0 16px" }}>
            <V2Card>
              <VolumeBars trend={trend.slice(-7)} locale={locale} />
            </V2Card>
          </div>
        </>
      )}
    </div>
  );
}

function trendToPoints(trend: HomeVolumeTrendPoint[]): number[] {
  const last = trend.slice(-12);
  if (last.length === 0) return [0, 0];
  return last.map((p) => p.tonnage);
}

function BigChart({ points }: { points: number[] }) {
  if (points.length < 2) {
    return (
      <div
        style={{
          height: 120,
          marginTop: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="v2-mono-label" style={{ color: "var(--v2-ink-3)" }}>
          —
        </span>
      </div>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  const w = 320;
  const h = 120;
  const pad = 6;
  const xs = points.map(
    (_, i) => pad + (i * (w - pad * 2)) / (points.length - 1),
  );
  const ys = points.map(
    (v) => h - pad - ((v - min) / span) * (h - pad * 2),
  );
  const d = xs
    .map((x, i) => `${i === 0 ? "M" : "L"} ${x} ${ys[i]}`)
    .join(" ");
  const area = `${d} L ${xs[xs.length - 1]} ${h - pad} L ${xs[0]} ${h - pad} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{
        width: "100%",
        height: 120,
        display: "block",
        marginTop: 14,
      }}
    >
      <defs>
        <linearGradient id="v2-bigfill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--v2-accent)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--v2-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#v2-bigfill)" />
      <path
        d={d}
        stroke="var(--v2-accent)"
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {xs.map((x, i) => (
        <circle
          key={i}
          cx={x}
          cy={ys[i]}
          r={i === xs.length - 1 ? 4 : 1.6}
          fill="var(--v2-accent)"
        />
      ))}
    </svg>
  );
}

function VolumeBars({
  trend,
  locale,
}: {
  trend: HomeVolumeTrendPoint[];
  locale: AppLocale;
}) {
  const max = Math.max(...trend.map((p) => p.tonnage), 1);
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div>
          <div className="v2-label">
            {locale === "ko" ? "이번 주" : "This week"}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 4,
              marginTop: 4,
            }}
          >
            <span className="v2-num-md" style={{ color: "var(--v2-c-volume)" }}>
              {formatVolumeShort(trend[trend.length - 1]?.tonnage ?? 0)}
            </span>
            <span className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
              kg
            </span>
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 6,
          height: 80,
          marginTop: 16,
        }}
      >
        {trend.map((p, i) => (
          <div
            key={`${p.period}-${i}`}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}
          >
            <div
              style={{
                width: "100%",
                height: `${(p.tonnage / max) * 100}%`,
                background:
                  i === trend.length - 1
                    ? "var(--v2-c-volume)"
                    : "color-mix(in srgb, var(--v2-c-volume) 30%, var(--v2-paper-3))",
                borderRadius: "6px 6px 0 0",
                minHeight: 4,
              }}
            />
            <span
              className="v2-mono-label"
              style={{ fontSize: 9, color: "var(--v2-ink-3)" }}
            >
              {p.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── History Deck ───────────────────────── */

function HistoryDeck({
  recent,
  copy,
  locale,
  totalSessions,
  totalVolume,
  thisMonthSessions,
}: {
  recent: HomeRecentSession[];
  copy: AppCopy;
  locale: AppLocale;
  totalSessions: number;
  totalVolume: number;
  thisMonthSessions: number;
}) {
  void copy;
  return (
    <div style={{ paddingTop: 16, paddingBottom: 24 }}>
      <div style={{ padding: "0 24px 8px" }}>
        <p className="v2-eyebrow">{locale === "ko" ? "히스토리" : "HISTORY"}</p>
        <h1 className="v2-h1" style={{ marginTop: 6 }}>
          {locale === "ko" ? "지난 세션." : "Past sessions."}
        </h1>
      </div>

      {/* 요약 행 */}
      <div style={{ padding: "14px 16px 0", display: "flex", gap: 10 }}>
        {(
          [
            {
              l: locale === "ko" ? "이번 달" : "Month",
              v: thisMonthSessions.toString(),
              sub: locale === "ko" ? "세션" : "sessions",
            },
            {
              l: locale === "ko" ? "총 볼륨" : "Volume",
              v: formatVolumeShort(totalVolume),
              sub: "kg",
            },
            {
              l: locale === "ko" ? "전체" : "All",
              v: totalSessions.toString(),
              sub: locale === "ko" ? "세션" : "sessions",
            },
          ]
        ).map((m) => (
          <V2Card
            key={m.l}
            tone="inset"
            style={{ flex: 1, padding: "12px 14px" }}
          >
            <div className="v2-label" style={{ fontSize: 9 }}>
              {m.l}
            </div>
            <div
              className="v2-num-md"
              style={{ fontSize: 22, marginTop: 6 }}
            >
              {m.v}
            </div>
            <div
              className="v2-mono-label"
              style={{ color: "var(--v2-ink-3)", marginTop: 4 }}
            >
              {m.sub}
            </div>
          </V2Card>
        ))}
      </div>

      {/* 세션 리스트 */}
      <div style={{ padding: "24px 24px 8px" }}>
        <div className="v2-label">{locale === "ko" ? "최근" : "Recent"}</div>
      </div>
      <div style={{ padding: "0 16px" }}>
        {recent.length === 0 ? (
          <V2Card tone="inset">
            <p
              className="v2-small"
              style={{ color: "var(--v2-ink-3)", margin: 0 }}
            >
              {locale === "ko"
                ? "아직 기록된 세션이 없어요."
                : "No sessions yet."}
            </p>
          </V2Card>
        ) : (
          recent.map((s) => (
            <Link
              key={s.id}
              href={s.href}
              style={{ textDecoration: "none", display: "block" }}
            >
              <V2Card style={{ marginBottom: 8 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: "var(--v2-paper-2)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="v2-mono-label"
                      style={{
                        fontSize: 9,
                        color: "var(--v2-ink-3)",
                      }}
                    >
                      {s.subtitle}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="v2-h3"
                      style={{
                        fontSize: 15,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {s.title}
                    </div>
                    <div
                      className="v2-mono-label"
                      style={{
                        color: "var(--v2-ink-3)",
                        marginTop: 4,
                      }}
                    >
                      {s.description}
                    </div>
                  </div>
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: 20,
                      color: "var(--v2-ink-3)",
                    }}
                    aria-hidden
                  >
                    chevron_right
                  </span>
                </div>
              </V2Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Deck container ─────────────────────── */

const DECKS: { key: string; label: string; labelEn: string }[] = [
  { key: "today", label: "오늘", labelEn: "Today" },
  { key: "progress", label: "진행", labelEn: "Progress" },
  { key: "history", label: "히스토리", labelEn: "History" },
];

function DeckSwitcher({
  index,
  setIndex,
  locale,
}: {
  index: number;
  setIndex: (i: number) => void;
  locale: AppLocale;
}) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
        paddingBottom: 6,
        background:
          "color-mix(in srgb, var(--v2-bg) 92%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div
        role="tablist"
        aria-label="Home decks"
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 6,
          margin: "0 auto",
          padding: "6px 10px",
          borderRadius: 9999,
          background:
            "color-mix(in srgb, var(--v2-paper) 70%, transparent)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          width: "fit-content",
        }}
      >
        {DECKS.map((d, i) => (
          <button
            key={d.key}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => setIndex(i)}
            style={{
              minHeight: 32,
              padding: "6px 14px",
              borderRadius: 9999,
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--v2-f-display)",
              fontWeight: 700,
              fontSize: 12,
              background: i === index ? "var(--v2-ink)" : "transparent",
              color:
                i === index
                  ? "var(--v2-ink-on-accent)"
                  : "var(--v2-ink-2)",
              transition: "background var(--v2-d-1) var(--v2-e-out)",
            }}
          >
            {locale === "ko" ? d.label : d.labelEn}
          </button>
        ))}
      </div>
      {/* dots */}
      <div
        aria-hidden
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 6,
          marginTop: 8,
        }}
      >
        {DECKS.map((d, i) => (
          <span
            key={d.key}
            style={{
              width: i === index ? 18 : 6,
              height: 6,
              borderRadius: 9999,
              background:
                i === index ? "var(--v2-accent)" : "var(--v2-paper-4)",
              transition: "all var(--v2-d-2) var(--v2-e-out)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── Public API ─────────────────────────── */

export function V2HomeDashboard({ data }: { data: HomeData }) {
  const { copy, locale } = useLocale();
  const [deck, setDeck] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== deck) setDeck(i);
  }, [deck]);

  const handleSetDeck = useCallback(
    (i: number) => {
      const el = trackRef.current;
      if (!el) {
        setDeck(i);
        return;
      }
      el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
      setDeck(i);
    },
    [],
  );

  // resize 시 현재 deck 위치 유지
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onResize = () => {
      el.scrollTo({ left: deck * el.clientWidth, behavior: "auto" });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [deck]);

  const hasPlan = data.planOverview.totalPlans > 0;
  const isComplete =
    data.today.totalPlannedSets > 0 &&
    data.today.completedSets >= data.today.totalPlannedSets;

  const slideStyle: CSSProperties = {
    flex: "0 0 100%",
    scrollSnapAlign: "start",
    overflowY: "auto",
    overflowX: "hidden",
    overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
  };

  return (
    <div style={{ width: "100%" }}>
      <DeckSwitcher index={deck} setIndex={handleSetDeck} locale={locale} />

      <div
        ref={trackRef}
        onScroll={handleScroll}
        style={{
          display: "flex",
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          // height for swipe area; outer .app-shell__page handles bottom space.
          // each child fills the viewport-equivalent height of the page area.
        }}
      >
        <div style={slideStyle}>
          <TodayDeck
            today={data.today}
            weekly={data.weeklySummary}
            strength={data.strengthProgress}
            copy={copy}
            locale={locale}
            isComplete={isComplete}
            hasPlan={hasPlan}
          />
        </div>
        <div style={slideStyle}>
          <ProgressDeck
            trend={data.volumeTrend}
            strength={data.strengthProgress}
            copy={copy}
            locale={locale}
          />
        </div>
        <div style={slideStyle}>
          <HistoryDeck
            recent={data.recentSessions}
            copy={copy}
            locale={locale}
            totalSessions={data.quickStats.totalSessions}
            totalVolume={data.quickStats.totalVolume}
            thisMonthSessions={data.quickStats.thisMonthSessions}
          />
        </div>
      </div>
    </div>
  );
}

