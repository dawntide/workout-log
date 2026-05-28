"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAtomValue } from "jotai";
import { useLocale } from "@/components/locale-provider";
import {
  V2Card,
  V2Chip,
  V2Hairline,
  V2Textarea,
} from "@/components/v2/primitives";
import {
  makeExerciseCardAtom,
  recentLogItemsAtom,
} from "@/features/workout-log/store/workout-log-atoms";
import type { ExerciseRowAction } from "@/features/workout-log/model/editor-actions";
import { formatDateFriendly } from "@/features/workout-log/model/last-session-summary";
import { useSetRowFocusChain } from "@/features/workout-log/model/use-set-row-focus-chain";
import { WorkoutSetRow } from "@/features/workout-log/ui/workout-set-row";

type Props = {
  exerciseId: string;
  onExerciseAction: (exerciseId: string, action: ExerciseRowAction) => void;
};

const ROW_GRID =
  "var(--v2-s-6) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) var(--v2-s-6)";

export function WorkoutExerciseCard({ exerciseId, onExerciseAction }: Props) {
  const { locale } = useLocale();
  const exerciseCardAtom = useMemo(
    () => makeExerciseCardAtom(exerciseId),
    [exerciseId],
  );
  const exerciseCard = useAtomValue(exerciseCardAtom);
  const recentLogItems = useAtomValue(recentLogItemsAtom);
  const focusChain = useSetRowFocusChain();
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    focusChain.registerCard(exerciseId, cardRef.current);
    return () => focusChain.unregisterCard(exerciseId);
  }, [exerciseId, focusChain]);

  const [memoVisibleManual, setMemoVisibleManual] = useState<boolean | null>(
    null,
  );

  if (!exerciseCard) return null;
  const { exercise } = exerciseCard;
  if (exercise.deleted) return null;

  const dispatchAction = (action: ExerciseRowAction) =>
    onExerciseAction(exerciseId, action);

  const isUser = exercise.source === "USER";
  const totalSets = exercise.set.repsPerSet.length;
  const isProgramAuto =
    exercise.source === "PROGRAM" && exercise.badge !== "CUSTOM";
  const plannedSetCount = isProgramAuto
    ? (exercise.plannedSetMeta?.repsPerSet.length ?? 0)
    : 0;
  const minSetCount = Math.max(1, plannedSetCount);
  const canRemoveSet = totalSets > minSetCount;

  const targetName = exercise.exerciseName.trim().toLowerCase();
  let previousSession: {
    performedAt: string;
    sets: { weightKg: number; reps: number }[];
  } | null = null;
  if (targetName) {
    for (const log of recentLogItems) {
      const matched = log.sets.filter(
        (s) => s.exerciseName.trim().toLowerCase() === targetName,
      );
      const usableSets = matched
        .map((s) => ({ weightKg: s.weightKg ?? 0, reps: s.reps ?? 0 }))
        .filter((s) => s.reps > 0);
      if (usableSets.length > 0) {
        previousSession = { performedAt: log.performedAt, sets: usableSets };
        break;
      }
    }
  }

  let recommendedWeightKg: number | null = null;
  if (
    typeof exercise.prescribedWeightKg === "number" &&
    exercise.prescribedWeightKg > 0
  ) {
    recommendedWeightKg = exercise.prescribedWeightKg;
  } else {
    const targetArr = exercise.plannedSetMeta?.targetWeightKgPerSet;
    if (targetArr) {
      for (const t of targetArr) {
        if (typeof t === "number" && t > 0) {
          recommendedWeightKg = t;
          break;
        }
      }
    }
  }

  let filledSets = 0;
  if (exercise.source === "PROGRAM") {
    const inputs = exerciseCard.programEntryState?.repsInputs ?? [];
    for (let i = 0; i < totalSets; i++) {
      const v = (inputs[i] ?? "").trim();
      if (v && Number(v) > 0) filledSets++;
    }
  } else {
    filledSets = exercise.set.repsPerSet.filter((r) => r > 0).length;
  }
  const cardComplete = totalSets > 0 && filledSets >= totalSets;

  const allSame =
    exercise.set.repsPerSet.length > 0 &&
    exercise.set.repsPerSet.every((r) => r === exercise.set.repsPerSet[0]);
  const setsLabel = locale === "ko" ? "세트" : "sets";
  const firstReps = exercise.set.repsPerSet[0] ?? 0;
  const planPart =
    allSame && firstReps > 0
      ? `${totalSets}×${firstReps}`
      : `${totalSets} ${setsLabel}`;
  const planSummary =
    exercise.set.weightKg > 0
      ? `${planPart} · ${exercise.set.weightKg}kg`
      : planPart;

  const memoValue =
    exercise.source === "PROGRAM"
      ? (exerciseCard.programEntryState?.memoInput ?? "")
      : (exercise.note?.memo ?? "");

  const memoVisible =
    memoVisibleManual ?? !!(memoValue && memoValue.trim().length > 0);

  const handleApplyRecommendedWeight = () => {
    if (recommendedWeightKg == null) return;
    dispatchAction({ type: "CHANGE_WEIGHT", value: recommendedWeightKg });
  };

  const handleAddSet = () => {
    dispatchAction({ type: "ADD_SET" });
  };

  const handleRemoveLastSet = () => {
    if (totalSets <= minSetCount) return;
    dispatchAction({ type: "REMOVE_SET", index: totalSets - 1 });
  };

  const handleDelete = () => {
    dispatchAction({ type: "DELETE" });
  };

  const handleMemoChange = (value: string) => {
    dispatchAction({ type: "CHANGE_MEMO", value });
  };

  const toggleMemo = () => {
    setMemoVisibleManual((prev) => {
      const current = prev ?? !!(memoValue && memoValue.trim().length > 0);
      return !current;
    });
  };

  return (
    <V2Card
      tone="paper"
      padding="var(--v2-s-4)"
      style={{
        scrollMarginTop: "var(--v2-s-4)",
        scrollMarginBottom: "var(--v2-s-9)",
      }}
    >
      <article
        ref={cardRef}
        aria-label={exercise.exerciseName}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-3)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--v2-s-2)",
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--v2-s-1)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--v2-s-2)",
                minWidth: 0,
              }}
            >
              <span
                className="v2-h3"
                style={{
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {exercise.exerciseName}
              </span>
              {isUser ? (
                <V2Chip tone="neutral">USER</V2Chip>
              ) : exercise.badge === "CUSTOM" ? (
                <V2Chip tone="accent" icon="tune">
                  {locale === "ko" ? "수동" : "CUSTOM"}
                </V2Chip>
              ) : (
                <V2Chip tone="info" icon="bolt">
                  {locale === "ko" ? "자동" : "AUTO"}
                </V2Chip>
              )}
            </div>
            <span
              className="v2-mono-label"
              style={{ color: "var(--v2-ink-3)" }}
            >
              {planSummary}
            </span>
          </div>
          <span
            className="v2-mono-label"
            style={{
              padding: "var(--v2-s-1) var(--v2-s-2)",
              borderRadius: "var(--v2-r-pill)",
              background: cardComplete
                ? "color-mix(in srgb, var(--v2-c-success) 18%, var(--v2-paper))"
                : "var(--v2-paper-2)",
              color: cardComplete
                ? "var(--v2-c-success)"
                : "var(--v2-ink-3)",
              minWidth: "var(--v2-s-7)",
              textAlign: "center",
            }}
          >
            {filledSets}/{totalSets}
          </span>
        </div>

        {!previousSession && recommendedWeightKg != null && (
          <div style={{ display: "flex" }}>
            <ChipButton
              onClick={handleApplyRecommendedWeight}
              icon="restart_alt"
              tone="accent"
              size="sm"
            >
              {locale === "ko"
                ? firstReps > 0
                  ? `권장 ${recommendedWeightKg}×${firstReps}`
                  : `권장 ${recommendedWeightKg}kg`
                : firstReps > 0
                  ? `Target ${recommendedWeightKg}×${firstReps}`
                  : `Suggested ${recommendedWeightKg}kg`}
            </ChipButton>
          </div>
        )}

        {previousSession && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--v2-s-2)",
              overflow: "hidden",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: "var(--v2-t-14)",
                color: "var(--v2-ink-3)",
              }}
              aria-hidden
            >
              history
            </span>
            <span
              className="v2-mono-label"
              style={{
                color: "var(--v2-ink-3)",
                flexShrink: 0,
              }}
            >
              {locale === "ko" ? "지난" : "PREV"}{" "}
              {formatDateFriendly(previousSession.performedAt, locale)}
            </span>
            {(() => {
              const sets = previousSession.sets;
              const uniform =
                sets.length > 0 &&
                sets.every(
                  (s) =>
                    s.weightKg === sets[0].weightKg && s.reps === sets[0].reps,
                );
              if (uniform) {
                const s0 = sets[0];
                return (
                  <span
                    className="v2-mono-label"
                    style={{
                      flexShrink: 0,
                      marginRight: "auto",
                      padding: "var(--v2-s-1) var(--v2-s-2)",
                      borderRadius: "var(--v2-r-0)",
                      background: "var(--v2-paper-2)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ color: "var(--v2-c-weight)" }}>
                      {s0.weightKg > 0 ? s0.weightKg : "—"}
                    </span>
                    <span
                      style={{
                        color: "var(--v2-ink-3)",
                        margin: "0 var(--v2-s-1)",
                      }}
                    >
                      ×
                    </span>
                    <span style={{ color: "var(--v2-c-reps)" }}>{s0.reps}</span>
                    {sets.length > 1 && (
                      <span
                        style={{
                          color: "var(--v2-ink-3)",
                          marginLeft: "var(--v2-s-2)",
                        }}
                      >
                        ×{sets.length}
                      </span>
                    )}
                  </span>
                );
              }
              return (
                <div
                  style={{
                    display: "flex",
                    gap: "var(--v2-s-1)",
                    overflowX: "auto",
                    scrollbarWidth: "none",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {sets.map((s, i) => (
                    <span
                      key={i}
                      className="v2-mono-label"
                      style={{
                        flexShrink: 0,
                        padding: "var(--v2-s-1) var(--v2-s-2)",
                        borderRadius: "var(--v2-r-0)",
                        background: "var(--v2-paper-2)",
                      }}
                    >
                      <span style={{ color: "var(--v2-c-weight)" }}>
                        {s.weightKg > 0 ? s.weightKg : "—"}
                      </span>
                      <span
                        style={{
                          color: "var(--v2-ink-3)",
                          margin: "0 var(--v2-s-1)",
                        }}
                      >
                        ×
                      </span>
                      <span style={{ color: "var(--v2-c-reps)" }}>{s.reps}</span>
                    </span>
                  ))}
                </div>
              );
            })()}
            {recommendedWeightKg != null && (
              <div style={{ flexShrink: 0 }}>
                <ChipButton
                  onClick={handleApplyRecommendedWeight}
                  icon="restart_alt"
                  tone="accent"
                  size="sm"
                >
                  {locale === "ko"
                    ? firstReps > 0
                      ? `권장 ${recommendedWeightKg}×${firstReps}`
                      : `권장 ${recommendedWeightKg}kg`
                    : firstReps > 0
                      ? `Target ${recommendedWeightKg}×${firstReps}`
                      : `Suggested ${recommendedWeightKg}kg`}
                </ChipButton>
              </div>
            )}
          </div>
        )}

        <V2Hairline />

        <div
          className="v2-mono-label"
          style={{
            display: "grid",
            gridTemplateColumns: ROW_GRID,
            gap: "var(--v2-s-2)",
            padding: "0 var(--v2-s-2)",
            color: "var(--v2-ink-3)",
          }}
        >
          <span style={{ textAlign: "center" }}>#</span>
          <span
            style={{ textAlign: "center", color: "var(--v2-c-weight)" }}
          >
            {locale === "ko" ? "중량 kg" : "WT kg"}
          </span>
          <span style={{ textAlign: "center", color: "var(--v2-c-reps)" }}>
            {locale === "ko" ? "반복" : "REPS"}
          </span>
          <span style={{ textAlign: "center", color: "var(--v2-c-warning)" }}>
            RPE
          </span>
          <span style={{ textAlign: "center" }}>✓</span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-1)",
          }}
        >
          {Array.from({ length: totalSets }).map((_, i) => (
            <WorkoutSetRow
              key={i}
              exercise={exercise}
              setIndex={i}
              onExerciseAction={dispatchAction}
            />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "nowrap",
            gap: "var(--v2-s-1)",
            justifyContent: "space-between",
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
        >
          <ChipButton onClick={toggleMemo} icon="edit_note">
            {locale === "ko" ? "메모" : "Memo"}
          </ChipButton>
          <ChipButton onClick={handleAddSet} icon="add">
            {locale === "ko" ? "세트 추가" : "Add set"}
          </ChipButton>
          <ChipButton
            onClick={handleRemoveLastSet}
            icon="remove"
            disabled={!canRemoveSet}
          >
            {locale === "ko" ? "세트 삭제" : "Remove set"}
          </ChipButton>
          <ChipButton onClick={handleDelete} icon="delete" tone="danger">
            {locale === "ko" ? "운동 삭제" : "Delete"}
          </ChipButton>
        </div>

        {memoVisible && (
          <V2Textarea
            size="sm"
            value={memoValue}
            onChange={(e) => handleMemoChange(e.target.value)}
            placeholder={locale === "ko" ? "메모" : "Memo"}
            rows={2}
            style={{ resize: "none" }}
          />
        )}
      </article>
    </V2Card>
  );
}

function ChipButton({
  onClick,
  icon,
  children,
  disabled,
  tone,
  size = "md",
}: {
  onClick: () => void;
  icon?: string;
  children: ReactNode;
  disabled?: boolean;
  tone?: "danger" | "accent";
  size?: "sm" | "md";
}) {
  const compact = size === "sm";
  const fg =
    tone === "danger"
      ? "var(--v2-c-danger)"
      : tone === "accent"
        ? "var(--v2-accent-ink)"
        : "var(--v2-ink)";
  const bg =
    tone === "accent"
      ? "var(--v2-accent-weak)"
      : "var(--v2-paper-2)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="v2-font-display"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--v2-s-1)",
        padding: "var(--v2-s-1) var(--v2-s-2)",
        borderRadius: compact ? "var(--v2-r-0)" : "var(--v2-r-2)",
        background: bg,
        color: disabled ? "var(--v2-ink-3)" : fg,
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        minHeight: compact ? undefined : "var(--v2-s-8)",
        fontWeight: compact ? 400 : 700,
      }}
    >
      {icon && (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: compact ? "var(--v2-t-14)" : "var(--v2-t-16)" }}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <span className="v2-mono-label">{children}</span>
    </button>
  );
}
