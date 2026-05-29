"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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

  const repsRaw = useMemo(() => {
    if (exercise.source === "PROGRAM") {
      const inputs = programEntryState[exercise.id]?.repsInputs ?? [];
      return (inputs[setIndex] ?? "").trim();
    }
    const r = exercise.set.repsPerSet[setIndex] ?? 0;
    return r > 0 ? String(r) : "";
  }, [exercise, programEntryState, setIndex]);

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
  const hasReps = !!repsRaw && Number.isFinite(repsNum) && repsNum > 0;
  const plannedReps =
    exercise.source === "PROGRAM"
      ? (exercise.set.repsPerSet[setIndex] ?? 0)
      : 0;
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
        value: Math.max(0, Math.min(100, Math.round(num))),
      });
    },
    [onExerciseAction, setIndex],
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

type CellInputProps = {
  value: string;
  placeholder: string;
  color: string;
  ariaLabel: string;
  onChange: (raw: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  allowDecimal?: boolean;
};

const CellInput = forwardRef<HTMLInputElement, CellInputProps>(
  function CellInput(
    {
      value,
      placeholder,
      color,
      ariaLabel,
      onChange,
      onKeyDown,
      allowDecimal,
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    // 입력 중에는 사용자가 친 raw 문자열(draft)을 그대로 표시한다.
    // store의 weightKg는 매 입력마다 최소 플레이트 단위로 스냅되는데(예: 8 → 7.5),
    // 그 스냅값을 controlled value로 되돌려 쓰면 iOS Safari에서 커서가 끝으로 튀고
    // "8" 같은 중간 입력이 즉시 7.5로 바뀌어 백스페이스가 막힌다.
    // focus 동안에는 draft를 보여주고, blur 시 null로 비워 정규화된 store 값으로 복귀한다.
    const [draft, setDraft] = useState<string | null>(null);
    const displayValue = draft ?? value;
    return (
      <input
        ref={ref}
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        pattern={allowDecimal ? "[0-9]*[.]?[0-9]*" : "[0-9]*"}
        enterKeyHint="next"
        autoComplete="off"
        value={displayValue}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          onChange(raw);
        }}
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          setFocused(true);
          setDraft(e.currentTarget.value);
          try {
            e.currentTarget.select();
          } catch {
            // ignore
          }
        }}
        onBlur={() => {
          setFocused(false);
          setDraft(null);
        }}
        className="v2-num-sm"
        style={{
          width: "100%",
          minWidth: 0,
          minHeight: "var(--v2-touch)",
          padding: "var(--v2-s-1) var(--v2-s-2)",
          borderRadius: "var(--v2-r-1)",
          background: "var(--v2-paper-2)",
          color,
          textAlign: "center",
          border: "none",
          outline: "none",
          boxShadow: focused
            ? "inset 0 0 0 2px var(--v2-accent)"
            : undefined,
        }}
      />
    );
  },
);
