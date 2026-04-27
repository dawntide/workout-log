"use client";

import dynamic from "next/dynamic";
import ExerciseEditorRow from "@/features/program-store/ui/program-exercise-editor-row";
import { Card } from "@/components/ui/card";
import { AppSelect, AppTextInput } from "@/components/ui/form-controls";
import { NumberPickerField } from "@/components/ui/number-picker-sheet";
import { formatProgramDisplayName } from "@/features/program-store/model/view";
import type { ExerciseOption } from "@/features/program-store/model/types";
import type { ProgramStoreCreateDraft } from "@/features/program-store/model/use-program-store-sheet-entry-controller";
import type {
  ProgramExerciseDraft,
  ProgramTemplate,
  SessionRule,
} from "@/lib/program-store/model";

const BottomSheet = dynamic(
  () => import("@/components/ui/bottom-sheet").then((mod) => mod.BottomSheet),
  { ssr: false },
);

type CreateProgramSheetProps = {
  locale: "ko" | "en";
  draft: ProgramStoreCreateDraft | null;
  saving: boolean;
  error: string | null;
  publicTemplates: ProgramTemplate[];
  exerciseOptions: ExerciseOption[];
  exerciseOptionsLoading: boolean;
  onClose: () => void;
  onSave: () => void;
  onChangeName: (name: string) => void;
  onChangeMode: (mode: ProgramStoreCreateDraft["mode"]) => void;
  onChangeSourceTemplate: (sourceTemplateSlug: string | null) => void;
  onChangeRuleType: (ruleType: SessionRule["type"]) => void;
  onChangeSessionCount: (count: number) => void;
  onSessionDrop: (sessionId: string, exerciseCount: number) => void;
  onPatchExercise: (
    sessionId: string,
    exerciseId: string,
    patch: Partial<ProgramExerciseDraft>,
  ) => void;
  onMoveExercise: (
    sessionId: string,
    exerciseId: string,
    direction: "up" | "down",
  ) => void;
  onDeleteExercise: (sessionId: string, exerciseId: string) => void;
  onDragStartExercise: (sessionId: string, exerciseId: string) => void;
  onDropExercise: (sessionId: string, exerciseId: string) => void;
  onAddExercise: (sessionId: string) => void;
};

export function CreateProgramSheet({
  locale,
  draft,
  saving,
  error,
  publicTemplates,
  exerciseOptions,
  exerciseOptionsLoading,
  onClose,
  onSave,
  onChangeName,
  onChangeMode,
  onChangeSourceTemplate,
  onChangeRuleType,
  onChangeSessionCount,
  onSessionDrop,
  onPatchExercise,
  onMoveExercise,
  onDeleteExercise,
  onDragStartExercise,
  onDropExercise,
  onAddExercise,
}: CreateProgramSheetProps) {
  return (
    <BottomSheet
      open={Boolean(draft)}
      title={locale === "ko" ? "새 프로그램 만들기" : "Create New Program"}
      description={
        locale === "ko"
          ? "공식 프로그램을 바탕으로 시작하거나 직접 새 구조를 만드세요."
          : "Start from an official program or build a fresh structure yourself."
      }
      onClose={onClose}
      closeLabel={locale === "ko" ? "닫기" : "Close"}
      primaryAction={
        draft
          ? {
              ariaLabel: saving
                ? locale === "ko"
                  ? "프로그램 생성 중"
                  : "Creating program"
                : locale === "ko"
                  ? "프로그램 생성"
                  : "Create Program",
              onPress: onSave,
              disabled: saving,
            }
          : null
      }
      footer={null}
    >
      {draft ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
          {error ? (
            <div
              role="alert"
              style={{
                border: "1px solid color-mix(in srgb, var(--color-danger) 34%, var(--color-border))",
                borderRadius: "8px",
                background: "var(--color-danger-weak)",
                color: "var(--color-danger-strong)",
                padding: "var(--space-sm) var(--space-md)",
                font: "var(--font-secondary)",
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          ) : null}

          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
            <span
              style={{
                fontFamily: "var(--font-label-family)",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
              }}
            >
              {locale === "ko" ? "프로그램 이름" : "Program Name"}
            </span>
            <AppTextInput
              variant="workout"
              value={draft.name}
              onChange={(event) => onChangeName(event.target.value)}
              placeholder={
                locale === "ko"
                  ? "예: 나만의 Upper/Lower"
                  : "e.g. My Upper/Lower Custom"
              }
            />
          </label>

          <div style={{ display: "flex", gap: "var(--space-xs)" }}>
            <button
              type="button"
              className={`btn btn-inline-action${draft.mode === "MARKET_BASED" ? " btn-inline-action-primary" : ""}`}
              onClick={() => onChangeMode("MARKET_BASED")}
            >
              {locale === "ko" ? "공식 기반" : "Start from Official"}
            </button>
            <button
              type="button"
              className={`btn btn-inline-action${draft.mode === "FULL_MANUAL" ? " btn-inline-action-primary" : ""}`}
              onClick={() => onChangeMode("FULL_MANUAL")}
            >
              {locale === "ko" ? "직접 구성" : "Build from Scratch"}
            </button>
          </div>

          {draft.mode === "MARKET_BASED" ? (
            <AppSelect
              label={locale === "ko" ? "기반 공식 프로그램" : "Base Program"}
              value={draft.sourceTemplateSlug ?? ""}
              onChange={(event) => onChangeSourceTemplate(event.target.value || null)}
            >
              <option value="">{locale === "ko" ? "선택" : "Select"}</option>
              {publicTemplates.map((template) => (
                <option key={template.id} value={template.slug}>
                  {formatProgramDisplayName(template.name)}
                </option>
              ))}
            </AppSelect>
          ) : null}

          <Card padding="md" elevated={false} tone="subtle">
            <h2
              style={{
                fontFamily: "var(--font-headline-family)",
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
                margin: "0 0 var(--space-sm)",
              }}
            >
              {locale === "ko" ? "세션 규칙" : "Session Rules"}
            </h2>
            <div style={{ display: "flex", gap: "var(--space-xs)", marginBottom: "var(--space-sm)" }}>
              <button
                type="button"
                className={`btn btn-inline-action${draft.rule.type === "AB" ? " btn-inline-action-primary" : ""}`}
                onClick={() => onChangeRuleType("AB")}
              >
                {locale === "ko" ? "A/B 분할" : "A/B Split"}
              </button>
              <button
                type="button"
                className={`btn btn-inline-action${draft.rule.type === "NUMERIC" ? " btn-inline-action-primary" : ""}`}
                onClick={() => onChangeRuleType("NUMERIC")}
              >
                {locale === "ko" ? "숫자 분할" : "Numeric Split"}
              </button>
            </div>
            {draft.rule.type === "NUMERIC" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                <span
                  style={{
                    fontFamily: "var(--font-label-family)",
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {locale === "ko" ? "세션 개수 (1~4)" : "Session Count (1-4)"}
                </span>
                <NumberPickerField
                  label={locale === "ko" ? "세션 개수" : "Session Count"}
                  value={draft.rule.count}
                  min={1}
                  max={4}
                  step={1}
                  variant="workout-number"
                  onChange={onChangeSessionCount}
                />
              </div>
            ) : null}
          </Card>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <h2
              style={{
                fontFamily: "var(--font-headline-family)",
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
                margin: 0,
              }}
            >
              {locale === "ko" ? "세션별 운동 배치" : "Exercise Layout by Session"}
            </h2>
            {draft.sessions.map((session) => (
              <Card
                key={session.id}
                padding="sm"
                tone="inset"
                elevated={false}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  onSessionDrop(session.id, session.exercises.length);
                }}
              >
                <header style={{ marginBottom: "var(--space-sm)" }}>
                  <span className="label label-program label-sm">
                    {locale === "ko" ? `세션 ${session.key}` : `Session ${session.key}`}
                  </span>
                </header>

                {session.exercises.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "var(--color-text-muted)", margin: "var(--space-xs) 0" }}>
                    {locale === "ko" ? "아직 추가된 운동이 없습니다." : "No exercises added yet."}
                  </p>
                ) : null}

                {session.exercises.map((exercise, exerciseIndex) => (
                  <ExerciseEditorRow
                    key={exercise.id}
                    sessionId={session.id}
                    exercise={exercise}
                    publicTemplates={publicTemplates}
                    exerciseOptions={exerciseOptions}
                    exerciseOptionsLoading={exerciseOptionsLoading}
                    canMoveUp={exerciseIndex > 0}
                    canMoveDown={exerciseIndex < session.exercises.length - 1}
                    onPatch={onPatchExercise}
                    onMove={onMoveExercise}
                    onDelete={onDeleteExercise}
                    onDragStart={onDragStartExercise}
                    onDrop={onDropExercise}
                  />
                ))}

                <button
                  type="button"
                  className="btn btn-secondary btn-full"
                  style={{ marginTop: "var(--space-sm)" }}
                  onClick={() => onAddExercise(session.id)}
                >
                  <span
                    className="material-symbols-outlined"
                    aria-hidden="true"
                    style={{ fontSize: 16, fontVariationSettings: "'wght' 400" }}
                  >
                    add
                  </span>
                  <span>{locale === "ko" ? "운동 추가" : "Add Exercise"}</span>
                </button>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}
