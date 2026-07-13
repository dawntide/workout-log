"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createEmptyExerciseDraft,
  inferSessionDraftsFromTemplate,
  isRef5Template,
  makeSessionKeys,
  moveExerciseBetweenSessions,
  reconcileSessionsByKeys,
  reorderExercises,
  type ProgramExerciseDraft,
  type ProgramSessionDraft,
  type ProgramTemplate,
  type SessionRule,
} from "@workout/core/program-store/model";
import {
  buildInitialCreateDraft,
  type ProgramStoreCreateDraft,
  type ProgramStoreCustomizeDraft,
} from "./use-program-store-sheet-entry-controller";
import { formatProgramDisplayName } from "./view";

function patchExerciseInSessions(
  sessions: ProgramSessionDraft[],
  sessionId: string,
  exerciseId: string,
  patch: Partial<ProgramExerciseDraft>,
) {
  return sessions.map((session) => {
    if (session.id !== sessionId) return session;
    return {
      ...session,
      exercises: session.exercises.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, ...patch } : exercise,
      ),
    };
  });
}

function deleteExerciseFromSessions(
  sessions: ProgramSessionDraft[],
  sessionId: string,
  exerciseId: string,
) {
  return sessions.map((session) => {
    if (session.id !== sessionId) return session;
    return {
      ...session,
      exercises: session.exercises.filter((exercise) => exercise.id !== exerciseId),
    };
  });
}

function moveExerciseWithinSession(
  sessions: ProgramSessionDraft[],
  sessionId: string,
  exerciseId: string,
  direction: "up" | "down",
) {
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) return sessions;

  const currentIndex = session.exercises.findIndex(
    (exercise) => exercise.id === exerciseId,
  );
  if (currentIndex < 0) return sessions;

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  const targetExerciseId = session.exercises[targetIndex]?.id;
  if (!targetExerciseId) return sessions;

  return reorderExercises(sessions, sessionId, exerciseId, targetExerciseId);
}

type DragContext = {
  sourceSessionId: string;
  sourceExerciseId: string;
};

type UseProgramStoreEditorControllerInput = {
  locale: "ko" | "en";
  templates: ProgramTemplate[];
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setCustomizeDraft: React.Dispatch<
    React.SetStateAction<ProgramStoreCustomizeDraft | null>
  >;
  setCreateDraft: React.Dispatch<
    React.SetStateAction<ProgramStoreCreateDraft | null>
  >;
};

export function useProgramStoreEditorController({
  locale,
  templates,
  setError,
  setCustomizeDraft,
  setCreateDraft,
}: UseProgramStoreEditorControllerInput) {
  const [dragContext, setDragContext] = useState<DragContext | null>(null);
  const customizeExerciseRefs = useRef(new Map<string, HTMLDivElement>());
  const [pendingCustomizeScrollId, setPendingCustomizeScrollId] = useState<
    string | null
  >(null);
  const [recentlyAddedCustomizeExerciseId, setRecentlyAddedCustomizeExerciseId] =
    useState<string | null>(null);

  useEffect(() => {
    if (!pendingCustomizeScrollId) return;
    const node = customizeExerciseRefs.current.get(pendingCustomizeScrollId);
    if (!node) return;
    const frame = window.requestAnimationFrame(() => {
      node.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
      setRecentlyAddedCustomizeExerciseId(pendingCustomizeScrollId);
      setPendingCustomizeScrollId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingCustomizeScrollId]);

  useEffect(() => {
    if (!recentlyAddedCustomizeExerciseId) return;
    const timeout = window.setTimeout(() => {
      setRecentlyAddedCustomizeExerciseId((current) =>
        current === recentlyAddedCustomizeExerciseId ? null : current,
      );
    }, 1800);
    return () => window.clearTimeout(timeout);
  }, [recentlyAddedCustomizeExerciseId]);

  const registerCustomizeExerciseRef = useCallback(
    (exerciseId: string, node: HTMLDivElement | null) => {
      if (node) {
        customizeExerciseRefs.current.set(exerciseId, node);
      } else {
        customizeExerciseRefs.current.delete(exerciseId);
      }
    },
    [],
  );

  const applyDragReorder = useCallback(
    (targetSessionId: string, targetExerciseId: string) => {
      if (!dragContext) return;
      setCustomizeDraft((prev) => {
        if (!prev) return prev;
        const withinSame = dragContext.sourceSessionId === targetSessionId;
        const nextSessions = withinSame
          ? reorderExercises(
              prev.sessions,
              targetSessionId,
              dragContext.sourceExerciseId,
              targetExerciseId,
            )
          : moveExerciseBetweenSessions(
              prev.sessions,
              dragContext.sourceSessionId,
              dragContext.sourceExerciseId,
              targetSessionId,
              0,
            );

        return { ...prev, sessions: nextSessions };
      });
      setCreateDraft((prev) => {
        if (!prev) return prev;
        const withinSame = dragContext.sourceSessionId === targetSessionId;
        const nextSessions = withinSame
          ? reorderExercises(
              prev.sessions,
              targetSessionId,
              dragContext.sourceExerciseId,
              targetExerciseId,
            )
          : moveExerciseBetweenSessions(
              prev.sessions,
              dragContext.sourceSessionId,
              dragContext.sourceExerciseId,
              targetSessionId,
              0,
            );
        return { ...prev, sessions: nextSessions };
      });
      setDragContext(null);
    },
    [dragContext, setCreateDraft, setCustomizeDraft],
  );

  const startExerciseDrag = useCallback((sessionId: string, exerciseId: string) => {
    setDragContext({
      sourceSessionId: sessionId,
      sourceExerciseId: exerciseId,
    });
  }, []);

  const dropExerciseOnTarget = useCallback(
    (sessionId: string, exerciseId: string) => {
      applyDragReorder(sessionId, exerciseId);
    },
    [applyDragReorder],
  );

  const dropCustomizeExerciseAtSessionEnd = useCallback(
    (sessionId: string, exerciseCount: number) => {
      if (!dragContext) return;
      setCustomizeDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: moveExerciseBetweenSessions(
            prev.sessions,
            dragContext.sourceSessionId,
            dragContext.sourceExerciseId,
            sessionId,
            exerciseCount,
          ),
        };
      });
      setDragContext(null);
    },
    [dragContext, setCustomizeDraft],
  );

  const dropCreateExerciseAtSessionEnd = useCallback(
    (sessionId: string, exerciseCount: number) => {
      if (!dragContext) return;
      setCreateDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: moveExerciseBetweenSessions(
            prev.sessions,
            dragContext.sourceSessionId,
            dragContext.sourceExerciseId,
            sessionId,
            exerciseCount,
          ),
        };
      });
      setDragContext(null);
    },
    [dragContext, setCreateDraft],
  );

  const patchCustomizeExercise = useCallback(
    (sessionId: string, exerciseId: string, patch: Partial<ProgramExerciseDraft>) => {
      setCustomizeDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: patchExerciseInSessions(prev.sessions, sessionId, exerciseId, patch),
        };
      });
    },
    [setCustomizeDraft],
  );

  const moveCustomizeExercise = useCallback(
    (sessionId: string, exerciseId: string, direction: "up" | "down") => {
      setCustomizeDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: moveExerciseWithinSession(
            prev.sessions,
            sessionId,
            exerciseId,
            direction,
          ),
        };
      });
    },
    [setCustomizeDraft],
  );

  const deleteCustomizeExercise = useCallback(
    (sessionId: string, exerciseId: string) => {
      setCustomizeDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: deleteExerciseFromSessions(prev.sessions, sessionId, exerciseId),
        };
      });
    },
    [setCustomizeDraft],
  );

  const addCustomizeExercise = useCallback(
    (sessionId: string) => {
      const addedExercise = createEmptyExerciseDraft(null, "CUSTOM");
      setPendingCustomizeScrollId(addedExercise.id);
      setCustomizeDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: prev.sessions.map((entry) => {
            if (entry.id !== sessionId) return entry;
            return {
              ...entry,
              exercises: [...entry.exercises, addedExercise],
            };
          }),
        };
      });
    },
    [setCustomizeDraft],
  );

  const changeCustomizeName = useCallback(
    (name: string) => {
      setCustomizeDraft((prev) => (prev ? { ...prev, name } : prev));
    },
    [setCustomizeDraft],
  );

  const patchCreateExercise = useCallback(
    (sessionId: string, exerciseId: string, patch: Partial<ProgramExerciseDraft>) => {
      setCreateDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: patchExerciseInSessions(prev.sessions, sessionId, exerciseId, patch),
        };
      });
    },
    [setCreateDraft],
  );

  const moveCreateExercise = useCallback(
    (sessionId: string, exerciseId: string, direction: "up" | "down") => {
      setCreateDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: moveExerciseWithinSession(
            prev.sessions,
            sessionId,
            exerciseId,
            direction,
          ),
        };
      });
    },
    [setCreateDraft],
  );

  const deleteCreateExercise = useCallback(
    (sessionId: string, exerciseId: string) => {
      setCreateDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: deleteExerciseFromSessions(prev.sessions, sessionId, exerciseId),
        };
      });
    },
    [setCreateDraft],
  );

  const addCreateExercise = useCallback(
    (sessionId: string) => {
      setCreateDraft((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessions: prev.sessions.map((entry) => {
            if (entry.id !== sessionId) return entry;
            return {
              ...entry,
              exercises: [
                ...entry.exercises,
                createEmptyExerciseDraft(
                  prev.mode === "MARKET_BASED" ? prev.sourceTemplateSlug : null,
                ),
              ],
            };
          }),
        };
      });
    },
    [setCreateDraft],
  );

  const changeCreateName = useCallback(
    (name: string) => {
      setCreateDraft((prev) => (prev ? { ...prev, name } : prev));
    },
    [setCreateDraft],
  );

  const changeCreateMode = useCallback(
    (mode: ProgramStoreCreateDraft["mode"]) => {
      setCreateDraft((prev) => (prev ? { ...prev, mode } : prev));
    },
    [setCreateDraft],
  );

  const changeCreateSourceTemplate = useCallback(
    (nextSlug: string | null, templatesList: ProgramTemplate[]) => {
      const requestedTemplate =
        templatesList.find((template) => template.slug === nextSlug) ?? null;
      if (requestedTemplate && isRef5Template(requestedTemplate)) {
        setError(
          locale === "ko"
            ? "REF5는 전용 상태 머신을 사용하므로 일반 편집기로 변환할 수 없습니다."
            : "REF5 uses a dedicated state machine and cannot be converted in the general editor.",
        );
        return;
      }
      setCreateDraft((prev) => {
        if (!prev) return prev;
        const source = requestedTemplate;
        return {
          ...prev,
          sourceTemplateSlug: nextSlug,
          sessions: source ? inferSessionDraftsFromTemplate(source) : prev.sessions,
        };
      });
    },
    [locale, setCreateDraft, setError],
  );

  const changeCreateSessionCount = useCallback(
    (count: number) => {
      setCreateDraft((prev) => {
        if (!prev) return prev;
        const nextRule: SessionRule = { type: "NUMERIC", count };
        return {
          ...prev,
          rule: nextRule,
          sessions: reconcileSessionsByKeys(prev.sessions, makeSessionKeys(nextRule)),
        };
      });
    },
    [setCreateDraft],
  );

  const openCreateSheet = useCallback(() => {
    setError(null);
    setCreateDraft(buildInitialCreateDraft(templates));
  }, [setCreateDraft, setError, templates]);

  const openCustomizeDraftFromTemplate = useCallback(
    (template: ProgramTemplate) => {
      if (isRef5Template(template)) {
        setError(
          locale === "ko"
            ? "REF5 전용 편집기가 제공되기 전에는 커스터마이징할 수 없습니다."
            : "REF5 customization is unavailable until its dedicated editor is provided.",
        );
        return;
      }
      setCustomizeDraft({
        name:
          locale === "ko"
            ? `${formatProgramDisplayName(template.name)} 커스텀`
            : `${formatProgramDisplayName(template.name)} Custom`,
        baseTemplate: template,
        sessions: inferSessionDraftsFromTemplate(template),
      });
    },
    [locale, setCustomizeDraft, setError],
  );

  return {
    recentlyAddedCustomizeExerciseId,
    registerCustomizeExerciseRef,
    openCreateSheet,
    openCustomizeDraftFromTemplate,
    changeCustomizeName,
    patchCustomizeExercise,
    moveCustomizeExercise,
    deleteCustomizeExercise,
    addCustomizeExercise,
    changeCreateName,
    changeCreateMode,
    changeCreateSourceTemplate,
    changeCreateSessionCount,
    patchCreateExercise,
    moveCreateExercise,
    deleteCreateExercise,
    addCreateExercise,
    startExerciseDrag,
    dropExerciseOnTarget,
    dropCustomizeExerciseAtSessionEnd,
    dropCreateExerciseAtSessionEnd,
  };
}
