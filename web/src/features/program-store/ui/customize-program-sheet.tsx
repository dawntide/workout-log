"use client";

import dynamic from "next/dynamic";
import ExerciseEditorRow from "@/features/program-store/ui/program-exercise-editor-row";
import { Card } from "@/components/ui/card";
import { AppTextInput } from "@/components/ui/form-controls";
import type { ExerciseOption } from "@/features/program-store/model/types";
import type { ProgramStoreCustomizeDraft } from "@/features/program-store/model/use-program-store-sheet-entry-controller";
import type { ProgramExerciseDraft, ProgramTemplate } from "@/lib/program-store/model";

const BottomSheet = dynamic(
  () => import("@/components/ui/bottom-sheet").then((mod) => mod.BottomSheet),
  { ssr: false },
);

function operatorSessionMeta(sessionKey: string, locale: "ko" | "en") {
  const key = String(sessionKey ?? "").trim().toUpperCase();
  if (key === "D1") {
    return {
      title: "D1",
      description: locale === "ko" ? "스쿼트 + 벤치 + 풀업" : "Squat + Bench + Pull-Up",
    };
  }
  if (key === "D2") {
    return {
      title: "D2",
      description: locale === "ko" ? "스쿼트 + 벤치 + 풀업" : "Squat + Bench + Pull-Up",
    };
  }
  if (key === "D3") {
    return {
      title: "D3",
      description:
        locale === "ko"
          ? "스쿼트 + 벤치 + 데드리프트"
          : "Squat + Bench + Deadlift",
    };
  }
  if (key === "D4") {
    return {
      title: "D4",
      description: locale === "ko" ? "오버헤드 프레스" : "Overhead Press",
    };
  }
  return { title: sessionKey, description: "" };
}

type CustomizeProgramSheetProps = {
  locale: "ko" | "en";
  draft: ProgramStoreCustomizeDraft | null;
  saving: boolean;
  error: string | null;
  isOperatorCustomization: boolean;
  publicTemplates: ProgramTemplate[];
  exerciseOptions: ExerciseOption[];
  exerciseOptionsLoading: boolean;
  recentlyAddedCustomizeExerciseId: string | null;
  onClose: () => void;
  onSave: () => void;
  onChangeName: (name: string) => void;
  onSessionDrop: (sessionId: string, exerciseCount: number) => void;
  onRegisterExerciseRef: (exerciseId: string, node: HTMLDivElement | null) => void;
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

export function CustomizeProgramSheet({
  locale,
  draft,
  saving,
  error,
  isOperatorCustomization,
  publicTemplates,
  exerciseOptions,
  exerciseOptionsLoading,
  recentlyAddedCustomizeExerciseId,
  onClose,
  onSave,
  onChangeName,
  onSessionDrop,
  onRegisterExerciseRef,
  onPatchExercise,
  onMoveExercise,
  onDeleteExercise,
  onDragStartExercise,
  onDropExercise,
  onAddExercise,
}: CustomizeProgramSheetProps) {
  return (
    <BottomSheet
      open={Boolean(draft)}
      title={locale === "ko" ? "커스터마이징" : "Customize"}
      description={
        draft
          ? locale === "ko"
            ? `기본 구성 편집 · ${draft.baseTemplate.name}`
            : `Customize base setup · ${draft.baseTemplate.name}`
          : ""
      }
      onClose={onClose}
      closeLabel={locale === "ko" ? "닫기" : "Close"}
      primaryAction={
        draft
          ? {
              ariaLabel: saving
                ? locale === "ko"
                  ? "커스터마이징 프로그램 저장 중"
                  : "Saving customized program"
                : locale === "ko"
                  ? "커스터마이징 프로그램 저장"
                  : "Save Customized Program",
              onPress: onSave,
              disabled: saving,
            }
          : null
      }
      footer={null}
    >
      {draft ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
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
            <span style={{ color: "var(--text-session-context)", font: "var(--font-secondary)" }}>
              {locale === "ko" ? "프로그램 이름" : "Program Name"}
            </span>
            <AppTextInput
              variant="workout"
              value={draft.name}
              onChange={(event) => onChangeName(event.target.value)}
            />
          </label>

          <Card tone="subtle" padding="md" elevated={false}>
            <h2
              style={{
                fontFamily: "var(--font-headline-family)",
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--color-text-muted)",
                margin: "0 0 var(--space-xs)",
              }}
            >
              {locale === "ko" ? "기본 구성" : "Base Setup"}
            </h2>
            {isOperatorCustomization ? (
              <>
                <p style={{ fontSize: "13px", color: "var(--color-text-muted)", margin: "0 0 4px", lineHeight: 1.5 }}>
                  {locale === "ko"
                    ? "D1/D2는 스쿼트 + 벤치프레스 + 풀업, D3는 스쿼트 + 벤치프레스 + 데드리프트 구성을 기준으로 시작합니다."
                    : "D1/D2 start from Squat + Bench + Pull-Up, and D3 starts from Squat + Bench + Deadlift."}
                </p>
                <p style={{ fontSize: "13px", color: "var(--color-text-muted)", margin: 0, lineHeight: 1.5 }}>
                  {locale === "ko"
                    ? "세션 순서는 유지되고, 각 day 안에서 종목만 교체·추가·삭제할 수 있습니다."
                    : "Session order stays fixed, and you can swap, add, or remove exercises inside each day."}
                </p>
              </>
            ) : (
              <p style={{ fontSize: "13px", color: "var(--color-text-muted)", margin: 0, lineHeight: 1.5 }}>
                {locale === "ko"
                  ? "기존 세션 구성을 기반으로 시작합니다. 각 세션의 종목을 교체/추가/삭제할 수 있습니다."
                  : "Start from the current session structure. You can swap, add, or remove exercises in each session."}
              </p>
            )}
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
              {locale === "ko" ? "Day별 종목 변경" : "Adjust Exercises by Day"}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              {draft.sessions.map((session) => {
                const meta = operatorSessionMeta(session.key, locale);
                const summary = session.exercises
                  .map((exercise) => exercise.exerciseName.trim())
                  .filter(Boolean)
                  .join(" + ");

                return (
                  <Card
                    key={session.id}
                    padding="none"
                    tone="inset"
                    elevated={false}
                    style={{ padding: "var(--space-sm)", marginBottom: 0 }}
                    onDragOver={(event) => {
                      event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      onSessionDrop(session.id, session.exercises.length);
                    }}
                  >
                    <header style={{ marginBottom: "var(--space-sm)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <strong>{meta.title}</strong>
                        <span style={{ color: "var(--text-meta)", font: "var(--font-secondary)" }}>
                          {summary || meta.description}
                        </span>
                      </div>
                    </header>

                    {session.exercises.length === 0 ? (
                      <p style={{ fontSize: "13px", color: "var(--color-text-muted)", margin: "var(--space-xs) 0" }}>
                        {locale === "ko" ? "아직 추가된 운동이 없습니다." : "No exercises added yet."}
                      </p>
                    ) : null}

                    {session.exercises.map((exercise, exerciseIndex) => (
                      <div
                        key={exercise.id}
                        style={{ marginTop: exerciseIndex === 0 ? 0 : "var(--space-sm)" }}
                        ref={(node) => onRegisterExerciseRef(exercise.id, node)}
                      >
                        <ExerciseEditorRow
                          exercise={exercise}
                          sessionId={session.id}
                          publicTemplates={publicTemplates}
                          exerciseOptions={exerciseOptions}
                          exerciseOptionsLoading={exerciseOptionsLoading}
                          operatorStyle={true}
                          highlighted={recentlyAddedCustomizeExerciseId === exercise.id}
                          canMoveUp={exerciseIndex > 0}
                          canMoveDown={exerciseIndex < session.exercises.length - 1}
                          onPatch={onPatchExercise}
                          onMove={onMoveExercise}
                          onDelete={onDeleteExercise}
                          onDragStart={onDragStartExercise}
                          onDrop={onDropExercise}
                        />
                      </div>
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
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}
