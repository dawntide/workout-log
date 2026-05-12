"use client";

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAtom, useAtomValue } from "jotai";
import { useLocale } from "@/components/locale-provider";
import { AppTextarea } from "@/components/ui/form-controls";
import {
  draftAtom,
  programEntryStateAtom,
  recentLogItemsAtom,
  visibleExercisesAtom,
} from "@/features/workout-log/store/workout-log-atoms";
import type { ExerciseRowAction } from "@/features/workout-log/model/editor-actions";
import { formatDateFriendly } from "@/features/workout-log/model/last-session-summary";
import {
  patchSeedExercise,
  updateUserExercise,
} from "@/lib/workout-record/model";
import { V2Card, V2Hairline } from "@/components/v2/primitives";

type Field = "weight" | "reps" | "rpe";

export type KeypadInitialFocus = {
  exerciseId: string;
  setIndex: number;
  field: Field;
  /**
   * 같은 셀로 다시 포커싱 요청할 때 사용. parent 가 매번 새 객체를 만들어 전달해도
   * useEffect 의존성에서 변화가 감지되도록 명시적 nonce.
   */
  nonce?: number;
};

type WorkoutLogKeypadPanelProps = {
  initialFocus?: KeypadInitialFocus | null;
  onExerciseAction?: (exerciseId: string, action: ExerciseRowAction) => void;
  onOpenAddExerciseSheet?: () => void;
};

/**
 * 운동기록 메인 인라인 키패드 패널.
 *
 * - PROGRAM 운동: reps(programEntryStateAtom) / weight(seedEditLayer) / RPE / memo
 * - USER 운동: reps + weight + RPE + memo (draft 직접 patch)
 * - 모든 입력은 atom 또는 onExerciseAction 을 통해 메인 폼과 즉시 양방향 동기화.
 * - initialFocus 가 제공되면 해당 셀로 active 셋팅. 이후 picker/dot 으로 자유 이동.
 */
export function WorkoutLogKeypadPanel({
  initialFocus,
  onExerciseAction,
  onOpenAddExerciseSheet,
}: WorkoutLogKeypadPanelProps) {
  const { locale } = useLocale();
  const visibleExercises = useAtomValue(visibleExercisesAtom);
  const [programEntryState, setProgramEntryState] = useAtom(
    programEntryStateAtom,
  );
  const [draft, setDraft] = useAtom(draftAtom);

  const recentLogItems = useAtomValue(recentLogItemsAtom);

  const allExercises = useMemo(
    () => visibleExercises.filter((ex) => !ex.deleted),
    [visibleExercises],
  );

  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [activeSetIndex, setActiveSetIndex] = useState<number>(0);
  const [activeField, setActiveField] = useState<Field>("reps");
  const [memoMode, setMemoMode] = useState(false);

  const initializedRef = useRef(false);

  // 외부에서 specific cell 요청 (e.g. 요약 시트의 "이 운동으로")
  useEffect(() => {
    if (!initialFocus) return;
    setActiveExerciseId(initialFocus.exerciseId);
    setActiveSetIndex(initialFocus.setIndex);
    setActiveField(initialFocus.field);
    setMemoMode(false);
    initializedRef.current = true;
  }, [initialFocus]);

  // 최초 마운트 시 첫 빈 슬롯 자동 포커싱
  useEffect(() => {
    if (initializedRef.current) return;
    let firstEmptyTarget: { exerciseId: string; setIndex: number } | null =
      null;
    for (const ex of allExercises) {
      if (ex.source === "PROGRAM") {
        const inputs = programEntryState[ex.id]?.repsInputs ?? [];
        for (let i = 0; i < ex.set.repsPerSet.length; i++) {
          const v = (inputs[i] ?? "").trim();
          if (!v) {
            firstEmptyTarget = { exerciseId: ex.id, setIndex: i };
            break;
          }
        }
      }
      if (firstEmptyTarget) break;
    }
    if (!firstEmptyTarget && allExercises[0]) {
      firstEmptyTarget = { exerciseId: allExercises[0].id, setIndex: 0 };
    }
    if (!firstEmptyTarget) return;
    setActiveExerciseId(firstEmptyTarget.exerciseId);
    setActiveSetIndex(firstEmptyTarget.setIndex);
    setActiveField("reps");
    initializedRef.current = true;
  }, [allExercises, programEntryState]);

  const activeExercise = useMemo(
    () => allExercises.find((ex) => ex.id === activeExerciseId) ?? null,
    [allExercises, activeExerciseId],
  );

  const isUser = activeExercise?.source === "USER";

  // 활성 운동의 가장 최근 세션 기록 (현재 draft 제외)
  const previousSessionForActive = (() => {
    if (!activeExercise) return null;
    const targetName = activeExercise.exerciseName.trim().toLowerCase();
    if (!targetName) return null;
    for (const log of recentLogItems) {
      const matched = log.sets.filter(
        (s) => s.exerciseName.trim().toLowerCase() === targetName,
      );
      const usableSets = matched
        .map((s) => ({
          weightKg: s.weightKg ?? 0,
          reps: s.reps ?? 0,
        }))
        .filter((s) => s.reps > 0);
      if (usableSets.length > 0) {
        return { performedAt: log.performedAt, sets: usableSets };
      }
    }
    return null;
  })();

  const repsValue = useMemo(() => {
    if (!activeExercise) return "";
    if (activeExercise.source === "PROGRAM") {
      const inputs = programEntryState[activeExercise.id]?.repsInputs ?? [];
      return (inputs[activeSetIndex] ?? "").trim();
    }
    const r = activeExercise.set.repsPerSet[activeSetIndex];
    return r != null && r > 0 ? String(r) : "";
  }, [activeExercise, programEntryState, activeSetIndex]);

  const weightValue = useMemo(() => {
    if (!activeExercise) return "";
    return activeExercise.set.weightKg > 0
      ? String(activeExercise.set.weightKg)
      : "";
  }, [activeExercise]);

  const rpeValue = useMemo(() => {
    if (!activeExercise) return "";
    const r = activeExercise.set.rpePerSet?.[activeSetIndex] ?? 0;
    if (!Number.isFinite(r) || r <= 0) return "";
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }, [activeExercise, activeSetIndex]);

  const memoValue = useMemo(() => {
    if (!activeExercise) return "";
    if (activeExercise.source === "PROGRAM") {
      return programEntryState[activeExercise.id]?.memoInput ?? "";
    }
    const ex = draft?.userExercises.find((e) => e.id === activeExerciseId);
    return ex?.note.memo ?? "";
  }, [activeExercise, programEntryState, draft, activeExerciseId]);

  const activeValue =
    activeField === "reps"
      ? repsValue
      : activeField === "weight"
        ? weightValue
        : rpeValue;

  const setReps = (next: string) => {
    if (!activeExerciseId || !activeExercise) return;
    if (activeExercise.source === "PROGRAM") {
      setProgramEntryState((prev) => {
        const cur = prev[activeExerciseId];
        if (!cur) return prev;
        const updated = cur.repsInputs.slice();
        updated[activeSetIndex] = next;
        return {
          ...prev,
          [activeExerciseId]: { ...cur, repsInputs: updated },
        };
      });
      return;
    }
    setDraft((prev) => {
      if (!prev) return prev;
      const ex = prev.userExercises.find((e) => e.id === activeExerciseId);
      if (!ex) return prev;
      const repsPerSet = ex.set.repsPerSet.slice();
      const num = next === "" ? 0 : Math.max(0, Math.min(100, Number(next)));
      repsPerSet[activeSetIndex] = Number.isFinite(num) ? num : 0;
      return updateUserExercise(prev, activeExerciseId, {
        set: { repsPerSet, count: repsPerSet.length, reps: repsPerSet[0] ?? 0 },
      });
    });
  };

  const setWeight = (next: string) => {
    if (!activeExerciseId || !activeExercise) return;
    const num =
      next === "" || next === "."
        ? 0
        : Math.max(0, Math.min(9999, Number(next)));
    if (!Number.isFinite(num)) return;
    setDraft((prev) => {
      if (!prev) return prev;
      if (activeExercise.source === "PROGRAM") {
        return patchSeedExercise(prev, activeExerciseId, {
          set: { weightKg: num },
        });
      }
      return updateUserExercise(prev, activeExerciseId, {
        set: { weightKg: num },
      });
    });
  };

  const setRpe = (next: string) => {
    if (!activeExerciseId || !onExerciseAction) return;
    const raw = next === "" || next === "." ? 0 : Number(next);
    if (!Number.isFinite(raw)) return;
    const clamped = Math.max(0, Math.min(10, raw));
    const halfRounded = Math.round(clamped * 2) / 2;
    onExerciseAction(activeExerciseId, {
      type: "CHANGE_SET_RPE",
      setIndex: activeSetIndex,
      value: halfRounded,
    });
  };

  const writeActive =
    activeField === "reps"
      ? setReps
      : activeField === "weight"
        ? setWeight
        : setRpe;

  const onKey = (k: string) => {
    if (k === "back") {
      writeActive(activeValue.slice(0, -1));
      return;
    }
    if (k === ".") {
      if (activeField === "reps") return;
      writeActive(activeValue.includes(".") ? activeValue : activeValue + ".");
      return;
    }
    if (k.startsWith("+") || k.startsWith("-")) {
      const base = activeValue === "" ? 0 : parseFloat(activeValue) || 0;
      const delta = parseFloat(k);
      let next: number;
      if (activeField === "weight") {
        next = Math.max(0, Math.min(9999, +(base + delta).toFixed(2)));
      } else if (activeField === "rpe") {
        const summed = +(base + delta).toFixed(2);
        next = Math.max(0, Math.min(10, Math.round(summed * 2) / 2));
      } else {
        next = Math.max(0, Math.min(100, Math.round(base + delta)));
      }
      writeActive(String(next));
      return;
    }
    if (activeField === "reps" && activeValue.length >= 3) return;
    if (activeField === "weight" && activeValue.length >= 6) return;
    if (activeField === "rpe" && activeValue.length >= 4) return;
    const next = activeValue === "0" ? k : activeValue + k;
    if (activeField === "reps" && Number(next) > 100) return;
    if (activeField === "rpe" && Number(next) > 10) return;
    writeActive(next);
  };

  const advanceToNextEmpty = () => {
    if (!activeExercise || !activeExerciseId) return;
    const totalSets = activeExercise.set.repsPerSet.length;
    if (activeSetIndex < totalSets - 1) {
      setActiveSetIndex(activeSetIndex + 1);
      setActiveField("reps");
      return;
    }
    const idx = allExercises.findIndex((ex) => ex.id === activeExerciseId);
    for (let i = idx + 1; i < allExercises.length; i++) {
      const next = allExercises[i];
      let firstEmpty = 0;
      if (next.source === "PROGRAM") {
        const inputs = programEntryState[next.id]?.repsInputs ?? [];
        const empty = inputs.findIndex((v) => (v ?? "").trim() === "");
        if (empty >= 0) firstEmpty = empty;
      }
      setActiveExerciseId(next.id);
      setActiveSetIndex(firstEmpty);
      setActiveField("reps");
      return;
    }
  };

  const advance = () => {
    if (!activeExercise) return;
    if (activeField === "weight") {
      setActiveField("reps");
      return;
    }
    advanceToNextEmpty();
  };

  const recommendedWeightKg = useMemo(() => {
    if (!activeExercise) return null;
    if (
      typeof activeExercise.prescribedWeightKg === "number" &&
      activeExercise.prescribedWeightKg > 0
    ) {
      return activeExercise.prescribedWeightKg;
    }
    const target =
      activeExercise.plannedSetMeta?.targetWeightKgPerSet?.[activeSetIndex];
    if (typeof target === "number" && target > 0) return target;
    return null;
  }, [activeExercise, activeSetIndex]);

  const applyRecommendedWeight = () => {
    if (!activeExerciseId || !activeExercise || recommendedWeightKg == null)
      return;
    setDraft((prev) => {
      if (!prev) return prev;
      if (activeExercise.source === "PROGRAM") {
        return patchSeedExercise(prev, activeExerciseId, {
          set: { weightKg: recommendedWeightKg },
        });
      }
      return updateUserExercise(prev, activeExerciseId, {
        set: { weightKg: recommendedWeightKg },
      });
    });
    setActiveField("weight");
  };

  const handleAddSet = () => {
    if (!activeExerciseId || !onExerciseAction) return;
    onExerciseAction(activeExerciseId, { type: "ADD_SET" });
  };

  const handleRemoveSet = () => {
    if (!activeExerciseId || !activeExercise || !onExerciseAction) return;
    if (activeExercise.set.repsPerSet.length <= 1) return;
    const removingIndex = activeSetIndex;
    const newLastIndex = activeExercise.set.repsPerSet.length - 2;
    onExerciseAction(activeExerciseId, {
      type: "REMOVE_SET",
      index: removingIndex,
    });
    setActiveSetIndex(Math.max(0, Math.min(removingIndex, newLastIndex)));
  };

  const handleMemoChange = (value: string) => {
    if (!activeExerciseId || !onExerciseAction) return;
    onExerciseAction(activeExerciseId, { type: "CHANGE_MEMO", value });
  };

  if (allExercises.length === 0 || !draft) {
    return (
      <section
        aria-label={locale === "ko" ? "키패드" : "Keypad"}
        style={panelShellStyle}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 24px",
            textAlign: "center",
            gap: 12,
          }}
        >
          <p className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
            {locale === "ko"
              ? "기록할 운동이 없습니다."
              : "No exercises to log."}
          </p>
          {onOpenAddExerciseSheet && (
            <button
              type="button"
              onClick={onOpenAddExerciseSheet}
              style={{
                marginTop: 8,
                padding: "12px 18px",
                borderRadius: 12,
                border: "none",
                background: "var(--v2-accent)",
                color: "var(--v2-ink-on-accent)",
                fontFamily: "var(--v2-f-display)",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                minHeight: 44,
              }}
            >
              {locale === "ko" ? "운동 추가" : "Add exercise"}
            </button>
          )}
        </div>
      </section>
    );
  }

  const plannedReps = activeExercise?.set.repsPerSet[activeSetIndex] ?? null;
  const canRemoveSet = (activeExercise?.set.repsPerSet.length ?? 0) > 1;

  return (
    <section
      aria-label={locale === "ko" ? "키패드 입력" : "Keypad entry"}
      style={panelShellStyle}
    >
      {/* 운동 picker (+ 운동 추가 타일) */}
      <div
        style={{
          padding: "6px 12px",
          display: "flex",
          gap: 4,
          overflowX: "auto",
          scrollbarWidth: "none",
          flexShrink: 0,
        }}
      >
        {allExercises.map((ex) => {
          const isActive = ex.id === activeExerciseId;
          const isUserEx = ex.source === "USER";
          const inputs =
            ex.source === "PROGRAM"
              ? (programEntryState[ex.id]?.repsInputs ?? [])
              : ex.set.repsPerSet.map((r) => (r > 0 ? String(r) : ""));
          const filled = inputs.filter(
            (v) => (v ?? "").toString().trim() !== "" && Number(v) > 0,
          ).length;
          return (
            <button
              key={ex.id}
              type="button"
              onClick={() => {
                setActiveExerciseId(ex.id);
                const empty = inputs.findIndex(
                  (v) =>
                    (v ?? "").toString().trim() === "" || Number(v) <= 0,
                );
                setActiveSetIndex(empty >= 0 ? empty : 0);
                setActiveField("reps");
                setMemoMode(false);
              }}
              style={{
                flex: "1 0 auto",
                padding: "8px 12px",
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                background: isActive ? "var(--v2-ink)" : "var(--v2-paper-2)",
                color: isActive
                  ? "var(--v2-ink-on-accent)"
                  : "var(--v2-ink-2)",
                fontFamily: "var(--v2-f-display)",
                fontWeight: 700,
                fontSize: 12,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 2,
                minWidth: 100,
                minHeight: 40,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {ex.exerciseName}
                {isUserEx && (
                  <span
                    style={{
                      fontSize: 8,
                      padding: "1px 4px",
                      borderRadius: 4,
                      background: isActive
                        ? "rgba(255,255,255,0.16)"
                        : "var(--v2-paper-3)",
                      color: isActive
                        ? "var(--v2-ink-on-accent)"
                        : "var(--v2-ink-3)",
                    }}
                  >
                    USER
                  </span>
                )}
              </span>
              <span
                className="v2-mono-label"
                style={{
                  fontSize: 9,
                  opacity: 0.8,
                  color: isActive
                    ? "var(--v2-ink-on-accent)"
                    : "var(--v2-ink-3)",
                }}
              >
                {filled}/{ex.set.repsPerSet.length}
              </span>
            </button>
          );
        })}
        {onOpenAddExerciseSheet && (
          <button
            type="button"
            onClick={onOpenAddExerciseSheet}
            aria-label={locale === "ko" ? "운동 추가" : "Add exercise"}
            style={{
              flexShrink: 0,
              padding: "8px 12px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              background: "var(--v2-paper-2)",
              color: "var(--v2-accent)",
              minWidth: 48,
              minHeight: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 22, fontVariationSettings: "'wght' 500" }}
              aria-hidden
            >
              add
            </span>
          </button>
        )}
      </div>

      {/* 세트 컨트롤 */}
      {activeExercise && onExerciseAction && (
        <div
          style={{
            padding: "0 16px 4px",
            display: "flex",
            gap: 6,
            justifyContent: "flex-end",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={handleRemoveSet}
            disabled={!canRemoveSet}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "none",
              background: "transparent",
              color: canRemoveSet ? "var(--v2-ink-3)" : "var(--v2-paper-3)",
              fontFamily: "var(--v2-f-display)",
              fontWeight: 600,
              fontSize: 11,
              cursor: canRemoveSet ? "pointer" : "not-allowed",
              minHeight: 32,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 14 }}
              aria-hidden
            >
              remove
            </span>
            {locale === "ko" ? "현재 세트 삭제" : "Remove set"}
          </button>
          <button
            type="button"
            onClick={handleAddSet}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "none",
              background: "var(--v2-paper-2)",
              color: "var(--v2-ink)",
              fontFamily: "var(--v2-f-display)",
              fontWeight: 700,
              fontSize: 11,
              cursor: "pointer",
              minHeight: 32,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 14 }}
              aria-hidden
            >
              add
            </span>
            {locale === "ko" ? "세트 추가" : "Add set"}
          </button>
        </div>
      )}

      {/* 세트 진행 dot */}
      {activeExercise && (
        <div style={{ padding: "0 16px 6px", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {activeExercise.set.repsPerSet.map((_, i) => {
              let filled = false;
              if (activeExercise.source === "PROGRAM") {
                const inputs =
                  programEntryState[activeExercise.id]?.repsInputs ?? [];
                const v = (inputs[i] ?? "").trim();
                filled = !!v && Number(v) > 0;
              } else {
                filled = activeExercise.set.repsPerSet[i] > 0;
              }
              const isCurrent = i === activeSetIndex;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveSetIndex(i)}
                  aria-label={`Set ${i + 1}`}
                  style={{
                    flex: 1,
                    height: 6,
                    borderRadius: 9999,
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    background: filled
                      ? "var(--v2-c-success)"
                      : isCurrent
                        ? "var(--v2-accent)"
                        : "var(--v2-paper-3)",
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* 이전 세션 기록 */}
      {previousSessionForActive && (
        <div
          style={{
            padding: "0 16px 6px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
            overflow: "hidden",
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 14,
              color: "var(--v2-ink-3)",
              flexShrink: 0,
            }}
            aria-hidden
          >
            history
          </span>
          <span
            className="v2-mono-label"
            style={{
              fontSize: 10,
              color: "var(--v2-ink-3)",
              flexShrink: 0,
            }}
          >
            {locale === "ko" ? "지난" : "PREV"}{" "}
            {formatDateFriendly(previousSessionForActive.performedAt, locale)}
          </span>
          <div
            style={{
              display: "flex",
              gap: 4,
              overflowX: "auto",
              scrollbarWidth: "none",
              flex: 1,
              minWidth: 0,
            }}
          >
            {previousSessionForActive.sets.map((s, i) => (
              <span
                key={i}
                className="v2-mono-label"
                style={{
                  flexShrink: 0,
                  padding: "2px 6px",
                  borderRadius: 6,
                  background: "var(--v2-paper-2)",
                  color: "var(--v2-ink-2)",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                <span style={{ color: "var(--v2-c-weight)" }}>
                  {s.weightKg > 0 ? s.weightKg : "—"}
                </span>
                <span
                  style={{ color: "var(--v2-ink-3)", margin: "0 2px" }}
                >
                  ×
                </span>
                <span style={{ color: "var(--v2-c-reps)" }}>{s.reps}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 빅 넘버 디스플레이 */}
      <div style={{ padding: "4px 12px 0", flexShrink: 0 }}>
        <V2Card padding="10px 14px">
          <FieldDisplay
            label={locale === "ko" ? "중량" : "Weight"}
            unit="kg"
            value={weightValue || "—"}
            color="var(--v2-c-weight)"
            active={activeField === "weight" && !memoMode}
            onSelect={() => {
              setActiveField("weight");
              setMemoMode(false);
            }}
            size="md"
          />
          <V2Hairline style={{ marginTop: 6, marginBottom: 6 }} />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              alignItems: "center",
            }}
          >
            <FieldDisplay
              label={
                locale === "ko"
                  ? `반복 · 세트 ${activeSetIndex + 1}`
                  : `Reps · Set ${activeSetIndex + 1}`
              }
              unit={locale === "ko" ? "회" : "reps"}
              value={repsValue || "—"}
              color="var(--v2-c-reps)"
              active={activeField === "reps" && !memoMode}
              onSelect={() => {
                setActiveField("reps");
                setMemoMode(false);
              }}
              size="sm"
              extra={
                activeExercise?.source === "PROGRAM" &&
                plannedReps != null &&
                plannedReps > 0 ? (
                  <span
                    className="v2-mono-label"
                    style={{ marginLeft: "auto", color: "var(--v2-ink-3)" }}
                  >
                    {locale === "ko" ? "계획" : "PLAN"} {plannedReps}
                  </span>
                ) : null
              }
            />
            <FieldDisplay
              label="RPE"
              value={rpeValue || "—"}
              color="var(--v2-c-warning)"
              active={activeField === "rpe" && !memoMode}
              onSelect={() => {
                setActiveField("rpe");
                setMemoMode(false);
              }}
              size="sm"
            />
          </div>
          {isUser && (
            <p
              className="v2-mono-label"
              style={{
                marginTop: 6,
                color: "var(--v2-ink-3)",
                fontSize: 9,
              }}
            >
              {locale === "ko"
                ? "USER 운동 — 무게는 모든 세트 동일"
                : "USER exercise — same weight across sets"}
            </p>
          )}
        </V2Card>
      </div>

      {/* 권장 무게 / 메모 토글 */}
      <div
        style={{
          padding: "6px 12px 0",
          display: "flex",
          gap: 6,
          alignItems: "stretch",
          flexShrink: 0,
        }}
      >

        {recommendedWeightKg != null && !memoMode && (
          <button
            type="button"
            onClick={applyRecommendedWeight}
            aria-label={
              locale === "ko"
                ? `권장 무게 ${recommendedWeightKg}kg 적용`
                : `Apply recommended ${recommendedWeightKg}kg`
            }
            style={{
              padding: "12px 12px",
              borderRadius: 16,
              background: "var(--v2-paper-2)",
              color: "var(--v2-ink)",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              fontFamily: "var(--v2-f-display)",
              fontWeight: 700,
              fontSize: 13,
              minHeight: 38,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 18, color: "var(--v2-accent)" }}
              aria-hidden
            >
              restart_alt
            </span>
            {recommendedWeightKg}
            <span
              className="v2-mono-label"
              style={{ color: "var(--v2-ink-3)" }}
            >
              kg
            </span>
          </button>
        )}

        {onExerciseAction && activeExercise && (
          <button
            type="button"
            onClick={() => setMemoMode((v) => !v)}
            aria-pressed={memoMode}
            aria-label={locale === "ko" ? "메모" : "Memo"}
            style={{
              padding: "12px 14px",
              borderRadius: 16,
              background: memoMode ? "var(--v2-accent)" : "var(--v2-paper-2)",
              color: memoMode
                ? "var(--v2-ink-on-accent)"
                : "var(--v2-ink-2)",
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontFamily: "var(--v2-f-display)",
              fontWeight: 700,
              fontSize: 13,
              minHeight: 38,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 18 }}
              aria-hidden
            >
              edit_note
            </span>
            {locale === "ko" ? "메모" : "Memo"}
          </button>
        )}
      </div>

      {/* 키패드 또는 메모 */}
      <div style={{ flex: 1, minHeight: 0 }} />
      {memoMode && activeExercise ? (
        <div
          style={{
            background: "var(--v2-paper-2)",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: "12px 12px 16px",
            marginTop: 8,
            flexShrink: 0,
          }}
        >
          <p
            className="v2-label"
            style={{ marginBottom: 8, fontSize: 9, color: "var(--v2-ink-3)" }}
          >
            {locale === "ko"
              ? `${activeExercise.exerciseName} · 메모`
              : `${activeExercise.exerciseName} · Memo`}
          </p>
          <AppTextarea
            variant="workout"
            value={memoValue}
            onChange={(event) => handleMemoChange(event.target.value)}
            placeholder={locale === "ko" ? "메모" : "Memo"}
            autoFocus
            style={{
              border: "none",
              borderRadius: 14,
              background: "var(--v2-paper)",
              fontSize: 14,
              minHeight: 100,
              width: "100%",
            }}
          />
        </div>
      ) : (
        <div
          style={{
            background: "var(--v2-paper-2)",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: "8px 10px 12px",
            marginTop: 8,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 4,
            }}
          >
            {keysFor(activeField).map((k, i) => (
              <Key
                key={`${activeField}-${k}-${i}`}
                k={k}
                onPress={onKey}
                onAdvance={advance}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const panelShellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  background: "var(--v2-paper)",
  borderRadius: 20,
  overflow: "hidden",
};

/* ─── 필드 디스플레이 ─── */

function FieldDisplay({
  label,
  unit,
  value,
  color,
  active,
  onSelect,
  size = "md",
  extra,
}: {
  label: string;
  unit?: string;
  value: string;
  color: string;
  active: boolean;
  onSelect: () => void;
  size?: "sm" | "md";
  extra?: React.ReactNode;
}) {
  const valueFontSize = size === "sm" ? 22 : 32;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 8,
        cursor: "pointer",
        padding: "2px 0",
        opacity: active ? 1 : 0.5,
        background: "transparent",
        border: "none",
        width: "100%",
        textAlign: "left",
      }}
    >
      <span
        className="v2-label"
        style={{ color: active ? color : "var(--v2-ink-3)" }}
      >
        {label}
      </span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: 6,
          flex: 1,
          justifyContent: "flex-end",
        }}
      >
        <span
          className="v2-num-md"
          style={{ color, fontSize: valueFontSize, lineHeight: 1 }}
        >
          {value}
        </span>
        {unit && (
          <span
            className="v2-h3"
            style={{ color: "var(--v2-ink-3)", fontSize: 12 }}
          >
            {unit}
          </span>
        )}
        {extra}
      </span>
    </button>
  );
}

/* ─── 키패드 키 ─── */

function keysFor(field: Field): string[] {
  if (field === "weight") {
    return [
      "7",
      "8",
      "9",
      "+2.5",
      "4",
      "5",
      "6",
      "+5",
      "1",
      "2",
      "3",
      "+10",
      ".",
      "0",
      "back",
      "next",
    ];
  }
  if (field === "rpe") {
    return [
      "7",
      "8",
      "9",
      "+0.5",
      "4",
      "5",
      "6",
      "-0.5",
      "1",
      "2",
      "3",
      ".",
      "0",
      "back",
      "next",
      "done",
    ];
  }
  return [
    "7",
    "8",
    "9",
    "+1",
    "4",
    "5",
    "6",
    "-1",
    "1",
    "2",
    "3",
    "+5",
    "0",
    "back",
    "next",
    "done",
  ];
}

function Key({
  k,
  onPress,
  onAdvance,
}: {
  k: string;
  onPress: (k: string) => void;
  onAdvance: () => void;
}) {
  const isOp = k.startsWith("+") || k.startsWith("-");
  const isBack = k === "back";
  const isNext = k === "next";
  const isDone = k === "done";

  const display: CSSProperties = {
    height: 44,
    borderRadius: 12,
    background: isDone
      ? "var(--v2-c-success)"
      : isNext
        ? "var(--v2-accent)"
        : isOp
          ? "var(--v2-accent-weak)"
          : "var(--v2-paper)",
    color:
      isDone || isNext
        ? "var(--v2-ink-on-accent)"
        : isOp
          ? "var(--v2-accent-ink)"
          : "var(--v2-ink)",
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--v2-f-num)",
    fontWeight: 700,
    fontSize: isOp ? 14 : 20,
    boxShadow: "var(--v2-elev-1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "transform var(--v2-d-1) var(--v2-e-out)",
  };

  return (
    <button
      type="button"
      onClick={() => {
        if (isNext || isDone) onAdvance();
        else onPress(k);
      }}
      style={display}
      aria-label={k}
    >
      {isBack ? (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 22 }}
          aria-hidden
        >
          backspace
        </span>
      ) : isNext ? (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 22, color: "var(--v2-ink-on-accent)" }}
          aria-hidden
        >
          arrow_forward
        </span>
      ) : isDone ? (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 22, color: "var(--v2-ink-on-accent)" }}
          aria-hidden
        >
          check
        </span>
      ) : (
        k
      )}
    </button>
  );
}
