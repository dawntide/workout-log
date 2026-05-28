"use client";

import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useLocale } from "@/components/locale-provider";
import { V2Sheet } from "@/components/v2/primitives";
import { apiGet, isAbortError } from "@/lib/api";
import { formatPerformedHistoryLine } from "@/lib/workout-notation";
import { draftAtom } from "@/features/workout-log/store/workout-log-atoms";
import type {
  CycleOverviewResponse,
  CycleOverviewSession,
  CycleOverviewSessionExercise,
  CycleOverviewTarget,
} from "@/app/api/plans/[planId]/cycle-overview/route";

type WorkoutLogSummarySheetProps = {
  open: boolean;
  onClose: () => void;
  planId: string | null;
};

/**
 * 사이클 개요 시트.
 * - 사이클 진행도 바
 * - 운동별 현재 무게 + 직전 변화
 * - 세션 타임라인 (주차별 그룹, 완료/오늘/예정 상태)
 */
export function WorkoutLogSummarySheet({
  open,
  onClose,
  planId,
}: WorkoutLogSummarySheetProps) {
  const { locale } = useLocale();
  const localeKey: "ko" | "en" = locale === "ko" ? "ko" : "en";
  const draft = useAtomValue(draftAtom);

  const [overview, setOverview] = useState<CycleOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !planId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    apiGet<CycleOverviewResponse>(`/api/plans/${planId}/cycle-overview`, {
      signal: controller.signal,
      cachePolicy: "network-only",
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setOverview(data);
        setLoading(false);
      })
      .catch((e) => {
        if (isAbortError(e) || controller.signal.aborted) return;
        setError(String((e as Error)?.message ?? e));
        setLoading(false);
      });
    return () => controller.abort();
  }, [open, planId]);

  const doneCount = useMemo(
    () => overview?.sessions.filter((s) => s.status === "DONE").length ?? 0,
    [overview],
  );
  const totalCount = overview?.sessions.length ?? 0;
  const progressPercent =
    totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const cycleLabel = overview
    ? localeKey === "ko"
      ? `사이클 ${overview.cycleNumber}`
      : `Cycle ${overview.cycleNumber}`
    : null;

  const currentLabel = overview
    ? `W${overview.current.week}D${overview.current.day}`
    : null;

  const sessionsByWeek = useMemo(() => {
    if (!overview?.sessions || overview.sessions.length === 0) {
      return [] as Array<{ week: number; days: CycleOverviewSession[] }>;
    }
    const map = new Map<number, CycleOverviewSession[]>();
    for (const s of overview.sessions) {
      const arr = map.get(s.week) ?? [];
      arr.push(s);
      map.set(s.week, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([week, days]) => ({
        week,
        days: days.slice().sort((a, b) => a.day - b.day),
      }));
  }, [overview]);

  const showEmpty =
    overview != null &&
    totalCount === 0 &&
    overview.targets.length === 0;

  return (
    <V2Sheet
      open={open}
      onClose={onClose}
      height="92%"
      ariaLabel={localeKey === "ko" ? "사이클 개요" : "Cycle overview"}
    >
      <div style={{ padding: "var(--v2-s-2) var(--v2-s-6) var(--v2-s-3)" }}>
        <p className="v2-eyebrow">
          {overview
            ? `${overview.programName}${cycleLabel ? ` · ${cycleLabel}` : ""}`
            : localeKey === "ko"
              ? "사이클 개요"
              : "Cycle overview"}
        </p>
        <h1
          className="v2-h2"
          style={{
            marginTop: "var(--v2-s-1)",
            fontSize: "var(--v2-t-18)",
          }}
        >
          {currentLabel ?? (localeKey === "ko" ? "사이클" : "Cycle")}
        </h1>
        {draft?.session.note.memo ? (
          <p
            className="v2-small"
            style={{
              marginTop: "var(--v2-s-2)",
              color: "var(--v2-ink-3)",
              whiteSpace: "pre-wrap",
            }}
          >
            {draft.session.note.memo}
          </p>
        ) : null}
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0px var(--v2-s-6) var(--v2-s-6)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-5)",
        }}
      >
        {totalCount > 0 ? (
          <section aria-label={localeKey === "ko" ? "사이클 진행도" : "Cycle progress"}>
            <div
              className="v2-mono-label"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "var(--v2-s-2)",
                color: "var(--v2-ink-3)",
                fontSize: "var(--v2-t-eyebrow)",
              }}
            >
              <span>{localeKey === "ko" ? "진행도" : "PROGRESS"}</span>
              <span>
                <span style={{ color: "var(--v2-c-success)" }}>{doneCount}</span>
                <span> / {totalCount}</span>
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={totalCount}
              aria-valuenow={doneCount}
              style={{
                width: "100%",
                height: "var(--v2-s-2)",
                background: "var(--v2-paper-2)",
                borderRadius: "var(--v2-r-pill)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  background: "var(--v2-c-success)",
                  transition: "width var(--v2-d-2) var(--v2-e-out)",
                }}
              />
            </div>
          </section>
        ) : null}

        {overview && overview.targets.length > 0 ? (
          <section
            aria-label={
              localeKey === "ko" ? "운동별 현재 무게" : "Current weights"
            }
          >
            <p
              className="v2-mono-label"
              style={{
                color: "var(--v2-ink-3)",
                fontSize: "var(--v2-t-eyebrow)",
                marginBottom: "var(--v2-s-2)",
              }}
            >
              {localeKey === "ko" ? "운동별 현재 무게" : "CURRENT WEIGHTS"}
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--v2-s-2)",
              }}
            >
              {overview.targets.map((t) => (
                <TargetWeightChip key={t.progressionTarget} target={t} />
              ))}
            </div>
          </section>
        ) : null}

        {sessionsByWeek.length > 0 ? (
          <section
            aria-label={
              localeKey === "ko" ? "세션 타임라인" : "Session timeline"
            }
          >
            <p
              className="v2-mono-label"
              style={{
                color: "var(--v2-ink-3)",
                fontSize: "var(--v2-t-eyebrow)",
                marginBottom: "var(--v2-s-2)",
              }}
            >
              {localeKey === "ko" ? "세션 타임라인" : "TIMELINE"}
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--v2-s-4)",
              }}
            >
              {sessionsByWeek.map(({ week, days }) => (
                <div key={week}>
                  <p
                    className="v2-mono-label"
                    style={{
                      fontSize: "var(--v2-t-12)",
                      color: "var(--v2-ink-3)",
                      fontWeight: 700,
                      marginBottom: "var(--v2-s-2)",
                      paddingLeft: "var(--v2-s-1)",
                    }}
                  >
                    W{week}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--v2-s-2)",
                    }}
                  >
                    {days.map((s) => (
                      <SessionCard
                        key={s.sessionKey}
                        session={s}
                        locale={localeKey}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {loading && !overview ? (
          <div
            style={{
              padding: "var(--v2-s-7) var(--v2-s-4)",
              textAlign: "center",
              color: "var(--v2-ink-3)",
            }}
          >
            <p className="v2-small">
              {localeKey === "ko" ? "불러오는 중..." : "Loading..."}
            </p>
          </div>
        ) : null}
        {error && !overview ? (
          <div
            style={{
              padding: "var(--v2-s-7) var(--v2-s-4)",
              textAlign: "center",
              color: "var(--v2-ink-3)",
            }}
          >
            <p className="v2-small">
              {localeKey === "ko"
                ? "불러오기에 실패했어요."
                : "Failed to load."}
            </p>
          </div>
        ) : null}
        {showEmpty ? (
          <div
            style={{
              padding: "var(--v2-s-7) var(--v2-s-4)",
              textAlign: "center",
              color: "var(--v2-ink-3)",
            }}
          >
            <p className="v2-small">
              {localeKey === "ko"
                ? "이 플랜은 사이클 정보를 표시할 수 없어요."
                : "Cycle data is unavailable for this plan."}
            </p>
          </div>
        ) : null}
      </div>
    </V2Sheet>
  );
}

function TargetWeightChip({ target }: { target: CycleOverviewTarget }) {
  const arrowKey =
    target.lastEventType === "INCREASE"
      ? "arrow_upward"
      : target.lastEventType === "RESET"
        ? "arrow_downward"
        : null;
  const arrowColor =
    target.lastEventType === "INCREASE"
      ? "var(--v2-c-success)"
      : target.lastEventType === "RESET"
        ? "var(--v2-c-danger)"
        : "var(--v2-ink-3)";
  const hasDelta =
    arrowKey !== null &&
    target.lastDeltaKg !== null &&
    Math.abs(target.lastDeltaKg) > 0;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--v2-s-2)",
        padding: "var(--v2-s-2) var(--v2-s-3)",
        background: "var(--v2-paper-2)",
        borderRadius: "var(--v2-r-2)",
        minHeight: "var(--v2-s-8)",
      }}
    >
      <span
        style={{
          fontSize: "var(--v2-t-12)",
          color: "var(--v2-ink)",
          fontWeight: 700,
        }}
      >
        {target.label}
      </span>
      <span
        className="v2-mono-label"
        style={{
          fontSize: "var(--v2-t-14)",
          color: "var(--v2-c-weight)",
          fontWeight: 700,
        }}
      >
        {target.weightKg !== null ? `${target.weightKg}kg` : "—"}
      </span>
      {hasDelta ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            color: arrowColor,
            fontSize: "var(--v2-t-eyebrow)",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "var(--v2-t-14)" }}
            aria-hidden
          >
            {arrowKey}
          </span>
          <span className="v2-mono-label">
            {target.lastDeltaKg! > 0
              ? `+${target.lastDeltaKg}`
              : `${target.lastDeltaKg}`}
          </span>
        </span>
      ) : null}
    </div>
  );
}

function SessionCard({
  session,
  locale,
}: {
  session: CycleOverviewSession;
  locale: "ko" | "en";
}) {
  const isDone = session.status === "DONE";
  const isToday = session.status === "TODAY";
  const stateLabel = isDone
    ? locale === "ko"
      ? "완료"
      : "Done"
    : isToday
      ? locale === "ko"
        ? "오늘"
        : "Today"
      : locale === "ko"
        ? "예정"
        : "Planned";
  const badgeBg = isDone
    ? "color-mix(in srgb, var(--v2-c-success) 22%, var(--v2-paper))"
    : isToday
      ? "var(--v2-accent)"
      : "var(--v2-paper-3)";
  const badgeColor = isDone
    ? "var(--v2-c-success)"
    : isToday
      ? "var(--v2-ink-on-accent)"
      : "var(--v2-ink-3)";
  const badgeIcon = isDone
    ? "check"
    : isToday
      ? "radio_button_checked"
      : null;
  const cardBg = isToday
    ? "color-mix(in srgb, var(--v2-accent) 14%, var(--v2-paper-2))"
    : "var(--v2-paper-2)";

  return (
    <article
      aria-label={`W${session.week}D${session.day} ${stateLabel}`}
      style={{
        background: cardBg,
        borderRadius: "var(--v2-r-2)",
        padding: "var(--v2-s-3) var(--v2-s-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--v2-s-2)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--v2-s-2)",
        }}
      >
        <span
          className="v2-mono-label"
          style={{
            fontSize: "var(--v2-t-12)",
            fontWeight: 700,
            color: "var(--v2-ink)",
            minWidth: "var(--v2-s-7)",
          }}
        >
          D{session.day}
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            padding: "2px var(--v2-s-2)",
            background: badgeBg,
            color: badgeColor,
            borderRadius: "var(--v2-r-pill)",
            fontSize: "var(--v2-t-eyebrow)",
            fontWeight: 700,
          }}
        >
          {badgeIcon ? (
            <span
              className="material-symbols-outlined"
              style={{ fontSize: "var(--v2-t-14)" }}
              aria-hidden
            >
              {badgeIcon}
            </span>
          ) : null}
          <span className="v2-mono-label">{stateLabel}</span>
        </span>
        {session.sessionDate ? (
          <span
            className="v2-mono-label"
            style={{
              marginLeft: "auto",
              fontSize: "var(--v2-t-eyebrow)",
              color: "var(--v2-ink-3)",
            }}
          >
            {formatSessionDate(session.sessionDate, locale)}
          </span>
        ) : null}
      </header>
      {(() => {
        const exercises = session.exercises ?? [];
        return exercises.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            {exercises.map((ex, i) => (
              <ExerciseRow
                key={`${ex.exerciseName}-${i}`}
                exercise={ex}
                locale={locale}
              />
            ))}
          </div>
        ) : (
          <p
            className="v2-small"
            style={{ color: "var(--v2-ink-3)", margin: 0 }}
          >
            {locale === "ko" ? "운동 정보 없음" : "No exercise data"}
          </p>
        );
      })()}
    </article>
  );
}

function ExerciseRow({
  exercise,
  locale,
}: {
  exercise: CycleOverviewSessionExercise;
  locale: "ko" | "en";
}) {
  const setSummary = formatSetsSummary(exercise.sets ?? [], locale);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: "var(--v2-s-2)",
        alignItems: "baseline",
        padding: "2px var(--v2-s-1)",
      }}
    >
      <span
        style={{
          fontSize: "var(--v2-t-12)",
          color: "var(--v2-ink-2)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {exercise.exerciseName}
        {exercise.role === "ASSIST" ? (
          <span
            className="v2-mono-label"
            style={{
              marginLeft: "var(--v2-s-1)",
              fontSize: "var(--v2-t-eyebrow)",
              color: "var(--v2-ink-3)",
            }}
          >
            {locale === "ko" ? "보조" : "ASSIST"}
          </span>
        ) : null}
      </span>
      <span
        className="v2-mono-label"
        style={{
          fontSize: "var(--v2-t-12)",
          color: "var(--v2-ink)",
          fontWeight: 600,
          textAlign: "right",
        }}
      >
        {setSummary}
      </span>
    </div>
  );
}

function formatSetsSummary(
  sets: CycleOverviewSessionExercise["sets"],
  _locale: "ko" | "en",
): string {
  if (!sets || sets.length === 0) return "—";
  // 히스토리 컨벤션: per-set `Weight × Reps`. uniform 시에만 compact `Weight × Reps × Sets`.
  const normalized = sets.map((s) => ({
    weightKg: s.weightKg ?? 0,
    reps: s.reps ?? 0,
  }));
  return formatPerformedHistoryLine(normalized);
}

function formatSessionDate(dateStr: string, locale: "ko" | "en"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return locale === "ko" ? `${month}월 ${day}일` : `${month}/${day}`;
}
