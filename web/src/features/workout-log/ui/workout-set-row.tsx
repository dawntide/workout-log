"use client";

import {
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
import { resolveWorkoutSetRepsEntry } from "@/lib/workout-record/ref5-outcome";
import type { WorkoutSetType } from "@workout/core/workout-set-type";
import { CellInput } from "./cell-input";
import { SET_ROW_GRID } from "./set-row-grid";
import { workoutPreferencesAtom } from "@/features/workout-log/store/workout-log-atoms";
import {
  toDisplayIntensity,
  toStoredIntensity,
} from "@workout/core/settings/intensity";
import { SetTypeSheet } from "./set-type-sheet";

/**
 * 태그는 세트 번호 자리를 대신한다 — 열을 늘리지 않는 것이 중요하다. 5열 그리드가
 * 어긋나면 로깅 입력 동선(1탭 완료) 전체가 흔들린다.
 */
const SET_TYPE_GLYPH: Record<WorkoutSetType, string> = {
  WARMUP: "W",
  FAILURE: "F",
};

const SET_TYPE_COLOR: Record<WorkoutSetType, string> = {
  WARMUP: "var(--v2-c-warning)",
  FAILURE: "var(--v2-c-danger)",
};

const SET_TYPE_LABELS: Record<WorkoutSetType, { ko: string; en: string }> = {
  WARMUP: { ko: "웜업", en: "warm-up" },
  FAILURE: { ko: "실패", en: "failure" },
};

type Props = {
  exercise: WorkoutExerciseViewModel;
  setIndex: number;
  onExerciseAction: (action: ExerciseRowAction) => void;
  /**
   * 직전 세션 같은 세트 번호의 실제 반복 수. 처방이 없는 운동에서 완료 버튼이
   * 채워 넣을 값이다(Strong의 "Previous 탭 = 값 복사"와 동형).
   */
  previousReps?: number | null;
  /** 완료 탭 시 휴식 타이머를 시작한다. 값이 이미 있는 세트도 재시작한다. */
  onSetCompleted?: (setIndex: number) => void;
};

export function WorkoutSetRow({
  exercise,
  setIndex,
  onExerciseAction,
  previousReps,
  onSetCompleted,
}: Props) {
  const { locale, copy } = useLocale();
  const focusChain = useSetRowFocusChain();
  const programEntryState = useAtomValue(programEntryStateAtom);
  // 저장값은 언제나 RPE 스케일이다 — 이 설정은 입력·표시 방향만 바꾼다.
  const intensityMode = useAtomValue(workoutPreferencesAtom).intensityInput;
  const [setTypeSheetOpen, setSetTypeSheetOpen] = useState(false);

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

  const intensityRaw = useMemo(() => {
    const displayed = toDisplayIntensity(exercise.set.rpePerSet?.[setIndex], intensityMode);
    if (displayed === null) return "";
    return Number.isInteger(displayed) ? String(displayed) : displayed.toFixed(1);
  }, [exercise.set.rpePerSet, intensityMode, setIndex]);

  const setType = exercise.set.setTypePerSet?.[setIndex] ?? null;
  // REF5는 세트 수·구성이 처방과 정확히 일치해야 하고, 스펙 §3.2가 의도적 실패와
  // 추가 반복을 이미 금지한다 — 태그를 받으면 저장에서 버려지므로 열지 않는다.
  const canTagSetType = !exercise.ref5;

  const repsNum = Number(repsRaw);
  const hasReps = exercise.source === "PROGRAM" || exercise.ref5 || plannedReps > 0
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

  const handleIntensityChange = useCallback(
    (raw: string) => {
      const cleaned = raw.replace(/[^0-9.]/g, "");
      if (cleaned === "" || cleaned === ".") {
        // 화면 배열은 "값 없음"을 0으로 들고 있다(전송 경계에서 null로 번역된다).
        onExerciseAction({ type: "CHANGE_SET_RPE", setIndex, value: 0 });
        return;
      }
      const num = Number(cleaned);
      if (!Number.isFinite(num)) return;
      // 클램프·스냅·RIR 뒤집기가 전부 여기 한 함수에 있다 — 두 클라이언트가 공유한다.
      const stored = toStoredIntensity(num, intensityMode);
      onExerciseAction({ type: "CHANGE_SET_RPE", setIndex, value: stored ?? 0 });
    },
    [intensityMode, onExerciseAction, setIndex],
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

  // 완료 버튼이 빈 칸에 채워 넣을 값: 처방 → 직전 기록 순. 둘 다 없으면 채우지 않는다.
  const completionFillReps = useMemo(() => {
    if (plannedReps > 0) return plannedReps;
    if (typeof previousReps === "number" && Number.isFinite(previousReps) && previousReps > 0) {
      return Math.round(previousReps);
    }
    return null;
  }, [plannedReps, previousReps]);

  // 값이 이미 있으면 기록은 건드리지 않고 휴식만 (재)시작한다 — 탭으로 기록을 지우지
  // 않는 것이 원칙이고, 완료 취소는 반복 칸을 직접 비운다(계획서 §3.3).
  const canFillByTap = !hasReps && completionFillReps !== null;
  const canCompleteByTap = canFillByTap || hasReps;

  const handleCompleteTap = useCallback(() => {
    if (canFillByTap && completionFillReps !== null) {
      onExerciseAction({
        type: "CHANGE_SET_REPS",
        setIndex,
        value: completionFillReps,
      });
    } else if (!hasReps) {
      // 채울 값도 없고 기록도 없다 — 휴식만 시작한다.
    }
    onSetCompleted?.(setIndex);
  }, [canFillByTap, completionFillReps, hasReps, onExerciseAction, onSetCompleted, setIndex]);

  const completionLabel = isFailure
    ? locale === "ko"
      ? `${setIndex + 1}세트 미달`
      : `Set ${setIndex + 1} below target`
    : isComplete
      ? locale === "ko"
        ? `${setIndex + 1}세트 완료됨`
        : `Set ${setIndex + 1} completed`
      : canFillByTap
        ? locale === "ko"
          ? `${setIndex + 1}세트 완료 (${completionFillReps}회 기록)`
          : `Complete set ${setIndex + 1} with ${completionFillReps} reps`
        : locale === "ko"
          ? `${setIndex + 1}세트 미완료`
          : `Set ${setIndex + 1} not completed`;

  const setTypeName = setType ? SET_TYPE_LABELS[setType] : null;
  const setTypeButtonLabel = setTypeName
    ? locale === "ko"
      ? `${setIndex + 1}세트 타입: ${setTypeName.ko} — 바꾸기`
      : `Set ${setIndex + 1} type: ${setTypeName.en} — change`
    : locale === "ko"
      ? `${setIndex + 1}세트 타입 지정`
      : `Set ${setIndex + 1} type`;

  const rowBackground = isComplete
    ? "color-mix(in srgb, var(--v2-c-reps) 10%, var(--v2-paper))"
    : isFailure
      ? "color-mix(in srgb, var(--v2-c-danger) 12%, var(--v2-paper))"
      : "var(--v2-paper)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: SET_ROW_GRID,
        gap: "var(--v2-s-2)",
        alignItems: "center",
        padding: "var(--v2-s-1) var(--v2-s-2)",
        borderRadius: "var(--v2-r-1)",
        background: rowBackground,
        minHeight: "var(--v2-touch)",
      }}
    >
      {canTagSetType ? (
        <button
          type="button"
          className="v2-mono-label v2-tap-44"
          onClick={() => setSetTypeSheetOpen(true)}
          aria-label={setTypeButtonLabel}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            padding: 0,
            // No-Line Rule: 브라우저 기본 button 테두리(2px outset)를 명시적으로 지운다.
            border: "none",
            background: "transparent",
            appearance: "none",
            cursor: "pointer",
            font: "inherit",
            color: setType ? SET_TYPE_COLOR[setType] : "var(--v2-ink-3)",
          }}
        >
          {setType ? SET_TYPE_GLYPH[setType] : setIndex + 1}
        </button>
      ) : (
        <span
          className="v2-mono-label"
          style={{ color: "var(--v2-ink-3)", textAlign: "center" }}
        >
          {setIndex + 1}
        </span>
      )}
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
        value={intensityRaw}
        placeholder="—"
        color="var(--v2-c-warning)"
        ariaLabel={(intensityMode === "RIR"
          ? copy.workoutLog.intensity.rirCellLabel
          : copy.workoutLog.intensity.rpeCellLabel
        ).replace("{n}", String(setIndex + 1))}
        onChange={handleIntensityChange}
        onKeyDown={onKeyDown("rpe")}
        allowDecimal
        readOnly={Boolean(exercise.ref5)}
      />
      <button
        type="button"
        className="v2-tap-44"
        onClick={handleCompleteTap}
        aria-pressed={isComplete}
        aria-label={completionLabel}
        aria-disabled={!canCompleteByTap}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          padding: 0,
          // No-Line Rule: 브라우저 기본 button 테두리(2px outset)를 명시적으로 지운다.
          // appearance:none만으로는 남는다 — 실제로 렌더에서 확인했다.
          border: "none",
          background: "transparent",
          appearance: "none",
          cursor: canCompleteByTap ? "pointer" : "default",
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
      </button>
      {canTagSetType ? (
        <SetTypeSheet
          open={setTypeSheetOpen}
          onClose={() => setSetTypeSheetOpen(false)}
          setNumber={setIndex + 1}
          value={setType}
          onChange={(value) =>
            onExerciseAction({ type: "CHANGE_SET_TYPE", setIndex, value })
          }
        />
      ) : null}
    </div>
  );
}
