"use client";

import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { useLocale } from "@/components/locale-provider";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { V2Icon } from "@/components/v2/primitives/v2-icon";
import { apiGet, isAbortError } from "@/lib/api";
import { formatPerformedHistoryLine } from "@/lib/workout-notation";
import { bodyweightAddedSuffix } from "@/lib/bodyweight-load";
import {
  draftAtom,
  workoutPreferencesAtom,
} from "@/features/workout-log/store/workout-log-atoms";
import { TargetWeightChip } from "@/features/progression/ui/target-weight-chip";
import type {
  CycleOverviewResponse,
  CycleOverviewSession,
  CycleOverviewSessionExercise,
} from "@/server/plans/cycle-overview-types";

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
  const bodyweightKg = useAtomValue(workoutPreferencesAtom).bodyweightKg;

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
    <BottomSheet
      open={open}
      onClose={onClose}
      headless
      height="92dvh"
      title={localeKey === "ko" ? "사이클 개요" : "Cycle overview"}
      closeLabel={localeKey === "ko" ? "닫기" : "Close"}
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
                <TargetWeightChip
                  key={t.progressionTarget}
                  label={t.label}
                  weightKg={t.weightKg}
                  lastDeltaKg={t.lastDeltaKg}
                  lastEventType={t.lastEventType}
                  weightSuffix={bodyweightAddedSuffix(
                    t.label,
                    t.weightKg,
                    bodyweightKg,
                    localeKey,
                  )}
                />
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
                        bodyweightKg={bodyweightKg}
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
    </BottomSheet>
  );
}

function SessionCard({
  session,
  locale,
  bodyweightKg,
}: {
  session: CycleOverviewSession;
  locale: "ko" | "en";
  bodyweightKg: number | null;
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
            <V2Icon name={badgeIcon} style={{ fontSize: "var(--v2-t-14)" }} />
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
                bodyweightKg={bodyweightKg}
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
  bodyweightKg,
}: {
  exercise: CycleOverviewSessionExercise;
  locale: "ko" | "en";
  bodyweightKg: number | null;
}) {
  const setSummary = formatSetsSummary(
    exercise.sets ?? [],
    locale,
    exercise.exerciseName,
    bodyweightKg,
  );
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
  locale: "ko" | "en",
  exerciseName?: string,
  bodyweightKg?: number | null,
): string {
  if (!sets || sets.length === 0) return "—";
  // 히스토리 컨벤션: per-set `Weight × Reps`. uniform 시에만 compact `Weight × Reps × Sets`.
  // 목표 무게(targetWeightKg)는 이미 총부하(TM×%)이므로, 맨몸 운동은 총무게 뒤에
  // 추가중량을 병기한다 (`105kg (+31) × 5 × 3`).
  const normalized = sets.map((s) => ({
    weightKg: s.weightKg ?? 0,
    reps: s.reps ?? 0,
  }));
  return formatPerformedHistoryLine(normalized, {
    exerciseName,
    bodyweightKg,
    locale,
  });
}

function formatSessionDate(dateStr: string, locale: "ko" | "en"): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return locale === "ko" ? `${month}월 ${day}일` : `${month}/${day}`;
}
