"use client";

import dynamic from "next/dynamic";
import ExerciseEditorRow from "@/features/program-store/ui/program-exercise-editor-row";
import {
  V2Card,
  V2Chip,
  V2SecondaryBtn,
  V2Segmented,
} from "@/components/v2/primitives";
import { AppSelect, AppTextInput } from "@/components/ui/form-controls";
import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import { formatProgramDisplayName } from "@/features/program-store/model/view";
import type { ExerciseOption } from "@/features/program-store/model/types";
import type { ProgramStoreCreateDraft } from "@/features/program-store/model/use-program-store-sheet-entry-controller";
import type {
  ProgramExerciseDraft,
  ProgramTemplate,
} from "@workout/core/program-store/model";

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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-4)",
          }}
        >
          {error ? (
            <div
              role="alert"
              className="v2-small"
              style={{
                boxShadow:
                  "inset 0 0 0 1px color-mix(in srgb, var(--v2-c-danger) 34%, var(--v2-hairline))",
                borderRadius: "var(--v2-r-1)",
                background:
                  "color-mix(in srgb, var(--v2-c-danger) 14%, var(--v2-paper))",
                color: "var(--v2-c-danger)",
                padding: "var(--v2-s-2) var(--v2-s-4)",
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          ) : null}

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--v2-s-1)",
            }}
          >
            <span className="v2-eyebrow" style={{ color: "var(--v2-ink-2)" }}>
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

          <V2Segmented
            options={[
              {
                value: "MARKET_BASED",
                label: locale === "ko" ? "공식 기반" : "Start from Official",
              },
              {
                value: "FULL_MANUAL",
                label: locale === "ko" ? "직접 구성" : "Build from Scratch",
              },
            ]}
            value={draft.mode}
            onChange={(v) => onChangeMode(v as "MARKET_BASED" | "FULL_MANUAL")}
            size="sm"
          />

          {draft.mode === "MARKET_BASED" ? (
            <AppSelect
              label={locale === "ko" ? "기반 공식 프로그램" : "Base Program"}
              value={draft.sourceTemplateSlug ?? ""}
              onChange={(event) =>
                onChangeSourceTemplate(event.target.value || null)
              }
            >
              <option value="">{locale === "ko" ? "선택" : "Select"}</option>
              {publicTemplates.map((template) => (
                <option key={template.id} value={template.slug}>
                  {formatProgramDisplayName(template.name)}
                </option>
              ))}
            </AppSelect>
          ) : null}

          <V2Card padding="var(--v2-s-4)" tone="inset">
            <h2
              className="v2-eyebrow"
              style={{ color: "var(--v2-ink-2)", margin: "0 0 var(--v2-s-2)" }}
            >
              {locale === "ko" ? "세션 규칙" : "Session Rules"}
            </h2>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--v2-s-1)",
              }}
            >
              <span className="v2-eyebrow" style={{ color: "var(--v2-ink-2)" }}>
                {locale === "ko" ? "세션 개수 (1~7)" : "Session Count (1-7)"}
              </span>
              <NumberKeypadField
                ariaLabel={locale === "ko" ? "세션 개수" : "Session Count"}
                value={draft.rule.count}
                min={1}
                max={7}
                onChange={onChangeSessionCount}
              />
            </div>
          </V2Card>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--v2-s-4)",
            }}
          >
            <h2
              className="v2-eyebrow"
              style={{ color: "var(--v2-ink-2)", margin: 0 }}
            >
              {locale === "ko"
                ? "세션별 운동 배치"
                : "Exercise Layout by Session"}
            </h2>
            {draft.sessions.map((session) => (
              <section
                key={session.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--v2-s-2)",
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  onSessionDrop(session.id, session.exercises.length);
                }}
              >
                <header>
                  <V2Chip tone="accent">
                    {locale === "ko"
                      ? `세션 ${session.key}`
                      : `Session ${session.key}`}
                  </V2Chip>
                </header>

                {session.exercises.length === 0 ? (
                  <p
                    style={{
                      fontSize: "var(--v2-t-small)",
                      color: "var(--v2-ink-3)",
                      textAlign: "center",
                      margin: 0,
                      padding: "var(--v2-s-4) 0",
                      background: "var(--v2-paper-2)",
                      borderRadius: "var(--v2-r-3)",
                    }}
                  >
                    {locale === "ko"
                      ? "아직 추가된 운동이 없습니다."
                      : "No exercises added yet."}
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

                <V2SecondaryBtn
                  full
                  icon="add"
                  onClick={() => onAddExercise(session.id)}
                >
                  {locale === "ko" ? "운동 추가" : "Add Exercise"}
                </V2SecondaryBtn>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}
