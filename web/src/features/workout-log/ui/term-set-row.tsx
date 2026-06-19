"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
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
import { CellInput } from "./cell-input";

type Props = {
  exercise: WorkoutExerciseViewModel;
  setIndex: number;
  onExerciseAction: (action: ExerciseRowAction) => void;
};

// terminal(ironlog) 세트행 — paper WorkoutSetRow의 model/dispatch/focus-chain을
// 그대로 공유하고 표현만 TUI로 분기한다. 입력 셀은 공유 CellInput을 재사용해
// iOS draft/snap/blur·Enter-advance·44px를 보존하고(focus ring=amber), 상태는
// 색 + 글리프 이중 인코딩(✗ fail / ✓ done / ▮ active / · ghost, redesign-target §3).
// 파생값·핸들러는 WorkoutSetRow와 동일 — 두 뷰가 같은 atom/action을 공유한다.
const ROW_GRID =
  "var(--v2-s-6) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) var(--v2-s-6)";

export function TermSetRow({ exercise, setIndex, onExerciseAction }: Props) {
  const { locale } = useLocale();
  const focusChain = useSetRowFocusChain();
  const programEntryState = useAtomValue(programEntryStateAtom);

  const weightRef = useRef<HTMLInputElement>(null);
  const repsRef = useRef<HTMLInputElement>(null);
  const rpeRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // 동일 registerCell 키 + 동일 SetRowFocusChainProvider 안 mount → paper와 focus chain 공유.
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

  // 현재 입력 중인 행 = active. focus가 행 밖으로 나갈 때만 해제(셀 간 이동 시 깜빡임 방지).
  const [rowActive, setRowActive] = useState(false);
  const handleRowBlur = useCallback((e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next instanceof Node && rowRef.current?.contains(next)) return;
    setRowActive(false);
  }, []);

  // 상태 글리프: 색 + 글리프 이중 인코딩. active(미입력 + 포커스)는 amber ▮ 커서로 표시.
  const status: "fail" | "done" | "active" | "ghost" = isFailure
    ? "fail"
    : isComplete
      ? "done"
      : rowActive
        ? "active"
        : "ghost";
  const statusGlyph = { fail: "✗", done: "✓", active: "▮", ghost: "·" }[status];
  const statusColor = {
    fail: "var(--term-red)",
    done: "var(--term-green)",
    active: "var(--term-amber)",
    ghost: "var(--term-ghost)",
  }[status];

  return (
    <div
      ref={rowRef}
      onFocusCapture={() => setRowActive(true)}
      onBlurCapture={handleRowBlur}
      style={{
        display: "grid",
        gridTemplateColumns: ROW_GRID,
        gap: "var(--v2-s-2)",
        alignItems: "center",
        padding: "var(--v2-s-1) var(--v2-s-2)",
        minHeight: "var(--v2-touch)",
        // active 행 = +1 표면 + amber 좌바(boxShadow inset, border 금지). No-Line 준수.
        background: rowActive ? "var(--term-sel)" : "transparent",
        boxShadow: rowActive
          ? "inset var(--v2-s-1) 0 0 var(--term-amber)"
          : undefined,
      }}
    >
      <span
        aria-hidden
        style={{
          color: rowActive ? "var(--term-amber)" : "var(--term-dim)",
          textAlign: "center",
        }}
      >
        {setIndex + 1}
      </span>
      <CellInput
        ref={weightRef}
        value={weightValue}
        placeholder="—"
        color="var(--term-cyan)"
        ariaLabel={
          locale === "ko"
            ? `세트 ${setIndex + 1} 중량`
            : `Set ${setIndex + 1} weight`
        }
        onChange={handleWeightChange}
        onKeyDown={onKeyDown("weight")}
        allowDecimal
        bg="transparent"
        focusRing="var(--term-amber)"
      />
      <CellInput
        ref={repsRef}
        value={repsRaw}
        placeholder={plannedReps > 0 ? String(plannedReps) : "—"}
        color="var(--term-cyan)"
        ariaLabel={
          locale === "ko"
            ? `세트 ${setIndex + 1} 반복`
            : `Set ${setIndex + 1} reps`
        }
        onChange={handleRepsChange}
        onKeyDown={onKeyDown("reps")}
        bg="transparent"
        focusRing="var(--term-amber)"
      />
      <CellInput
        ref={rpeRef}
        value={rpeRaw}
        placeholder="—"
        color="var(--term-cyan)"
        ariaLabel={`Set ${setIndex + 1} RPE`}
        onChange={handleRpeChange}
        onKeyDown={onKeyDown("rpe")}
        allowDecimal
        bg="transparent"
        focusRing="var(--term-amber)"
      />
      <span
        aria-hidden
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: statusColor,
        }}
      >
        {statusGlyph}
      </span>
    </div>
  );
}
