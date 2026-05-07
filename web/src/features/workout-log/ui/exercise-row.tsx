"use client";

import { memo, useCallback } from "react";
import { useLocale } from "@/components/locale-provider";
import { AppPlusMinusIcon, AppTextarea } from "@/components/ui/form-controls";
import type {
  ExerciseRowAction,
  InlinePickerRequest,
} from "@/features/workout-log/model/editor-actions";
import {
  SwipeableSetRow,
  WorkoutRecordInlinePicker,
  formatCompactWeightValue,
} from "@/features/workout-log/ui/set-editor-controls";
import {
  areWorkoutExercisesEqual,
  areWorkoutProgramEntryStatesEqual,
} from "@/features/workout-log/ui/prop-equality";
import {
  computeExternalLoadFromTotalKg,
  formatKgValue,
  isBodyweightExerciseName,
} from "@/lib/bodyweight-load";
import {
  computeBodyweightTotalLoadKg,
  snapWeightToIncrementKg,
} from "@/lib/settings/workout-preferences";
import type { WorkoutExerciseViewModel, WorkoutProgramExerciseEntryState } from "@/entities/workout-record";

import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { makeExerciseCardAtom } from "../store/workout-log-atoms";

type ExerciseRowProps = {
  exerciseId: string;
  bodyweightKg: number | null;
  onAction: (exerciseId: string, action: ExerciseRowAction) => void;
  onOpenInlinePicker: (request: InlinePickerRequest) => void;
};

function areExerciseRowPropsEqual(
  previous: ExerciseRowProps,
  next: ExerciseRowProps,
) {
  return (
    previous.exerciseId === next.exerciseId &&
    previous.bodyweightKg === next.bodyweightKg &&
    previous.onAction === next.onAction &&
    previous.onOpenInlinePicker === next.onOpenInlinePicker
  );
}

function workoutExerciseBadgeMeta(
  badge: WorkoutExerciseViewModel["badge"],
  copy: ReturnType<typeof useLocale>["copy"],
) {
  if (badge === "AUTO") return { label: copy.workoutLog.badgePlanned, className: "label label-program label-sm" };
  if (badge === "CUSTOM") return { label: copy.workoutLog.badgeCustom, className: "label label-note label-sm" };
  if (badge === "ADDED") return { label: copy.workoutLog.badgeAdded, className: "label label-exercise label-sm" };
  return null;
}

function CheckIcon() {
  return (
    <span
      className="material-symbols-outlined"
      aria-hidden="true"
      style={{ fontSize: "1.1rem", fontVariationSettings: "'FILL' 0, 'wght' 600", lineHeight: 1 }}
    >
      check
    </span>
  );
}

function FailureIcon() {
  return (
    <span
      className="material-symbols-outlined"
      aria-hidden="true"
      style={{ fontSize: "1.1rem", fontVariationSettings: "'FILL' 0, 'wght' 600", lineHeight: 1 }}
    >
      close
    </span>
  );
}

type ExerciseSetRowProps = {
  exerciseId: string;
  exerciseName: string;
  index: number;
  setReps: number;
  rpeValue: number;
  resolvedRowWeightKg: number;
  minimumPlateIncrementKg: number;
  rowClass: string;
  isSetComplete: boolean;
  isFailure: boolean;
  deleteDisabled: boolean;
  locale: "ko" | "en";
  onAction: (exerciseId: string, action: ExerciseRowAction) => void;
  onOpenInlinePicker: (request: InlinePickerRequest) => void;
};

function areExerciseSetRowPropsEqual(
  previous: ExerciseSetRowProps,
  next: ExerciseSetRowProps,
) {
  return (
    previous.exerciseId === next.exerciseId &&
    previous.exerciseName === next.exerciseName &&
    previous.index === next.index &&
    previous.setReps === next.setReps &&
    previous.rpeValue === next.rpeValue &&
    previous.resolvedRowWeightKg === next.resolvedRowWeightKg &&
    previous.minimumPlateIncrementKg === next.minimumPlateIncrementKg &&
    previous.rowClass === next.rowClass &&
    previous.isSetComplete === next.isSetComplete &&
    previous.isFailure === next.isFailure &&
    previous.deleteDisabled === next.deleteDisabled &&
    previous.locale === next.locale &&
    previous.onAction === next.onAction &&
    previous.onOpenInlinePicker === next.onOpenInlinePicker
  );
}

const ExerciseSetRow = memo(function ExerciseSetRow({
  exerciseId,
  exerciseName,
  index,
  setReps,
  rpeValue,
  resolvedRowWeightKg,
  minimumPlateIncrementKg,
  rowClass,
  isSetComplete,
  isFailure,
  deleteDisabled,
  locale,
  onAction,
  onOpenInlinePicker,
}: ExerciseSetRowProps) {
  const formatWeightValue = useCallback(
    (value: number) => formatCompactWeightValue(value, minimumPlateIncrementKg),
    [minimumPlateIncrementKg],
  );
  const formatRepsValue = useCallback(
    (value: number) => String(Math.round(value)),
    [],
  );
  const formatRpeValue = useCallback((value: number) => {
    if (!Number.isFinite(value) || value <= 0) return "—";
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }, []);
  const handleWeightChange = useCallback(
    (value: number) =>
      onOpenInlinePicker({
        type: "CHANGE_WEIGHT",
        exerciseId,
        title: locale === "ko" ? `${exerciseName} 무게` : `${exerciseName} Weight`,
        value,
        min: 0,
        max: 1000,
        step: minimumPlateIncrementKg,
        formatValue: formatWeightValue,
      }),
    [
      exerciseId,
      exerciseName,
      formatWeightValue,
      locale,
      minimumPlateIncrementKg,
      onOpenInlinePicker,
    ],
  );
  const handleRepsChange = useCallback(
    (value: number) =>
      onOpenInlinePicker({
        type: "CHANGE_SET_REPS",
        exerciseId,
        setIndex: index,
        title:
          locale === "ko"
            ? `${exerciseName} ${index + 1}세트 횟수`
            : `${exerciseName} Set ${index + 1} Reps`,
        value,
        min: 0,
        max: 100,
        step: 1,
        formatValue: formatRepsValue,
      }),
    [exerciseId, exerciseName, formatRepsValue, index, locale, onOpenInlinePicker],
  );
  const handleRpeChange = useCallback(
    (value: number) =>
      onOpenInlinePicker({
        type: "CHANGE_SET_RPE",
        exerciseId,
        setIndex: index,
        title:
          locale === "ko"
            ? `${exerciseName} ${index + 1}세트 RPE`
            : `${exerciseName} Set ${index + 1} RPE`,
        value,
        min: 0,
        max: 10,
        step: 0.5,
        formatValue: formatRpeValue,
      }),
    [exerciseId, exerciseName, formatRpeValue, index, locale, onOpenInlinePicker],
  );

  return (
    <SwipeableSetRow
      deleteLabel={locale === "ko" ? "세트 삭제" : "Delete set"}
      disabled={deleteDisabled}
      onDelete={() => onAction(exerciseId, { type: "REMOVE_SET", index })}
    >
      <div role="listitem" className={rowClass}>
        <span className="set-row__number">{index + 1}</span>
        <WorkoutRecordInlinePicker
          label={locale === "ko" ? `${index + 1}세트 무게` : `Set ${index + 1} Weight`}
          value={resolvedRowWeightKg}
          formatValue={formatWeightValue}
          useLocalSheet={false}
          color="var(--text-metric-weight)"
          complete={isSetComplete}
          failed={isFailure}
          onChange={handleWeightChange}
        />
        <WorkoutRecordInlinePicker
          label={locale === "ko" ? `${index + 1}세트 횟수` : `Set ${index + 1} Reps`}
          value={setReps}
          useLocalSheet={false}
          complete={isSetComplete}
          failed={isFailure}
          formatValue={formatRepsValue}
          color="var(--text-metric-reps)"
          onChange={handleRepsChange}
        />
        <WorkoutRecordInlinePicker
          label={locale === "ko" ? `${index + 1}세트 RPE` : `Set ${index + 1} RPE`}
          value={rpeValue}
          useLocalSheet={false}
          complete={rpeValue > 0}
          failed={false}
          formatValue={formatRpeValue}
          color="var(--v2-c-warning)"
          onChange={handleRpeChange}
        />
        <div className="set-row__done">
          {isFailure ? <FailureIcon /> : isSetComplete ? <CheckIcon /> : null}
        </div>
      </div>
    </SwipeableSetRow>
  );
}, areExerciseSetRowPropsEqual);

export const ExerciseRow = memo(function ExerciseRow({
  exerciseId,
  bodyweightKg,
  onAction,
  onOpenInlinePicker,
}: ExerciseRowProps) {
  const card = useAtomValue(useMemo(() => makeExerciseCardAtom(exerciseId), [exerciseId]));
  const { copy, locale } = useLocale();

  if (!card) return null;

  const {
    exercise,
    minimumPlateIncrementKg,
    showMinimumPlateInfo,
    programEntryState,
    prevPerformance,
  } = card;
  const totalLoadKg = computeBodyweightTotalLoadKg(exercise.exerciseName, exercise.set.weightKg, bodyweightKg);
  const isBodyweightExercise = isBodyweightExerciseName(exercise.exerciseName);
  const badgeMeta = workoutExerciseBadgeMeta(exercise.badge, copy);
  const usesProgramPlaceholders = Boolean(programEntryState);
  const weightStepMeta = locale === "ko" ? `${formatKgValue(minimumPlateIncrementKg)} 단위` : `${formatKgValue(minimumPlateIncrementKg)} increments`;
  const plannedWeightKgPerSet = exercise.plannedSetMeta?.targetWeightKgPerSet ?? [];
  const firstPlannedWeightKg =
    plannedWeightKgPerSet.find((value: any) => typeof value === "number" && Number.isFinite(value) && value >= 0) ?? null;
  const resolvedFirstPlannedWeightKg =
    typeof firstPlannedWeightKg === "number"
      ? snapWeightToIncrementKg(
          computeExternalLoadFromTotalKg(
            exercise.exerciseName,
            firstPlannedWeightKg,
            bodyweightKg,
          ) ?? firstPlannedWeightKg,
          minimumPlateIncrementKg,
        )
      : null;
  const usesPlannedRowWeights =
    typeof resolvedFirstPlannedWeightKg === "number" &&
    Math.abs(exercise.set.weightKg - resolvedFirstPlannedWeightKg) < 0.01;

  const firstIncompleteIndex = exercise.set.repsPerSet.findIndex((setReps: number, i: number) => {
    const rawVal = programEntryState?.repsInputs[i]?.trim() ?? "";
    const actual = usesProgramPlaceholders ? Number(rawVal) : setReps;
    return !Number.isFinite(actual) || actual <= 0;
  });

  return (
    <article className="exercise-card" aria-label={locale === "ko" ? `운동종목 ${exercise.exerciseName}` : `Exercise ${exercise.exerciseName}`}>
      <div className="exercise-card__header">
        <div className="exercise-card__name-row">
          <strong className="exercise-card__name">{exercise.exerciseName}</strong>
          {badgeMeta ? (
            <span className={badgeMeta.className}>{badgeMeta.label}</span>
          ) : null}
        </div>
        <div className="exercise-card__header-actions">
          {prevPerformance ? (
            <span className="exercise-card__prev-ref" title={locale === "ko" ? "이전 최고 기록" : "Previous best"}>
              <span className="material-symbols-outlined" style={{ fontSize: 12, fontVariationSettings: "'wght' 400", lineHeight: 1 }}>history</span>
              {prevPerformance}
            </span>
          ) : null}
          {exercise.badge !== "AUTO" ? (
            <button
              type="button"
              className="btn btn-icon btn-icon-danger"
              aria-label={locale === "ko" ? "운동 삭제" : "Remove exercise"}
              title={locale === "ko" ? "운동 삭제" : "Remove exercise"}
              onClick={() => onAction(exerciseId, { type: "DELETE" })}
            >
              <AppPlusMinusIcon kind="minus" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="set-table">
        <div className="set-table__header" aria-hidden="true">
          <span className="set-table__h-set">Set</span>
          <span className="set-table__h-weight">Weight</span>
          <span className="set-table__h-reps">Reps</span>
          <span className="set-table__h-rpe">RPE</span>
          <span className="set-table__h-done">✓</span>
        </div>

        <div role="list" aria-label={locale === "ko" ? `${exercise.exerciseName} 세트 편집` : `Edit sets for ${exercise.exerciseName}`}>
          {exercise.set.repsPerSet.map((setReps: number, index: number) => {
            const rawSetValue = programEntryState?.repsInputs[index]?.trim() ?? "";
            const parsedSetValue = Number(rawSetValue);
            const actualRepsValue = usesProgramPlaceholders ? parsedSetValue : setReps;
            const hasReps = Number.isFinite(actualRepsValue) && actualRepsValue > 0;
            const isAutoExercise = exercise.badge === "AUTO";
            const plannedReps: number | undefined = isAutoExercise
              ? (programEntryState?.plannedRepsPerSet?.[index] ?? undefined)
              : undefined;

            const isFailure = isAutoExercise && hasReps && typeof plannedReps === "number" && plannedReps > 0 && actualRepsValue < plannedReps;
            const isSetComplete = isAutoExercise
              ? hasReps && (typeof plannedReps !== "number" || plannedReps <= 0 || actualRepsValue >= plannedReps)
              : hasReps;
            const isActive = !isSetComplete && !isFailure && index === firstIncompleteIndex;
            const isPending = !isSetComplete && !isFailure && index !== firstIncompleteIndex;
            const rawRpeValue = exercise.set.rpePerSet?.[index] ?? 0;
            const rpeValue =
              Number.isFinite(rawRpeValue) && rawRpeValue > 0
                ? Math.min(10, Math.max(0, Math.round(rawRpeValue * 2) / 2))
                : 0;

            const rowClass = [
              "set-row",
              isFailure ? "set-row--failure" : "",
              isSetComplete ? "set-row--complete" : "",
              isActive ? "set-row--active" : "",
              isPending ? "set-row--pending" : "",
            ].filter(Boolean).join(" ");

            const plannedWeightKg = plannedWeightKgPerSet[index];
            const resolvedPlannedWeightKg =
              typeof plannedWeightKg === "number" && Number.isFinite(plannedWeightKg) && plannedWeightKg >= 0
                ? snapWeightToIncrementKg(
                    computeExternalLoadFromTotalKg(
                      exercise.exerciseName,
                      plannedWeightKg,
                      bodyweightKg,
                    ) ?? plannedWeightKg,
                    minimumPlateIncrementKg,
                  )
                : null;
            const resolvedRowWeightKg =
              usesPlannedRowWeights &&
              typeof resolvedPlannedWeightKg === "number" &&
              Number.isFinite(resolvedPlannedWeightKg) &&
              resolvedPlannedWeightKg >= 0
                ? resolvedPlannedWeightKg
                : exercise.set.weightKg;

            return (
              <ExerciseSetRow
                key={`${exercise.id}-set-${index}`}
                exerciseId={exerciseId}
                exerciseName={exercise.exerciseName}
                index={index}
                setReps={setReps}
                rpeValue={rpeValue}
                resolvedRowWeightKg={resolvedRowWeightKg}
                minimumPlateIncrementKg={minimumPlateIncrementKg}
                rowClass={rowClass}
                isSetComplete={isSetComplete}
                isFailure={isFailure}
                deleteDisabled={
                  usesProgramPlaceholders
                    ? index <
                      (programEntryState?.plannedRepsPerSet?.length ??
                        exercise.set.repsPerSet.length)
                    : exercise.set.repsPerSet.length <= 1
                }
                locale={locale}
                onAction={onAction}
                onOpenInlinePicker={onOpenInlinePicker}
              />
            );
          })}
        </div>
      </div>

      <button
        type="button"
        className="set-add-btn"
        onClick={() => onAction(exerciseId, { type: "ADD_SET" })}
      >
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, fontVariationSettings: "'wght' 400" }}>add</span>
        {copy.workoutLog.addSet}
      </button>

      {(showMinimumPlateInfo || (isBodyweightExercise && bodyweightKg)) ? (
        <div className="set-hint">
          {showMinimumPlateInfo ? (
            <span className="set-hint__item">
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16, fontVariationSettings: "'wght' 400", lineHeight: 1 }}>info</span>
              {locale === "ko" ? `${weightStepMeta}로 입력됩니다.` : `Entered in ${weightStepMeta}.`}
            </span>
          ) : null}
          {isBodyweightExercise && bodyweightKg ? (
            <span className="set-hint__item">
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16, fontVariationSettings: "'wght' 400", lineHeight: 1 }}>info</span>
              {locale === "ko" ? `총하중 기준: ${formatKgValue(totalLoadKg)}` : `Total load basis: ${formatKgValue(totalLoadKg)}`}
            </span>
          ) : null}
        </div>
      ) : null}

      <div style={{ padding: "0 var(--space-md) var(--space-md)" }}>
        <label>
          <AppTextarea
            variant="workout"
            value={usesProgramPlaceholders ? (programEntryState?.memoInput ?? "") : exercise.note.memo}
            onChange={(event) => onAction(exerciseId, { type: "CHANGE_MEMO", value: event.target.value })}
            placeholder={usesProgramPlaceholders ? programEntryState?.memoPlaceholder || (locale === "ko" ? "메모" : "Memo") : (locale === "ko" ? "메모" : "Memo")}
            style={{
              border: "none",
              borderRadius: "14px",
              background: "var(--color-surface-container)",
              fontSize: "13px",
              minHeight: "48px",
            }}
          />
        </label>
      </div>
    </article>
  );
}, areExerciseRowPropsEqual);
