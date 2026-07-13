"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useAtomValue } from "jotai";
import { useLocale } from "@/components/locale-provider";
import { V2Textarea } from "@/components/v2/primitives";
import { TermBadge, type TermBadgeTone } from "@/components/v2/terminal";
import {
  formatPerformedHistoryLine,
  formatPrescription,
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
import { formatDateFriendly } from "@/lib/workout-record/last-session-summary";
import { useSetRowFocusChain } from "@/features/workout-log/model/use-set-row-focus-chain";
import { TermSetRow } from "@/features/workout-log/ui/term-set-row";
import { AppSelect } from "@/components/ui/form-controls";
import type { Ref5TerminationReason } from "@/entities/workout-record";
import {
  deriveRef5ExerciseOutcomeView,
  resolveRef5PullDisplayLoad,
} from "@/lib/workout-record/ref5-outcome";

type Props = {
  exerciseId: string;
  onExerciseAction: (exerciseId: string, action: ExerciseRowAction) => void;
};

// terminal(ironlog) 운동 패널 — paper WorkoutExerciseCard와 동일 props·동일 atom/
// dispatch/focus-chain을 공유하고 표현만 TUI로 분기한다. box 프레임은 boxShadow
// inset(CSS border 금지, redesign-target §5), radius=0(terminal 토큰), 상태/배지는
// 색 + 리터럴 bracket 글리프. 처방·히스토리 파생은 WorkoutExerciseCard와 동일 로직을
// 미러하고 표기 문자열은 공유 format.ts(formatPrescription/formatPerformedHistoryLine)로 만든다.
const ROW_GRID =
  "var(--v2-s-6) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) var(--v2-s-6)";

// 한글 역할 라벨 → Latin(모노 그리드 정합 + 박스 내 폭 절약, redesign-target §3/R7).
const TEXAS_ROLE_TERM: Record<string, string> = {
  volume: "VOL",
  recovery: "REC",
  intensity: "INT",
};

export function TermTable({ exerciseId, onExerciseAction }: Props) {
  const { locale } = useLocale();
  const exerciseCardAtom = useMemo(
    () => makeExerciseCardAtom(exerciseId),
    [exerciseId],
  );
  const exerciseCard = useAtomValue(exerciseCardAtom);
  const recentLogItems = useAtomValue(recentLogItemsAtom);
  const workoutPreferences = useAtomValue(workoutPreferencesAtom);
  const focusChain = useSetRowFocusChain();
  const cardRef = useRef<HTMLDivElement>(null);

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
  const ref5Outcome = deriveRef5ExerciseOutcomeView(
    exercise,
    exerciseCard.programEntryState,
  );
  const ref5PullLoad = resolveRef5PullDisplayLoad(exercise);

  const isUser = exercise.source === "USER";
  const totalSets = exercise.set.repsPerSet.length;
  const isProgramAuto =
    exercise.source === "PROGRAM" && exercise.badge !== "CUSTOM";
  const plannedSetCount = isProgramAuto
    ? (exercise.plannedSetMeta?.repsPerSet.length ?? 0)
    : 0;
  const minSetCount = Math.max(1, plannedSetCount);
  const canRemoveSet = totalSets > minSetCount;

  // ── 직전 세션 히스토리 (WorkoutExerciseCard와 동일 로직) ──
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

  // ── 권장 무게 (WorkoutExerciseCard와 동일 로직) ──
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

  // ── 완료 카운트 (reps 소스 이원: PROGRAM은 programEntryState, USER는 set) ──
  let filledSets = 0;
  if (exercise.source === "PROGRAM") {
    const inputs = exerciseCard.programEntryState?.repsInputs ?? [];
    for (let i = 0; i < totalSets; i++) {
      const v = (inputs[i] ?? "").trim();
      if (exercise.ref5 ? v !== "" : v && Number(v) > 0) filledSets++;
    }
  } else {
    filledSets = exercise.ref5
      ? exercise.set.repsPerSet.length
      : exercise.set.repsPerSet.filter((r) => r > 0).length;
  }
  const cardComplete =
    totalSets > 0 &&
    filledSets >= totalSets &&
    (!exercise.ref5 || Boolean(exercise.ref5.terminationReason));

  // ── 처방 표기 (WorkoutExerciseCard와 동일 로직 → 공유 formatPrescription 문자열) ──
  const prescriptionReps = exercise.ref5
    ? (exercise.plannedSetMeta?.repsPerSet ?? exercise.set.repsPerSet)
    : exercise.set.repsPerSet;
  const allSame =
    prescriptionReps.length > 0 &&
    prescriptionReps.every((r) => r === prescriptionReps[0]);
  const firstReps = prescriptionReps[0] ?? 0;
  const planUniform = allSame && firstReps > 0;
  const firstPercent = exercise.plannedSetMeta?.percentPerSet?.[0];
  const weightPerSet = exercise.set.weightKgPerSet ?? [];
  const firstWeight = weightPerSet[0] ?? 0;
  const weightUniform =
    weightPerSet.length > 0 && weightPerSet.every((w) => w === firstWeight);

  const isBodyweight = isBodyweightExerciseName(exercise.exerciseName);
  const bodyweightKg = workoutPreferences.bodyweightKg;
  let presWeightKg: number | undefined;
  let presWeightSuffix: string | undefined;
  let presPercent: number | undefined;
  if (exercise.ref5 && weightUniform) {
    presWeightKg = firstWeight;
    if (isBodyweight) {
      presWeightSuffix = ref5PullLoad
        ? `(ADDED · TOTAL ${ref5PullLoad.actualTotalKg}kg)`
        : "(ADDED)";
    }
  } else if (
    isBodyweight &&
    typeof recommendedWeightKg === "number" &&
    recommendedWeightKg > 0 &&
    typeof bodyweightKg === "number" &&
    bodyweightKg > 0
  ) {
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

  const prescriptionText = planUniform
    ? formatPrescription({
        sets: totalSets,
        reps: firstReps,
        weightKg: presWeightKg,
        weightSuffix: presWeightSuffix,
        percent: presPercent,
        rpe: planRpeUniform ? firstPlanRpe : undefined,
        lastSetAmrap,
      })
    : `${totalSets} sets`;

  const historyText = previousSession
    ? formatPerformedHistoryLine(previousSession.sets, {
        exerciseName: exercise.exerciseName,
        bodyweightKg,
        locale,
      })
    : null;

  // ── 메모 (WorkoutExerciseCard와 동일 로직) ──
  const memoValue =
    exercise.source === "PROGRAM"
      ? (exerciseCard.programEntryState?.memoInput ?? "")
      : (exercise.note?.memo ?? "");
  const memoVisible =
    memoVisibleManual ?? !!(memoValue && memoValue.trim().length > 0);

  const toggleMemo = () => {
    setMemoVisibleManual((prev) => {
      const current = prev ?? !!(memoValue && memoValue.trim().length > 0);
      return !current;
    });
  };

  // ── 배지: 한글 → Latin bracket(redesign-target §3/R7). TermBadge(리터럴 bracket, 색=의미). ──
  const badges: { text: string; tone: TermBadgeTone }[] = [];
  if (isUser) {
    badges.push({ text: "USER", tone: "dim" });
  } else if (exercise.badge === "CUSTOM") {
    badges.push({ text: "CUSTOM", tone: "accent" });
  } else {
    badges.push({ text: "AUTO", tone: "info" });
  }
  if (exercise.tier) {
    badges.push({ text: exercise.tier, tone: "dim" });
  }
  if (typeof exercise.stage === "number" && exercise.stage > 0) {
    badges.push({ text: `STG${exercise.stage}`, tone: "accent" });
  }
  if (exercise.texasRole && TEXAS_ROLE_TERM[exercise.texasRole]) {
    badges.push({
      text: TEXAS_ROLE_TERM[exercise.texasRole]!,
      tone: exercise.texasRole === "intensity" ? "accent" : "dim",
    });
  }
  if (ref5Outcome?.status === "classified") {
    const outcome = ref5Outcome.value.outcome;
    badges.push({
      text: outcome,
      tone:
        outcome === "PASS"
          ? "success"
          : outcome === "FAIL"
            ? "danger"
            : outcome === "HOLD"
              ? "accent"
              : "dim",
    });
  } else if (ref5Outcome?.status === "invalid-input") {
    badges.push({ text: "CHECK", tone: "danger" });
  }

  const headerCells = ["SET", "WT kg", "REPS", "RPE", "✓"];

  return (
    <div
      ref={cardRef}
      aria-label={exercise.exerciseName}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--v2-s-2)",
        padding: "var(--v2-s-3)",
        background: "var(--term-panel)",
        // 박스 프레임 = boxShadow inset(border 금지). terminal radius=0 → 샤프 코너.
        boxShadow: "inset 0 0 0 1px var(--term-line-box)",
        borderRadius: "var(--v2-r-2)",
        scrollMarginTop: "var(--v2-s-4)",
        scrollMarginBottom: "var(--v2-s-9)",
      }}
    >
      {/* 타이틀행: 운동명(밝은 fg) + Latin 배지 + 완료수 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--v2-s-2)",
        }}
      >
        <span
          className="v2-mono-label"
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--term-fg)",
          }}
        >
          {exercise.exerciseName}
        </span>
        <span
          className="v2-mono-label"
          style={{
            display: "flex",
            gap: "var(--v2-s-1)",
            flexShrink: 0,
          }}
        >
          {badges.map((b, i) => (
            <TermBadge key={i} tone={b.tone}>
              {b.text}
            </TermBadge>
          ))}
        </span>
        <span
          className="v2-mono-label"
          style={{
            flexShrink: 0,
            color: cardComplete ? "var(--term-green)" : "var(--term-dim)",
          }}
        >
          {filledSets}/{totalSets}
        </span>
      </div>

      {/* 처방 dim 라인 (Rx Sets × Reps @ Weight) */}
      {prescriptionText ? (
        <div className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
          <span>Rx </span>
          {prescriptionText}
        </div>
      ) : null}

      {/* 직전 세션 dim 라인 (PREV는 박스 위 dim, in-grid는 RPE) */}
      {previousSession && historyText ? (
        <div
          className="v2-mono-label"
          style={{
            color: "var(--term-dim)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          <span>
            prev {formatDateFriendly(previousSession.performedAt, locale)}{" "}
          </span>
          {historyText}
        </div>
      ) : null}

      {exercise.ref5 ? (
        <AppSelect
          label={locale === "ko" ? "종료 사유" : "Termination reason"}
          chrome="row"
          value={exercise.ref5.terminationReason ?? ""}
          onChange={(event) =>
            dispatchAction({
              type: "CHANGE_REF5_TERMINATION_REASON",
              value: event.target.value as Ref5TerminationReason,
            })
          }
        >
          <option value="" disabled>{locale === "ko" ? "선택" : "Select"}</option>
          <option value="NORMAL">NORMAL</option>
          <option value="CLEAR_SLOWDOWN">CLEAR SLOWDOWN</option>
          <option value="FORCE_OR_TECHNIQUE">FORCE / TECHNIQUE</option>
          <option value="SAFETY">SAFETY</option>
          <option value="EXTERNAL">EXTERNAL</option>
        </AppSelect>
      ) : null}

      {/* 컬럼 헤더(단위 1회) — dim, 하단 hairline은 boxShadow inset */}
      <div
        className="v2-mono-label"
        style={{
          display: "grid",
          gridTemplateColumns: ROW_GRID,
          gap: "var(--v2-s-2)",
          padding: "0 var(--v2-s-2) var(--v2-s-1)",
          color: "var(--term-dim)",
          boxShadow: "inset 0 -1px 0 var(--term-line)",
        }}
      >
        {headerCells.map((c) => (
          <span key={c} style={{ textAlign: "center" }}>
            {c}
          </span>
        ))}
      </div>

      {/* 세트 행 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
        }}
      >
        {Array.from({ length: totalSets }).map((_, i) => (
          <TermSetRow
            key={i}
            exercise={exercise}
            setIndex={i}
            onExerciseAction={dispatchAction}
          />
        ))}
      </div>

      {/* 카드 액션 — 44px keyhint 버튼(R6 터치). target은 권장값 있을 때만, del은 비-AUTO만. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--v2-s-1)",
        }}
      >
        {!exercise.ref5 ? (
          <>
            <TermAction
              label="+set"
              onClick={() => dispatchAction({ type: "ADD_SET" })}
              color="var(--term-cyan)"
            />
            <TermAction
              label="-set"
              onClick={() => {
                if (totalSets <= minSetCount) return;
                dispatchAction({ type: "REMOVE_SET", index: totalSets - 1 });
              }}
              disabled={!canRemoveSet}
              color="var(--term-cyan)"
            />
          </>
        ) : null}
        {recommendedWeightKg != null && !exercise.ref5 ? (
          <TermAction
            label="target"
            onClick={() => dispatchAction({ type: "APPLY_TARGET_WEIGHTS" })}
            color="var(--term-amber)"
          />
        ) : null}
        <TermAction
          label="memo"
          onClick={toggleMemo}
          color="var(--term-cyan)"
        />
        {!exercise.ref5 && !isProgramAuto ? (
          <TermAction
            label="del"
            onClick={() => dispatchAction({ type: "DELETE" })}
            color="var(--term-red)"
          />
        ) : null}
      </div>

      {/* 메모 — V2Textarea 재사용(터미널 토큰으로 cascade 리스킨). */}
      {memoVisible ? (
        <V2Textarea
          size="sm"
          value={memoValue}
          onChange={(e) =>
            dispatchAction({ type: "CHANGE_MEMO", value: e.target.value })
          }
          placeholder={locale === "ko" ? "메모" : "Memo"}
          rows={2}
          style={{ resize: "none" }}
        />
      ) : null}
    </div>
  );
}

// 44px 터치 버튼, 리터럴 bracket(터미널 keyhint 스타일). 색만 --term-*, 치수만 토큰.
function TermAction({
  label,
  onClick,
  disabled,
  color,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  color: string;
}) {
  const style: CSSProperties = {
    minHeight: "var(--v2-touch)",
    padding: "0 var(--v2-s-2)",
    background: "transparent",
    border: "none",
    color: disabled ? "var(--term-ghost)" : color,
    cursor: disabled ? "not-allowed" : "pointer",
    whiteSpace: "nowrap",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="v2-mono-label"
      style={style}
    >
      [{label}]
    </button>
  );
}
