"use client";

import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { useLocale } from "@/components/locale-provider";
import {
  V2Chip,
  V2Hairline,
  V2IconBtn,
  V2Sheet,
} from "@/components/v2/primitives";
import {
  draftAtom,
  programEntryStateAtom,
  visibleExercisesAtom,
} from "@/features/workout-log/store/workout-log-atoms";
import type { KeypadInitialFocus } from "./workout-log-keypad-panel";

type WorkoutLogSummarySheetProps = {
  open: boolean;
  onClose: () => void;
  onJumpToExercise: (focus: KeypadInitialFocus) => void;
};

/**
 * 오늘의 운동 조회 시트 (read-only).
 * - 모든 운동을 펼친 상태로 한 번에 표시 (요약 헤더 + 세트 detail)
 * - "이 운동으로" 버튼 → 키패드를 해당 운동의 첫 빈 셋으로 포커싱
 */
export function WorkoutLogSummarySheet({
  open,
  onClose,
  onJumpToExercise,
}: WorkoutLogSummarySheetProps) {
  const { locale } = useLocale();
  const visibleExercises = useAtomValue(visibleExercisesAtom);
  const programEntryState = useAtomValue(programEntryStateAtom);
  const draft = useAtomValue(draftAtom);

  const allExercises = useMemo(
    () => visibleExercises.filter((ex) => !ex.deleted),
    [visibleExercises],
  );

  const totalSets = allExercises.reduce(
    (s, ex) => s + ex.set.repsPerSet.length,
    0,
  );
  const completedSets = useMemo(() => {
    let n = 0;
    for (const ex of allExercises) {
      if (ex.source === "PROGRAM") {
        const inputs = programEntryState[ex.id]?.repsInputs ?? [];
        for (let i = 0; i < ex.set.repsPerSet.length; i++) {
          const v = (inputs[i] ?? "").trim();
          if (v && Number.isFinite(Number(v)) && Number(v) > 0) n++;
        }
      } else {
        for (const r of ex.set.repsPerSet) {
          if (r > 0) n++;
        }
      }
    }
    return n;
  }, [allExercises, programEntryState]);

  return (
    <V2Sheet
      open={open}
      onClose={onClose}
      height="92%"
      ariaLabel={locale === "ko" ? "오늘의 운동" : "Today's workout"}
    >
      <div style={{ padding: "8px 24px 12px" }}>
        <p className="v2-eyebrow">
          {locale === "ko" ? "오늘의 운동" : "TODAY"} ·{" "}
          <span style={{ color: "var(--v2-c-success)" }}>
            {completedSets}/{totalSets}
          </span>
        </p>
        <h1 className="v2-h2" style={{ marginTop: 4, fontSize: 18 }}>
          {locale === "ko"
            ? `${allExercises.length}개 운동`
            : `${allExercises.length} exercises`}
        </h1>
        {draft?.session.note.memo ? (
          <p
            className="v2-small"
            style={{
              marginTop: 8,
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
          padding: "0 16px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {allExercises.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              color: "var(--v2-ink-3)",
            }}
          >
            <p className="v2-small">
              {locale === "ko"
                ? "기록할 운동이 없습니다."
                : "No exercises to log."}
            </p>
          </div>
        ) : (
          allExercises.map((ex) => {
            const repsInputs =
              ex.source === "PROGRAM"
                ? (programEntryState[ex.id]?.repsInputs ?? [])
                : ex.set.repsPerSet.map((r) => (r > 0 ? String(r) : ""));
            const filledCount = repsInputs.filter(
              (v) => (v ?? "").toString().trim() !== "" && Number(v) > 0,
            ).length;
            const totalSetsExercise = ex.set.repsPerSet.length;
            const planSummary = formatPlanSummary(ex, locale);
            const memo =
              ex.source === "PROGRAM"
                ? programEntryState[ex.id]?.memoInput
                : ex.note?.memo;
            const isUser = ex.source === "USER";

            return (
              <article
                key={ex.id}
                aria-label={ex.exerciseName}
                style={{
                  background: "var(--v2-paper-2)",
                  borderRadius: "var(--v2-r-2)",
                  overflow: "hidden",
                }}
              >
                <header
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span
                        className="v2-h3"
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "var(--v2-ink)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {ex.exerciseName}
                      </span>
                      {isUser && <V2Chip tone="neutral">USER</V2Chip>}
                    </div>
                    <div
                      className="v2-mono-label"
                      style={{
                        marginTop: 2,
                        color: "var(--v2-ink-3)",
                        fontSize: 10,
                      }}
                    >
                      {planSummary}
                    </div>
                  </div>
                  <ProgressBadge
                    filled={filledCount}
                    total={totalSetsExercise}
                  />
                  <V2IconBtn
                    icon="dialpad"
                    size={36}
                    tone="accent"
                    label={
                      locale === "ko"
                        ? `${ex.exerciseName} 키패드 입력`
                        : `Enter ${ex.exerciseName}`
                    }
                    onClick={() => {
                      const empty = repsInputs.findIndex(
                        (v) =>
                          (v ?? "").toString().trim() === "" ||
                          Number(v) <= 0,
                      );
                      onJumpToExercise({
                        exerciseId: ex.id,
                        setIndex: empty >= 0 ? empty : 0,
                        field: "reps",
                        nonce: Date.now(),
                      });
                      onClose();
                    }}
                    style={{ borderRadius: "var(--v2-r-2)", flexShrink: 0 }}
                  />
                </header>
                <div style={{ padding: "0 14px 14px" }}>
                  <V2Hairline />
                  <SetDetailTable
                    exercise={ex}
                    repsInputs={repsInputs}
                    locale={locale}
                  />
                  {memo ? (
                    <div
                      style={{
                        marginTop: 10,
                        padding: "10px 12px",
                        borderRadius: "var(--v2-r-1)",
                        background: "var(--v2-paper)",
                        color: "var(--v2-ink-2)",
                        fontSize: 12,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {memo}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </div>
    </V2Sheet>
  );
}

function ProgressBadge({ filled, total }: { filled: number; total: number }) {
  const isComplete = total > 0 && filled >= total;
  return (
    <span
      className="v2-mono-label"
      style={{
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: "var(--v2-r-pill)",
        background: isComplete
          ? "color-mix(in srgb, var(--v2-c-success) 18%, var(--v2-paper))"
          : "var(--v2-paper-3)",
        color: isComplete ? "var(--v2-c-success)" : "var(--v2-ink-3)",
        flexShrink: 0,
        minWidth: 36,
        textAlign: "center",
      }}
    >
      {filled}/{total}
    </span>
  );
}

function SetDetailTable({
  exercise,
  repsInputs,
  locale,
}: {
  exercise: ReturnType<
    typeof useAtomValue<typeof visibleExercisesAtom>
  >[number];
  repsInputs: string[];
  locale: "ko" | "en";
}) {
  const sets = exercise.set.repsPerSet.map((_, i) => i);
  return (
    <div
      style={{
        marginTop: 10,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        className="v2-mono-label"
        style={{
          display: "grid",
          gridTemplateColumns: "24px 1fr 1fr 1fr 24px",
          gap: 8,
          fontSize: 9,
          color: "var(--v2-ink-3)",
          padding: "0 8px",
        }}
      >
        <span>#</span>
        <span style={{ textAlign: "right" }}>
          {locale === "ko" ? "중량" : "WT"}
        </span>
        <span style={{ textAlign: "right" }}>
          {locale === "ko" ? "반복" : "REPS"}
        </span>
        <span style={{ textAlign: "right" }}>RPE</span>
        <span style={{ textAlign: "center" }}>✓</span>
      </div>
      {sets.map((i) => {
        const repsRaw =
          exercise.source === "PROGRAM"
            ? (repsInputs[i] ?? "").trim()
            : exercise.set.repsPerSet[i] > 0
              ? String(exercise.set.repsPerSet[i])
              : "";
        const repsNum = Number(repsRaw);
        const hasReps = !!repsRaw && Number.isFinite(repsNum) && repsNum > 0;
        const plannedReps =
          exercise.source === "PROGRAM"
            ? exercise.set.repsPerSet[i]
            : undefined;
        const isFailure =
          exercise.source === "PROGRAM" &&
          hasReps &&
          typeof plannedReps === "number" &&
          plannedReps > 0 &&
          repsNum < plannedReps;
        const isSetComplete =
          hasReps && (!plannedReps || repsNum >= plannedReps);

        const rpe = exercise.set.rpePerSet?.[i] ?? 0;
        const rpeStr =
          Number.isFinite(rpe) && rpe > 0
            ? Number.isInteger(rpe)
              ? String(rpe)
              : rpe.toFixed(1)
            : "—";

        return (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "24px 1fr 1fr 1fr 24px",
              gap: 8,
              alignItems: "center",
              padding: "6px 8px",
              borderRadius: "var(--v2-r-1)",
              background: isSetComplete
                ? "color-mix(in srgb, var(--v2-c-success) 8%, var(--v2-paper))"
                : isFailure
                  ? "color-mix(in srgb, var(--v2-c-danger) 12%, var(--v2-paper))"
                  : "var(--v2-paper)",
              fontSize: 12,
            }}
          >
            <span
              className="v2-mono-label"
              style={{ color: "var(--v2-ink-3)", fontSize: 10 }}
            >
              {i + 1}
            </span>
            <span
              style={{
                textAlign: "right",
                color: "var(--v2-c-weight)",
                fontWeight: 700,
              }}
            >
              {exercise.set.weightKg > 0 ? exercise.set.weightKg : "—"}
            </span>
            <span
              style={{
                textAlign: "right",
                color: hasReps ? "var(--v2-c-reps)" : "var(--v2-ink-3)",
                fontWeight: 700,
              }}
            >
              {hasReps ? repsRaw : "—"}
              {exercise.source === "PROGRAM" &&
              plannedReps != null &&
              plannedReps > 0 ? (
                <span
                  className="v2-mono-label"
                  style={{
                    marginLeft: 4,
                    color: "var(--v2-ink-3)",
                    fontSize: 9,
                  }}
                >
                  /{plannedReps}
                </span>
              ) : null}
            </span>
            <span
              style={{
                textAlign: "right",
                color:
                  rpe > 0 ? "var(--v2-c-warning)" : "var(--v2-ink-3)",
                fontWeight: 600,
              }}
            >
              {rpeStr}
            </span>
            <span
              style={{
                textAlign: "center",
                color: isFailure
                  ? "var(--v2-c-danger)"
                  : isSetComplete
                    ? "var(--v2-c-success)"
                    : "var(--v2-ink-3)",
              }}
            >
              {isFailure ? (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16 }}
                  aria-hidden
                >
                  close
                </span>
              ) : isSetComplete ? (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16 }}
                  aria-hidden
                >
                  check
                </span>
              ) : (
                "—"
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function formatPlanSummary(
  exercise: ReturnType<
    typeof useAtomValue<typeof visibleExercisesAtom>
  >[number],
  locale: "ko" | "en",
): string {
  const totalSets = exercise.set.repsPerSet.length;
  const weight = exercise.set.weightKg;
  const plannedReps = exercise.set.repsPerSet;
  const allSameReps =
    plannedReps.length > 0 && plannedReps.every((r) => r === plannedReps[0]);

  const setsLabel = locale === "ko" ? "세트" : "sets";

  let plan: string;
  if (allSameReps && plannedReps[0] > 0) {
    plan = `${totalSets}×${plannedReps[0]}`;
  } else {
    plan = `${totalSets} ${setsLabel}`;
  }

  if (weight > 0) {
    return `${plan} · ${weight}kg`;
  }
  return `${plan} · — kg`;
}
