"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
  PerformedHistoryInline,
  PrescriptionInline,
} from "@/lib/workout-notation";
import {
  makeExerciseCardAtom,
  recentLogItemsAtom,
  workoutPreferencesAtom,
} from "@/features/workout-log/store/workout-log-atoms";
import {
  isBodyweightExerciseName,
  resolveLoggedTotalLoadKg,
} from "@workout/core/bodyweight-load";
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

// texas 주간(v2) 요일 역할 라벨. 처방이 흘린 exercise.texasRole을 배지로 표시한다.
const TEXAS_ROLE_LABEL: Record<string, { ko: string; en: string }> = {
  volume: { ko: "볼륨일", en: "Volume" },
  recovery: { ko: "회복일", en: "Recovery" },
  intensity: { ko: "강도일", en: "Intensity" },
};

export function WorkoutExerciseCard({ exerciseId, onExerciseAction }: Props) {
  const { locale } = useLocale();
  const exerciseCardAtom = useMemo(
    () => makeExerciseCardAtom(exerciseId),
    [exerciseId],
  );
  const exerciseCard = useAtomValue(exerciseCardAtom);
  const recentLogItems = useAtomValue(recentLogItemsAtom);
  const workoutPreferences = useAtomValue(workoutPreferencesAtom);
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
    sets: { weightKg: number; reps: number; isAmrap: boolean }[];
  } | null = null;
  if (targetName) {
    for (const log of recentLogItems) {
      const matched = log.sets.filter(
        (s) => s.exerciseName.trim().toLowerCase() === targetName,
      );
      const usableSets = matched
        .map((s) => ({
          // 맨몸 운동은 저장된 추가중량 대신 총부하(체중+추가)로 환산해 표시한다.
          weightKg:
            resolveLoggedTotalLoadKg({
              exerciseName: exercise.exerciseName,
              weightKg: s.weightKg,
              meta: s.meta as Record<string, unknown> | null | undefined,
            }) ??
            s.weightKg ??
            0,
          reps: s.reps ?? 0,
          isAmrap: (s.meta as { amrap?: unknown })?.amrap === true,
        }))
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
  const planUniform = allSame && firstReps > 0;
  const firstPercent = exercise.plannedSetMeta?.percentPerSet?.[0];
  const weightPerSet = exercise.set.weightKgPerSet ?? [];
  const firstWeight = weightPerSet[0] ?? 0;
  // 무게가 세트마다 다르면(예: 5/3/1 램핑) 처방 칩에 단일 무게를 보여주지 않는다.
  const weightUniform =
    weightPerSet.length > 0 && weightPerSet.every((w) => w === firstWeight);

  // 처방 강도 표기. 맨몸 운동(풀업/친업 등)은 권장 총부하(TM×%)를 총무게 기준으로
  // 보여주고 추가중량(총무게-체중)을 병기한다. 그 외에는 단일 무게 또는 percent.
  const isBodyweight = isBodyweightExerciseName(exercise.exerciseName);
  const bodyweightKg = workoutPreferences.bodyweightKg;
  let presWeightKg: number | undefined;
  let presWeightSuffix: string | undefined;
  let presPercent: number | undefined;
  if (
    isBodyweight &&
    typeof recommendedWeightKg === "number" &&
    recommendedWeightKg > 0 &&
    typeof bodyweightKg === "number" &&
    bodyweightKg > 0
  ) {
    // 권장 총부하(TM×%)에서 추가중량 = max(0, 총부하 - 체중).
    // 총부하가 체중보다 가벼우면(밴드 보조 영역, 추후 과제) 추가중량을 0으로 보고
    // 체중만 표기한다. 실제 권장값 적용(APPLY_TARGET_WEIGHTS)도 음수 추가중량을
    // 0으로 클램프하므로, 유효 총무게 = 체중 + 추가중량으로 환산해 표기한다.
    const added = Math.max(
      0,
      Math.round((recommendedWeightKg - bodyweightKg) * 10) / 10,
    );
    presWeightKg = Math.round((bodyweightKg + added) * 10) / 10;
    presWeightSuffix =
      added > 0 ? `(+${added})` : locale === "ko" ? "(체중)" : "(BW)";
  } else if (weightUniform && firstWeight > 0) {
    presWeightKg = firstWeight;
  } else if (typeof firstPercent === "number" && firstPercent > 0) {
    // percentPerSet은 0-1 비율로 저장된다(0.7 = 70%). 표기 시 100을 곱한다.
    presPercent = Math.round(firstPercent * 100);
  }
  const planAmrapPerSet = exercise.plannedSetMeta?.amrapPerSet;
  const lastSetAmrap = planAmrapPerSet?.at(-1) === true;
  const planRpePerSet = exercise.plannedSetMeta?.rpePerSet;
  const firstPlanRpe = planRpePerSet?.[0];
  const planRpeUniform =
    typeof firstPlanRpe === "number" &&
    firstPlanRpe > 0 &&
    planRpePerSet?.every((r) => r === firstPlanRpe) === true;

  const memoValue =
    exercise.source === "PROGRAM"
      ? (exerciseCard.programEntryState?.memoInput ?? "")
      : (exercise.note?.memo ?? "");

  const memoVisible =
    memoVisibleManual ?? !!(memoValue && memoValue.trim().length > 0);

  const handleApplyRecommendedWeight = () => {
    if (recommendedWeightKg == null) return;
    dispatchAction({ type: "APPLY_TARGET_WEIGHTS" });
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
              alignItems: "center",
              gap: "var(--v2-s-2)",
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
            {/* gzclp 정석(v2): 슬롯 계층(T1/T2/T3)과 현재 강등 단계. stage>0이면 무게를 유지한 채
                rep 스킴이 하향(5×3→6×2→10×1)됐음을 알려, 유저가 세트 변화를 납득하게 한다. */}
            {exercise.tier ? (
              <V2Chip tone="neutral">{exercise.tier}</V2Chip>
            ) : null}
            {typeof exercise.stage === "number" && exercise.stage > 0 ? (
              <V2Chip tone="warning" icon="trending_down">
                {locale === "ko" ? `강등 ${exercise.stage}` : `Stage ${exercise.stage}`}
              </V2Chip>
            ) : null}
            {/* texas 주간(v2): 요일 역할 배지. 강도일은 PR 시도일이라 강조(accent), 볼륨·회복일은 neutral. */}
            {exercise.texasRole && TEXAS_ROLE_LABEL[exercise.texasRole] ? (
              <V2Chip tone={exercise.texasRole === "intensity" ? "accent" : "neutral"}>
                {TEXAS_ROLE_LABEL[exercise.texasRole][locale]}
              </V2Chip>
            ) : null}
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

        {/* 처방 + 권장 무게 적용. 무게·횟수는 처방에만 표시하고 버튼은 액션 라벨로
            축약해 중복을 없앤다. 좁은 화면에서는 버튼이 다음 줄로 wrap되어 잘리지 않는다. */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--v2-s-2)",
            minWidth: 0,
          }}
        >
          {planUniform ? (
            <PrescriptionInline
              sets={totalSets}
              reps={firstReps}
              weightKg={presWeightKg}
              weightSuffix={presWeightSuffix}
              percent={presPercent}
              rpe={planRpeUniform ? firstPlanRpe : undefined}
              lastSetAmrap={lastSetAmrap}
            />
          ) : (
            <span
              className="v2-mono-label"
              style={{ color: "var(--v2-ink-3)" }}
            >
              {totalSets} {setsLabel}
            </span>
          )}
          {recommendedWeightKg != null && (
            <ChipButton
              onClick={handleApplyRecommendedWeight}
              icon="restart_alt"
              tone="accent"
              size="sm"
            >
              {locale === "ko" ? "권장값" : "Target"}
            </ChipButton>
          )}
        </div>

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
            <PerformedHistoryInline
              sets={previousSession.sets}
              load={{
                exerciseName: exercise.exerciseName,
                bodyweightKg,
                locale,
              }}
              chipStyle={{
                padding: "var(--v2-s-1) var(--v2-s-2)",
                borderRadius: "var(--v2-r-0)",
                background: "var(--v2-paper-2)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
              compactWrapperStyle={{ marginRight: "auto" }}
              containerStyle={{ flex: 1, minWidth: 0 }}
            />
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
          }}
        >
          <ChipButton
            onClick={toggleMemo}
            icon="edit_note"
            style={{ flex: 1, justifyContent: "center", minWidth: 0 }}
          >
            {locale === "ko" ? "메모" : "Memo"}
          </ChipButton>
          <ChipButton
            onClick={handleAddSet}
            icon="add"
            style={{ flex: 1, justifyContent: "center", minWidth: 0 }}
          >
            {locale === "ko" ? "세트 추가" : "Add set"}
          </ChipButton>
          <ChipButton
            onClick={handleRemoveLastSet}
            icon="remove"
            disabled={!canRemoveSet}
            style={{ flex: 1, justifyContent: "center", minWidth: 0 }}
          >
            {locale === "ko" ? "세트 삭제" : "Remove set"}
          </ChipButton>
          {!isProgramAuto && (
            <ChipButton
              onClick={handleDelete}
              icon="delete"
              tone="danger"
              style={{ flex: 1, justifyContent: "center", minWidth: 0 }}
            >
              {locale === "ko" ? "운동 삭제" : "Delete"}
            </ChipButton>
          )}
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
  style,
}: {
  onClick: () => void;
  icon?: string;
  children: ReactNode;
  disabled?: boolean;
  tone?: "danger" | "accent";
  size?: "sm" | "md";
  style?: CSSProperties;
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
        ...style,
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
