"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { apiGet } from "@/lib/api";
import { APP_ROUTES } from "@/lib/app-routes";
import { V2Card, V2Sheet } from "./primitives";

type PlanItem = {
  id: string;
  name: string;
  type: "SINGLE" | "COMPOSITE" | "MANUAL";
  baseProgramName?: string | null;
  lastPerformedAt?: string | null;
  createdAt?: string;
};

type PlansResponse = { items: PlanItem[] };

type CalendarSession = {
  day: number;
  logId: string;
  performedAt: string;
};

type CalendarResponse = {
  year: number;
  month: number;
  days: number[];
  sessions?: CalendarSession[];
};

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function relativeLabel(iso: string | null | undefined, locale: "ko" | "en"): string {
  const days = daysSince(iso);
  if (days === null) return locale === "ko" ? "기록 없음" : "No record";
  if (days <= 0) return locale === "ko" ? "오늘" : "Today";
  if (days === 1) return locale === "ko" ? "어제" : "Yesterday";
  if (days < 7) return locale === "ko" ? `${days}일 전` : `${days}d ago`;
  if (days < 30)
    return locale === "ko"
      ? `${Math.floor(days / 7)}주 전`
      : `${Math.floor(days / 7)}w ago`;
  return locale === "ko"
    ? `${Math.floor(days / 30)}개월 전`
    : `${Math.floor(days / 30)}mo ago`;
}

/** 작은 캘린더 — 임의 (year, month) 표시. month는 0-indexed. */
function MiniCalendar({
  year,
  month,
  loggedDays,
  isCurrentMonth,
  todayDate,
  onDayClick,
  isFutureMonth,
}: {
  year: number;
  month: number;
  loggedDays: Set<number>;
  isCurrentMonth: boolean;
  todayDate: number;
  onDayClick?: (day: number) => void;
  /** 보고 있는 달이 미래 달이면 모든 날짜 클릭 비활성화 */
  isFutureMonth: boolean;
}) {
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= lastDate; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <V2Card>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          paddingBottom: 8,
          textAlign: "center",
        }}
      >
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <span
            key={d}
            className="v2-mono-label"
            style={{ fontSize: 9, color: "var(--v2-ink-3)" }}
          >
            {d}
          </span>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
        }}
      >
        {cells.map((d, i) => {
          const valid = d !== null;
          const isT = isCurrentMonth && d === todayDate;
          const isL = d !== null && loggedDays.has(d);
          // 미래 달의 모든 날짜, 또는 현재 달의 미래 날짜는 비활성화
          const isFutureCell =
            valid &&
            (isFutureMonth || (isCurrentMonth && d! > todayDate));
          const clickable =
            valid && !isFutureCell && Boolean(onDayClick);
          const commonStyle = {
            aspectRatio: "1" as const,
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            borderRadius: 10,
            background: isT
              ? "var(--v2-accent)"
              : isL
                ? "color-mix(in srgb, var(--v2-c-success) 14%, var(--v2-paper))"
                : "transparent",
            color: isT
              ? "var(--v2-ink-on-accent)"
              : valid
                ? "var(--v2-ink)"
                : "var(--v2-ink-4)",
            opacity: valid ? 1 : 0.3,
            fontFamily: "var(--v2-f-num)",
            fontWeight: 700 as const,
            fontSize: 13,
            border: "none",
            padding: 0,
            cursor: clickable ? "pointer" : "default",
          };
          const inner = (
            <>
              <span>{valid ? d : ""}</span>
              {isL && !isT && (
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 9999,
                    background: "var(--v2-c-success)",
                  }}
                />
              )}
            </>
          );
          if (clickable && d != null) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onDayClick!(d)}
                style={commonStyle}
              >
                {inner}
              </button>
            );
          }
          return (
            <div key={i} style={commonStyle}>
              {inner}
            </div>
          );
        })}
      </div>
    </V2Card>
  );
}

export function V2PlanSheet({
  open,
  onClose,
  controlsId,
}: {
  open: boolean;
  onClose: () => void;
  controlsId?: string;
}) {
  const router = useRouter();
  const { locale } = useLocale();
  const headingId = useId();
  const now = useMemo(() => new Date(), []);
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth(); // 0-indexed
  const todayDate = now.getDate();

  const [viewYear, setViewYear] = useState(todayYear);
  const [viewMonth, setViewMonth] = useState(todayMonth); // 0-indexed
  const [plans, setPlans] = useState<PlanItem[] | null>(null);
  const [calendarDays, setCalendarDays] = useState<Set<number>>(new Set());
  const [dayToLogId, setDayToLogId] = useState<Map<number, string>>(
    new Map(),
  );
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 플랜은 시트 처음 열릴 때만 fetch
  useEffect(() => {
    if (!open || plans !== null) return;
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const res = await apiGet<PlansResponse>("/api/plans", {
          maxAgeMs: 60_000,
          staleWhileRevalidateMs: 300_000,
        });
        if (!cancelled) setPlans(res.items ?? []);
      } catch (e: any) {
        if (!cancelled) {
          setError(
            e?.message ??
              (locale === "ko" ? "플랜을 불러오지 못했습니다." : "Failed to load."),
          );
          setPlans([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, plans, locale]);

  // 캘린더는 view month가 바뀔 때마다 fetch
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        setCalendarLoading(true);
        const tz =
          Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const res = await apiGet<CalendarResponse>(
          `/api/logs/calendar?year=${viewYear}&month=${viewMonth + 1}&timezone=${encodeURIComponent(tz)}`,
          {
            maxAgeMs: 60_000,
            staleWhileRevalidateMs: 300_000,
          },
        ).catch(
          () =>
            ({
              year: viewYear,
              month: viewMonth + 1,
              days: [],
              sessions: [],
            }) as CalendarResponse,
        );
        if (!cancelled) {
          setCalendarDays(new Set(res.days ?? []));
          const map = new Map<number, string>();
          for (const s of res.sessions ?? []) {
            map.set(s.day, s.logId);
          }
          setDayToLogId(map);
        }
      } finally {
        if (!cancelled) setCalendarLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, viewYear, viewMonth]);

  // 캘린더 fallback: 데이터가 비었는데 보고 있는 달이 현재 달이면 plan.lastPerformedAt에서 추출
  const effectiveLoggedDays = useMemo(() => {
    if (calendarDays.size > 0) return calendarDays;
    const isCurrentMonth =
      viewYear === todayYear && viewMonth === todayMonth;
    if (!isCurrentMonth || !plans) return calendarDays;
    const set = new Set<number>();
    for (const p of plans) {
      if (!p.lastPerformedAt) continue;
      const d = new Date(p.lastPerformedAt);
      if (
        d.getFullYear() === todayYear &&
        d.getMonth() === todayMonth
      ) {
        set.add(d.getDate());
      }
    }
    return set;
  }, [calendarDays, plans, viewYear, viewMonth, todayYear, todayMonth]);

  const isCurrentMonth =
    viewYear === todayYear && viewMonth === todayMonth;
  const isFutureMonth =
    viewYear > todayYear ||
    (viewYear === todayYear && viewMonth > todayMonth);

  const goToDay = (day: number) => {
    const logId = dayToLogId.get(day);
    if (logId) {
      onClose();
      router.push(`/workout/session/${encodeURIComponent(logId)}`);
      return;
    }
    // 빈 날짜 → 그 날짜로 빠른 기록 시작
    const dateKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    onClose();
    router.push(`/workout/log?date=${encodeURIComponent(dateKey)}`);
  };
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(
    locale === "ko" ? "ko-KR" : "en-US",
    { year: "numeric", month: "long" },
  );

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };
  const goNext = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };
  const goToday = () => {
    setViewYear(todayYear);
    setViewMonth(todayMonth);
  };

  const sortedPlans = useMemo(() => {
    if (!plans) return [];
    return [...plans].sort((a, b) => {
      const at = a.lastPerformedAt
        ? new Date(a.lastPerformedAt).getTime()
        : 0;
      const bt = b.lastPerformedAt
        ? new Date(b.lastPerformedAt).getTime()
        : 0;
      return bt - at;
    });
  }, [plans]);

  const plansLoading = plans === null;

  return (
    <V2Sheet
      open={open}
      onClose={onClose}
      ariaLabelledBy={headingId}
      ariaLabel={locale === "ko" ? "계획" : "Plan"}
      id={controlsId}
    >
      <div style={{ padding: "8px 24px 16px" }}>
        <p className="v2-eyebrow">
          {locale === "ko" ? "계획" : "PLAN"}
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 6,
          }}
        >
          <button
            type="button"
            onClick={goPrev}
            aria-label={locale === "ko" ? "이전 달" : "Previous month"}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              border: "none",
              background: "transparent",
              color: "var(--v2-ink-2)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginLeft: -8,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 20 }}
              aria-hidden
            >
              chevron_left
            </span>
          </button>
          <h1 id={headingId} className="v2-h1" style={{ flex: 1 }}>
            {monthLabel}
          </h1>
          <button
            type="button"
            onClick={goNext}
            aria-label={locale === "ko" ? "다음 달" : "Next month"}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              border: "none",
              background: "transparent",
              color: "var(--v2-ink-2)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 20 }}
              aria-hidden
            >
              chevron_right
            </span>
          </button>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={goToday}
              style={{
                minHeight: 36,
                padding: "6px 12px",
                borderRadius: 9999,
                border: "none",
                background: "var(--v2-paper-2)",
                color: "var(--v2-ink-2)",
                fontFamily: "var(--v2-f-display)",
                fontWeight: 700,
                fontSize: 11,
                cursor: "pointer",
                marginRight: -4,
              }}
            >
              {locale === "ko" ? "오늘" : "Today"}
            </button>
          )}
        </div>
        <p
          className="v2-small"
          style={{
            marginTop: 4,
            color: "var(--v2-ink-2)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>
            {locale === "ko"
              ? `이번 달 ${effectiveLoggedDays.size}일 운동`
              : `${effectiveLoggedDays.size} workout days`}
          </span>
          {calendarLoading && (
            <span
              className="v2-mono-label"
              style={{ color: "var(--v2-ink-3)" }}
            >
              · {locale === "ko" ? "불러오는 중" : "loading"}
            </span>
          )}
        </p>
      </div>

      <div style={{ padding: "0 16px 16px" }}>
        <MiniCalendar
          year={viewYear}
          month={viewMonth}
          loggedDays={effectiveLoggedDays}
          isCurrentMonth={isCurrentMonth}
          todayDate={todayDate}
          isFutureMonth={isFutureMonth}
          onDayClick={goToDay}
        />
      </div>

      <div style={{ padding: "8px 24px 8px" }}>
        <div className="v2-label">
          {locale === "ko" ? "내 플랜" : "My Plans"}
        </div>
      </div>
      <div style={{ padding: "0 16px" }}>
        {plansLoading && (
          <V2Card tone="inset">
            <p
              className="v2-small"
              style={{ color: "var(--v2-ink-3)", margin: 0 }}
            >
              {locale === "ko" ? "불러오는 중…" : "Loading…"}
            </p>
          </V2Card>
        )}
        {error && (
          <V2Card tone="inset">
            <p
              className="v2-small"
              style={{ color: "var(--v2-c-danger)", margin: 0 }}
            >
              {error}
            </p>
          </V2Card>
        )}
        {plans !== null && plans.length === 0 && !error && (
          <V2Card tone="inset">
            <p
              className="v2-small"
              style={{ color: "var(--v2-ink-3)", margin: 0 }}
            >
              {locale === "ko"
                ? "등록된 플랜이 없습니다."
                : "No plans yet."}
            </p>
          </V2Card>
        )}
        {sortedPlans.slice(0, 5).map((plan) => (
          <Link
            key={plan.id}
            href={`/workout/log?planId=${encodeURIComponent(plan.id)}`}
            onClick={onClose}
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
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: 22,
                      color: "var(--v2-accent)",
                    }}
                    aria-hidden
                  >
                    event_note
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
                    {plan.name}
                  </div>
                  <div
                    className="v2-mono-label"
                    style={{
                      color: "var(--v2-ink-3)",
                      marginTop: 2,
                    }}
                  >
                    {plan.baseProgramName ?? plan.type}
                    {" · "}
                    {relativeLabel(plan.lastPerformedAt, locale)}
                  </div>
                </div>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 20, color: "var(--v2-ink-3)" }}
                  aria-hidden
                >
                  chevron_right
                </span>
              </div>
            </V2Card>
          </Link>
        ))}
      </div>

      <div style={{ padding: "16px 16px 24px", display: "flex", gap: 8 }}>
        <Link
          href="/calendar"
          onClick={onClose}
          style={{ flex: 1, textDecoration: "none" }}
        >
          <button
            type="button"
            style={{
              width: "100%",
              minHeight: 44,
              padding: "10px 18px",
              borderRadius: 12,
              background: "var(--v2-paper-2)",
              color: "var(--v2-ink)",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--v2-f-display)",
              fontWeight: 600,
              fontSize: 14,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 18 }}
              aria-hidden
            >
              calendar_month
            </span>
            {locale === "ko" ? "전체 캘린더" : "Full calendar"}
          </button>
        </Link>
        <Link
          href={APP_ROUTES.plansHome}
          onClick={onClose}
          style={{ flex: 1, textDecoration: "none" }}
        >
          <button
            type="button"
            style={{
              width: "100%",
              minHeight: 44,
              padding: "10px 18px",
              borderRadius: 12,
              background: "var(--v2-accent)",
              color: "var(--v2-ink-on-accent)",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--v2-f-display)",
              fontWeight: 700,
              fontSize: 14,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 18 }}
              aria-hidden
            >
              event_note
            </span>
            {locale === "ko" ? "플랜 관리" : "Manage plans"}
          </button>
        </Link>
      </div>
    </V2Sheet>
  );
}
