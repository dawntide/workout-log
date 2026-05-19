"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { AppNumberStepper, AppSelect, AppTextInput } from "@/components/ui/form-controls";
import { V2IconBtn, V2SecondaryBtn } from "@/components/v2/primitives";
import {
  inferProgressionTargetFromExerciseName,
  isOperatorAutoRowType,
  resolveOperatorExerciseDefaults,
  type ProgramExerciseDraft,
  type ProgramProgressionTarget,
  type ProgramRowType,
  type ProgramTemplate,
} from "@/lib/program-store/model";

type ExerciseOption = {
  id: string;
  name: string;
  category: string | null;
};

type ProgramExerciseEditorRowProps = {
  sessionId: string;
  exercise: ProgramExerciseDraft;
  publicTemplates: ProgramTemplate[];
  exerciseOptions: ExerciseOption[];
  exerciseOptionsLoading: boolean;
  operatorStyle?: boolean;
  highlighted?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onPatch: (sessionId: string, exerciseId: string, patch: Partial<ProgramExerciseDraft>) => void;
  onMove: (sessionId: string, exerciseId: string, direction: "up" | "down") => void;
  onDelete: (sessionId: string, exerciseId: string) => void;
  onDragStart: (sessionId: string, exerciseId: string) => void;
  onDrop: (sessionId: string, exerciseId: string) => void;
};

function formatProgramDisplayName(name: string) {
  return String(name)
    .replace(/\s*\(base[^)]*\)\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatExerciseOptionLabel(option: ExerciseOption) {
  return option.category ? `${option.name} · ${option.category}` : option.name;
}

function progressionTargetLabel(target: ProgramProgressionTarget | null | undefined) {
  if (target === "SQUAT") return "Squat";
  if (target === "BENCH") return "Bench";
  if (target === "DEADLIFT") return "Deadlift";
  if (target === "PULL") return "Pull";
  if (target === "OHP") return "OHP";
  return "Target";
}

function operatorRowTypeLabel(rowType: ProgramRowType | null | undefined, locale: "ko" | "en") {
  if (rowType === "AUTO") return locale === "ko" ? "자동" : "Auto";
  if (rowType === "CUSTOM") return locale === "ko" ? "수동" : "Custom";
  return locale === "ko" ? "수동" : "Custom";
}

function operatorRowTypeHelp(rowType: ProgramRowType | null | undefined, locale: "ko" | "en") {
  if (rowType === "AUTO") {
    return locale === "ko"
      ? "Operator 자동 행입니다. 선택한 운동과 진행 타겟 기준으로 중량, 반복수, 세트가 자동 적용됩니다."
      : "This is an Operator auto row. Weight, reps, and sets follow the selected exercise and progression target automatically.";
  }
  if (rowType === "CUSTOM") {
    return locale === "ko"
      ? "Operator 자동 로직을 따르지 않는 자유 행입니다. 이 경우만 세트와 반복수를 직접 입력합니다."
      : "This row does not follow the Operator auto logic. Only custom rows require manual set and rep input.";
  }
  return locale === "ko" ? "행 타입을 선택하세요." : "Choose a row type.";
}

function operatorRowTypeTone(rowType: ProgramRowType | null | undefined) {
  if (rowType === "AUTO") return "label label-program label-sm";
  if (rowType === "CUSTOM") return "label label-note label-sm";
  return "label label-note label-sm";
}

const ProgramExerciseEditorRow = memo(function ProgramExerciseEditorRow({
  sessionId,
  exercise,
  publicTemplates,
  exerciseOptions,
  exerciseOptionsLoading,
  operatorStyle = false,
  highlighted = false,
  canMoveUp = false,
  canMoveDown = false,
  onPatch,
  onMove,
  onDelete,
  onDragStart,
  onDrop,
}: ProgramExerciseEditorRowProps) {
  const { copy, locale } = useLocale();
  const [exerciseQuery, setExerciseQuery] = useState(exercise.exerciseName);
  const deferredExerciseQuery = useDeferredValue(exerciseQuery);
  const [exercisePickerOpen, setExercisePickerOpen] = useState(() => exercise.exerciseName.trim().length === 0);
  const exerciseInputRef = useRef<HTMLInputElement | null>(null);
  const lastResolvedExerciseNameRef = useRef(exercise.exerciseName.trim().toLowerCase());

  useEffect(() => {
    const normalizedSelectedName = exercise.exerciseName.trim().toLowerCase();
    if (!normalizedSelectedName) return;
    const normalizedQuery = exerciseQuery.trim().toLowerCase();
    if (normalizedQuery === normalizedSelectedName) return;
    setExerciseQuery(exercise.exerciseName);
  }, [exercise.exerciseName, exerciseQuery]);

  const selectedExerciseOption = useMemo(() => {
    const normalizedSelectedName = exercise.exerciseName.trim().toLowerCase();
    if (!normalizedSelectedName) return null;
    const match = exerciseOptions.find((option) => option.name.trim().toLowerCase() === normalizedSelectedName);
    if (match) return match;
    return {
      id: `legacy:${exercise.exerciseName}`,
      name: exercise.exerciseName,
      category: null,
    } satisfies ExerciseOption;
  }, [exercise.exerciseName, exerciseOptions]);

  const hasExactExerciseOption = useMemo(() => {
    const normalizedSelectedName = exercise.exerciseName.trim().toLowerCase();
    if (!normalizedSelectedName) return false;
    return exerciseOptions.some(
      (option) => option.name.trim().toLowerCase() === normalizedSelectedName,
    );
  }, [exercise.exerciseName, exerciseOptions]);

  const filteredExerciseOptions = useMemo(() => {
    const normalizedQuery = deferredExerciseQuery.trim().toLowerCase();
    if (!normalizedQuery) return exerciseOptions.slice(0, 40);
    const filtered: ExerciseOption[] = [];
    for (const option of exerciseOptions) {
      const haystack = [option.name, option.category ?? ""].join(" ").toLowerCase();
      if (!haystack.includes(normalizedQuery)) continue;
      filtered.push(option);
      if (filtered.length >= 40) break;
    }
    return filtered;
  }, [deferredExerciseQuery, exerciseOptions]);

  const operatorAutoRow = operatorStyle && isOperatorAutoRowType(exercise.rowType ?? null);
  const operatorAutoDefaults = useMemo(() => {
    if (!operatorAutoRow) return null;
    return resolveOperatorExerciseDefaults(exercise.exerciseName, exercise.rowType ?? "AUTO");
  }, [exercise.exerciseName, exercise.rowType, operatorAutoRow]);

  const patchExerciseName = useCallback(
    (nextExerciseName: string) => {
      const inferredTarget = inferProgressionTargetFromExerciseName(nextExerciseName);
      onPatch(
        sessionId,
        exercise.id,
        operatorStyle && isOperatorAutoRowType(exercise.rowType ?? null)
          ? {
              exerciseName: nextExerciseName,
              progressionTarget: nextExerciseName.trim()
                ? inferredTarget ?? exercise.progressionTarget ?? null
                : null,
              ...(nextExerciseName.trim()
                ? resolveOperatorExerciseDefaults(nextExerciseName, exercise.rowType ?? "AUTO")
                : {}),
            }
          : { exerciseName: nextExerciseName },
      );
    },
    [exercise.id, exercise.progressionTarget, exercise.rowType, onPatch, operatorStyle, sessionId],
  );

  const selectExerciseOption = useCallback(
    (option: ExerciseOption | null) => {
      const nextExerciseName = option?.name ?? "";
      patchExerciseName(nextExerciseName);
      setExerciseQuery(option?.name ?? "");
      exerciseInputRef.current?.blur();
      setExercisePickerOpen(!option);
    },
    [patchExerciseName],
  );

  useEffect(() => {
    const normalizedExerciseName = exercise.exerciseName.trim().toLowerCase();
    if (!normalizedExerciseName) {
      lastResolvedExerciseNameRef.current = "";
      setExercisePickerOpen(true);
      return;
    }
    if (lastResolvedExerciseNameRef.current !== normalizedExerciseName) {
      lastResolvedExerciseNameRef.current = normalizedExerciseName;
      if (hasExactExerciseOption) {
        setExercisePickerOpen(false);
      }
    }
  }, [exercise.exerciseName, hasExactExerciseOption]);

  useEffect(() => {
    if (!exercisePickerOpen) return;
    const frame = window.requestAnimationFrame(() => {
      exerciseInputRef.current?.focus();
      exerciseInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [exercisePickerOpen]);

  return (
    <article
      draggable
      onDragStart={() => onDragStart(sessionId, exercise.id)}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(sessionId, exercise.id);
      }}
      style={{
        boxShadow: highlighted ? "inset 0 0 0 2px var(--v2-accent)" : "none",
        borderRadius: "var(--v2-r-2)",
        padding: "var(--v2-s-2)",
        background: highlighted ? "var(--v2-accent-weak)" : "var(--v2-paper-2)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--v2-s-4)",
        transition: "box-shadow 200ms ease, background-color 200ms ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--v2-s-2)" }}>
        <div style={{ display: "flex", gap: "var(--v2-s-1)", flexWrap: "wrap" }}>
          {operatorStyle ? (
            <>
              <span className={operatorRowTypeTone(exercise.rowType)}>
                {operatorRowTypeLabel(exercise.rowType, locale)}
              </span>
              {operatorAutoRow && exercise.progressionTarget ? (
                <span className="label label-program label-sm">{progressionTargetLabel(exercise.progressionTarget)}</span>
              ) : null}
            </>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: "var(--v2-s-1)" }}>
          <V2IconBtn
            icon="expand_less"
            label={locale === "ko" ? "운동 위로 이동" : "Move exercise up"}
            onClick={() => onMove(sessionId, exercise.id, "up")}
            disabled={!canMoveUp}
          />
          <V2IconBtn
            icon="expand_more"
            label={locale === "ko" ? "운동 아래로 이동" : "Move exercise down"}
            onClick={() => onMove(sessionId, exercise.id, "down")}
            disabled={!canMoveDown}
          />
          <V2IconBtn
            icon="remove"
            label={locale === "ko" ? "운동 삭제" : "Delete exercise"}
            onClick={() => onDelete(sessionId, exercise.id)}
          />
        </div>
      </div>

      <div>
        <span className="v2-small" style={{ display: "block", marginBottom: "var(--v2-s-2)", color: "var(--v2-ink-2)" }}>
          {locale === "ko" ? "운동종목" : "Exercise"}
        </span>
        <div data-no-swipe="true">
          {selectedExerciseOption && !exercisePickerOpen ? (
            <V2SecondaryBtn
              full
              style={{ justifyContent: "space-between" }}
              onClick={() => {
                setExerciseQuery(selectedExerciseOption.name);
                setExercisePickerOpen(true);
              }}
            >
              <strong>
                {formatExerciseOptionLabel(selectedExerciseOption)}
              </strong>
              <span>
                {copy.programExerciseEditor.change}
              </span>
            </V2SecondaryBtn>
          ) : (
            <>
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    insetInlineStart: "0.82rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "0.9rem",
                    height: "0.9rem",
                    color: "var(--v2-ink-3)",
                    pointerEvents: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "var(--v2-t-18)", fontVariationSettings: "'wght' 400" }}>search</span>
                </span>
                <AppTextInput
                  ref={exerciseInputRef}
                  variant="compact"
                  type="text"
                  inputMode="search"
                  autoComplete="off"
                  value={exerciseQuery}
                  style={{ paddingInlineStart: "2.15rem", paddingInlineEnd: exerciseQuery.trim().length > 0 ? "2.25rem" : "var(--v2-s-4)" }}
                  placeholder={exerciseOptionsLoading && exerciseOptions.length === 0 ? copy.programExerciseEditor.loadingExercises : copy.programExerciseEditor.searchExercises}
                  onChange={(event) => {
                    const nextQuery = event.target.value;
                    setExerciseQuery(nextQuery);
                    patchExerciseName(nextQuery);
                    setExercisePickerOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    const first = filteredExerciseOptions[0] ?? null;
                    if (!first) return;
                    selectExerciseOption(first);
                  }}
                />
                {exerciseQuery.trim().length > 0 ? (
                  <button
                    type="button"
                    aria-label={copy.programExerciseEditor.clearQuery}
                    style={{
                      position: "absolute",
                      insetInlineEnd: "0.55rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: "24px",
                      height: "24px",
                      minHeight: "24px",
                      borderRadius: "999px",
                      background: "var(--v2-paper-3)",
                      color: "var(--v2-ink-2)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      lineHeight: 0,
                    }}
                    onClick={() => {
                      setExerciseQuery("");
                      patchExerciseName("");
                      setExercisePickerOpen(true);
                    }}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: "var(--v2-t-14)", fontVariationSettings: "'wght' 500" }}>close</span>
                  </button>
                ) : null}
              </div>

              <div
                role="listbox"
                aria-label={copy.programExerciseEditor.searchResults}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--v2-s-1)",
                  maxHeight: "200px",
                  overflowY: "auto",
                  paddingTop: "var(--v2-s-2)",
                }}
              >
                {exerciseOptionsLoading ? (
                  <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>{copy.programExerciseEditor.searching}</span>
                ) : filteredExerciseOptions.length === 0 ? (
                  <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>{copy.programExerciseEditor.noMatchingExercises}</span>
                ) : (
                  filteredExerciseOptions.map((option) => (
                    <V2SecondaryBtn
                      key={option.id}
                      full
                      style={{ justifyContent: "flex-start", minHeight: "40px" }}
                      onClick={() => {
                        selectExerciseOption(option);
                      }}
                    >
                      {formatExerciseOptionLabel(option)}
                    </V2SecondaryBtn>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {!operatorStyle ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
            <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
              {locale === "ko" ? "수행 방식" : "Execution Mode"}
            </span>
            <AppSelect
              value={exercise.mode}
              onChange={(event) =>
                onPatch(sessionId, exercise.id, {
                  mode: event.target.value === "MARKET" ? "MARKET" : "MANUAL",
                  marketTemplateSlug: event.target.value === "MARKET" ? exercise.marketTemplateSlug : null,
                })
              }
            >
              <option value="MARKET">{locale === "ko" ? "시중 프로그램 기반" : "Based on Market Program"}</option>
              <option value="MANUAL">{locale === "ko" ? "완전 수동" : "Fully Manual"}</option>
            </AppSelect>
          </label>

          {exercise.mode === "MARKET" && (
            <label style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
              <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
                {locale === "ko" ? "기반 프로그램" : "Base Program"}
              </span>
              <AppSelect
                value={exercise.marketTemplateSlug ?? ""}
                onChange={(event) => onPatch(sessionId, exercise.id, { marketTemplateSlug: event.target.value || null })}
              >
                <option value="">{locale === "ko" ? "선택" : "Select"}</option>
                {publicTemplates.map((template) => (
                  <option key={template.id} value={template.slug}>
                    {formatProgramDisplayName(template.name)}
                  </option>
                ))}
              </AppSelect>
            </label>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
            <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
              {locale === "ko" ? "행 타입" : "Row Type"}
            </span>
            <AppSelect
              value={exercise.rowType ?? "CUSTOM"}
              onChange={(event) => {
                const nextValue = String(event.target.value ?? "").trim().toUpperCase();
                const nextRowType: ProgramRowType = nextValue === "AUTO" ? "AUTO" : "CUSTOM";
                const inferredTarget =
                  nextRowType === "AUTO" ? inferProgressionTargetFromExerciseName(exercise.exerciseName) : null;
                onPatch(
                  sessionId,
                  exercise.id,
                  isOperatorAutoRowType(nextRowType)
                    ? {
                        rowType: nextRowType,
                        progressionTarget: inferredTarget ?? exercise.progressionTarget ?? null,
                        ...resolveOperatorExerciseDefaults(exercise.exerciseName, nextRowType),
                      }
                    : { rowType: nextRowType, progressionTarget: null },
                );
              }}
            >
              <option value="AUTO">Auto</option>
              <option value="CUSTOM">Custom</option>
            </AppSelect>
          </label>
          {operatorAutoRow ? (
            <label style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
              <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
                {locale === "ko" ? "진행 타겟" : "Progression Target"}
              </span>
              <AppSelect
                value={exercise.progressionTarget ?? ""}
                onChange={(event) =>
                  onPatch(sessionId, exercise.id, {
                    progressionTarget: (String(event.target.value ?? "").trim().toUpperCase() || null) as ProgramProgressionTarget | null,
                  })
                }
              >
                <option value="">{locale === "ko" ? "선택" : "Select"}</option>
                <option value="SQUAT">Squat</option>
                <option value="BENCH">Bench</option>
                <option value="DEADLIFT">Deadlift</option>
                <option value="PULL">Pull</option>
                <option value="OHP">OHP</option>
              </AppSelect>
            </label>
          ) : null}
          <div className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
            {operatorRowTypeHelp(exercise.rowType, locale)}
          </div>
          {operatorAutoDefaults ? (
            <div className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
              {locale === "ko" ? "Operator 자동 설정:" : "Operator defaults:"}{" "}
              <strong>
                {operatorAutoDefaults.sets}
                {locale === "ko" ? "세트 x " : " sets x "}
                {operatorAutoDefaults.reps}
                {locale === "ko" ? "회" : " reps"}
              </strong>
            </div>
          ) : null}
        </div>
      )}

      {!operatorAutoRow ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}>
          <AppNumberStepper label={locale === "ko" ? "세트" : "Sets"} value={exercise.sets} min={1} max={50} step={1} onChange={(next) => onPatch(sessionId, exercise.id, { sets: next })} />
          <AppNumberStepper label={locale === "ko" ? "횟수" : "Reps"} value={exercise.reps} min={1} max={100} step={1} onChange={(next) => onPatch(sessionId, exercise.id, { reps: next })} />
        </div>
      ) : null}

      <label>
        <span className="v2-small" style={{ display: "block", marginBottom: "var(--v2-s-2)", color: "var(--v2-ink-2)" }}>
          {locale === "ko" ? "메모" : "Note"}
        </span>
        <AppTextInput
          variant="workout"
          value={exercise.note}
          onChange={(event) => onPatch(sessionId, exercise.id, { note: event.target.value })}
          placeholder={locale === "ko" ? "세션 메모" : "Session note"}
        />
      </label>
    </article>
  );
});

export default ProgramExerciseEditorRow;
