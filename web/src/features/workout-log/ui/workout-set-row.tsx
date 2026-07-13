"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
} from "react";
import { useAtomValue } from "jotai";
import { useLocale } from "@/components/locale-provider";
import type { ExerciseRowAction } from "@/features/workout-log/model/editor-actions";
import { programEntryStateAtom } from "@/features/workout-log/store/workout-log-atoms";
import {
  useSetRowFocusChain,
  type SetRowField,
} from "@/features/workout-log/model/use-set-row-focus-chain";
import type { WorkoutExerciseViewModel } from "@/lib/workout-record/model";
import { resolveWorkoutSetRepsEntry } from "@/lib/workout-record/ref5-outcome";
import { CellInput } from "./cell-input";

type Props = {
  exercise: WorkoutExerciseViewModel;
  setIndex: number;
  onExerciseAction: (action: ExerciseRowAction) => void;
};

const ROW_GRID =
  "var(--v2-s-6) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) var(--v2-s-6)";

export function WorkoutSetRow({
  exercise,
  setIndex,
  onExerciseAction,
}: Props) {
  const { locale } = useLocale();
  const focusChain = useSetRowFocusChain();
  const programEntryState = useAtomValue(programEntryStateAtom);

  const weightRef = useRef<HTMLInputElement>(null);
  const repsRef = useRef<HTMLInputElement>(null);
  const rpeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    focusChain.registerCell(exercise.id, setIndex, "weight", weightRef.current);
    focusChain.registerCell(exercise.id, setIndex, "reps", repsRef.current);
    focusChain.registerCell(exercise.id, setIndex, "rpe", rpeRef.current);
    return () => {
      focusChain.unregisterCell(exercise.id, setIndex, "weight");
      focusChain.unregisterCell(exercise.id, setIndex, "reps");
      focusChain.unregisterCell(exercise.id, setIndex, "rpe");
    };
  }, [focusChain, exercise.id, setIndex]);

  const { plannedReps, repsRaw } = useMemo(
    () =>
      resolveWorkoutSetRepsEntry(
        exercise,
        setIndex,
        programEntryState[exercise.id]?.repsInputs[setIndex] ?? "",
      ),
    [exercise, programEntryState, setIndex],
  );

  const weightValue = useMemo(() => {
    const w = exercise.set.weightKgPerSet?.[setIndex] ?? 0;
    return w > 0 ? String(w) : "";
  }, [exercise.set.weightKgPerSet, setIndex]);

  const rpeRaw = useMemo(() => {
    const r = exercise.set.rpePerSet?.[setIndex] ?? 0;
    if (!Number.isFinite(r) || r <= 0) return "";
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }, [exercise.set.rpePerSet, setIndex]);

  const repsNum = Number(repsRaw);
  const hasReps = exercise.ref5
    ? repsRaw !== "" && Number.isFinite(repsNum) && repsNum >= 0
    : !!repsRaw && Number.isFinite(repsNum) && repsNum > 0;
  const isFailure = hasReps && plannedReps > 0 && repsNum < plannedReps;
  const isComplete = hasReps && (!plannedReps || repsNum >= plannedReps);

  const handleWeightChange = useCallback(
    (raw: string) => {
      const cleaned = raw.replace(/[^0-9.]/g, "");
      if (cleaned === "" || cleaned === ".") {
        onExerciseAction({ type: "CHANGE_WEIGHT", setIndex, value: 0 });
        return;
      }
      const num = Number(cleaned);
      if (!Number.isFinite(num)) return;
      onExerciseAction({
        type: "CHANGE_WEIGHT",
        setIndex,
        value: Math.max(0, Math.min(9999, num)),
      });
    },
    [onExerciseAction, setIndex],
  );

  const handleRepsChange = useCallback(
    (raw: string) => {
      const cleaned = raw.replace(/[^0-9]/g, "");
      const num = cleaned === "" ? 0 : Number(cleaned);
      if (!Number.isFinite(num)) return;
      onExerciseAction({
        type: "CHANGE_SET_REPS",
        setIndex,
        value: Math.max(
          0,
          Math.min(exercise.ref5 && plannedReps >= 0 ? plannedReps : 100, Math.round(num)),
        ),
      });
    },
    [exercise.ref5, onExerciseAction, plannedReps, setIndex],
  );

  const handleRpeChange = useCallback(
    (raw: string) => {
      const cleaned = raw.replace(/[^0-9.]/g, "");
      if (cleaned === "" || cleaned === ".") {
        onExerciseAction({ type: "CHANGE_SET_RPE", setIndex, value: 0 });
        return;
      }
      const num = Number(cleaned);
      if (!Number.isFinite(num)) return;
      const clamped = Math.max(0, Math.min(10, num));
      const halfRounded = Math.round(clamped * 2) / 2;
      onExerciseAction({
        type: "CHANGE_SET_RPE",
        setIndex,
        value: halfRounded,
      });
    },
    [onExerciseAction, setIndex],
  );

  const onKeyDown = useCallback(
    (field: SetRowField) => (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const advanced = focusChain.advanceFrom({
          exerciseId: exercise.id,
          setIndex,
          field,
        });
        if (!advanced) {
          e.currentTarget.blur();
        }
      }
    },
    [focusChain, exercise.id, setIndex],
  );

  const rowBackground = isComplete
    ? "color-mix(in srgb, var(--v2-c-reps) 10%, var(--v2-paper))"
    : isFailure
      ? "color-mix(in srgb, var(--v2-c-danger) 12%, var(--v2-paper))"
      : "var(--v2-paper)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: ROW_GRID,
        gap: "var(--v2-s-2)",
        alignItems: "center",
        padding: "var(--v2-s-1) var(--v2-s-2)",
        borderRadius: "var(--v2-r-1)",
        background: rowBackground,
        minHeight: "var(--v2-touch)",
      }}
    >
      <span
        className="v2-mono-label"
        style={{
          color: "var(--v2-ink-3)",
          textAlign: "center",
        }}
      >
        {setIndex + 1}
      </span>
      <CellInput
        ref={weightRef}
        value={weightValue}
        placeholder="—"
        color="var(--v2-c-weight)"
        ariaLabel={
          locale === "ko"
            ? `세트 ${setIndex + 1} 중량`
            : `Set ${setIndex + 1} weight`
        }
        onChange={handleWeightChange}
        onKeyDown={onKeyDown("weight")}
        allowDecimal
        readOnly={Boolean(exercise.ref5)}
      />
      <CellInput
        ref={repsRef}
        value={repsRaw}
        placeholder={plannedReps > 0 ? String(plannedReps) : "—"}
        color="var(--v2-c-reps)"
        ariaLabel={
          locale === "ko"
            ? `세트 ${setIndex + 1} 반복`
            : `Set ${setIndex + 1} reps`
        }
        onChange={handleRepsChange}
        onKeyDown={onKeyDown("reps")}
      />
      <CellInput
        ref={rpeRef}
        value={rpeRaw}
        placeholder="—"
        color="var(--v2-c-warning)"
        ariaLabel={`Set ${setIndex + 1} RPE`}
        onChange={handleRpeChange}
        onKeyDown={onKeyDown("rpe")}
        allowDecimal
        readOnly={Boolean(exercise.ref5)}
      />
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: isFailure
            ? "var(--v2-c-danger)"
            : isComplete
              ? "var(--v2-c-success)"
              : "var(--v2-ink-3)",
        }}
      >
        {isFailure ? (
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "var(--v2-t-h2)" }}
          >
            close
          </span>
        ) : isComplete ? (
          <span
            className="material-symbols-outlined"
            style={{ fontSize: "var(--v2-t-h2)" }}
          >
            check
          </span>
        ) : (
          <span
            style={{
              width: "var(--v2-s-2)",
              height: "var(--v2-s-2)",
              borderRadius: "var(--v2-r-pill)",
              background: "var(--v2-paper-3)",
            }}
          />
        )}
      </span>
    </div>
  );
}
