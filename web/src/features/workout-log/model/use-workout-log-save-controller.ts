import { useCallback, useRef, useState } from "react";
import { trackWorkoutUxEvent } from "@/lib/workout-ux-events";
import { WORKOUT_UX_EVENT_NAMES } from "@workout/core/observability/workout-ux-event-names";
import type {
  FailureProtocolResult,
  FailureProtocolTarget,
} from "@/components/ui/failure-protocol-sheet";
import {
  validateWorkoutDraft,
  validateWorkoutRecordEntryState,
} from "@/entities/workout-record";
import {
  resolveWorkoutLogProgressionOverride,
  type ProgressionProtocolMode,
} from "./progression";
import { submitWorkoutLogDraft } from "./save";
import {
  diagnoseSaveFailure,
  runSaveAttempt,
  SAVE_FAILURE_STAGES,
  shouldLogSaveFailure,
} from "./save-diagnostics";

type FailureProtocolSheetState = {
  title: string;
  description: string;
  mode: ProgressionProtocolMode;
  targets: FailureProtocolTarget[];
} | null;

import { useStore, useSetAtom } from "jotai";
import { draftAtom, visibleExercisesAtom, programEntryStateAtom, saveErrorAtom, workflowStateAtom } from "../store/workout-log-atoms";

type UseWorkoutLogSaveControllerInput = {
  locale: "ko" | "en";
  selectedPlan: {
    id: string;
    params?: Record<string, unknown> | null;
  } | null;
  bodyweightKg: number | null;
  persistenceKey: string | null;
  onSaved: (savedLogId: string | null) => void;
};

export function useWorkoutLogSaveController({
  locale,
  selectedPlan,
  bodyweightKg,
  persistenceKey,
  onSaved,
}: UseWorkoutLogSaveControllerInput) {
  const store = useStore();
  const setSaveError = useSetAtom(saveErrorAtom);
  const setWorkflowState = useSetAtom(workflowStateAtom);
  const [failureProtocolSheet, setFailureProtocolSheet] =
    useState<FailureProtocolSheetState>(null);
  const failureProtocolResolveRef =
    useRef<((result: FailureProtocolResult) => void) | null>(null);

  const requestFailureProtocolChoice = useCallback(
    (input: NonNullable<FailureProtocolSheetState>) =>
      new Promise<FailureProtocolResult>((resolve) => {
        failureProtocolResolveRef.current = (result) => {
          setFailureProtocolSheet(null);
          failureProtocolResolveRef.current = null;
          resolve(result);
        };
        setFailureProtocolSheet(input);
      }),
    [],
  );

  const handleFailureProtocolSelect = useCallback(
    (result: FailureProtocolResult) => {
      failureProtocolResolveRef.current?.(result);
    },
    [],
  );

  /**
   * 저장 실패를 한 군데서만 보고한다. 화면 문구·콘솔·텔레메트리가 갈라지면 사후 조사에서
   * 서로 다른 이야기를 하게 된다.
   *
   * `stage`가 실패한 계층을 말한다 — 입력 검증인지, 저장 호출 자체인지. 서버 액션은 예외를
   * 삼켜 `{success:false}`로 돌려주므로 Vercel 에러 그룹에 잡히지 않고, hobby 런타임 로그는
   * 보존되지 않는다. `ux_event_log`에 남기는 이 이벤트가 유일하게 살아남는 기록이다.
   */
  const reportSaveFailure = useCallback(
    (stage: string, error: unknown) => {
      const diagnosis = diagnoseSaveFailure(error, locale);
      // 원본 객체를 버리면 다음 조사도 폴백 문구 하나로 끝난다 — 실기기 원격 디버깅의 유일한 창.
      // 다만 입력 검증 거부는 정상 UX라 콘솔에 남기지 않는다: 화면에 이미 원인이 떠 있고,
      // 여기까지 물들이면 여정 E2E의 "콘솔 에러 0건" 가드가 상시 빨강이 되어 무의미해진다.
      if (shouldLogSaveFailure(stage)) {
        console.error("[workout-log] 저장 실패", stage, error);
      }
      setSaveError(diagnosis.message);
      setWorkflowState("editing");
      trackWorkoutUxEvent(WORKOUT_UX_EVENT_NAMES.saveFailed, { ...diagnosis.props, stage });
    },
    [locale, setSaveError, setWorkflowState],
  );

  const requestSave = useCallback(async () => {
    if (store.get(workflowStateAtom) === "saving") return;

    const draft = store.get(draftAtom);
    const visibleExercises = store.get(visibleExercisesAtom);
    const programEntryState = store.get(programEntryStateAtom);

    if (!draft) return;

    // 저장 성공률의 분모. 이 이벤트가 없으면 ux-snapshot의 저장 지표가 영영 0/0으로 남는다.
    trackWorkoutUxEvent(WORKOUT_UX_EVENT_NAMES.saveClicked);

    const entryErrors = validateWorkoutRecordEntryState(
      visibleExercises,
      programEntryState,
      locale,
    );
    if (entryErrors.length > 0) {
      reportSaveFailure(
        SAVE_FAILURE_STAGES.entryValidation,
        entryErrors[0] ??
          (locale === "ko" ? "입력값을 확인해 주세요." : "Check your inputs."),
      );
      return;
    }

    const validation = validateWorkoutDraft(draft, locale);
    if (!validation.valid) {
      reportSaveFailure(
        SAVE_FAILURE_STAGES.draftValidation,
        validation.errors[0] ??
          (locale === "ko" ? "입력값을 확인해 주세요." : "Check your inputs."),
      );
      return;
    }

    setWorkflowState("saving");
    setSaveError(null);

    // 저장 호출만 실패 경계 안에 둔다. 성공 후처리(축하 토스트·세션 화면 이동)가 같은
    // try 안에 있으면, 후처리가 던졌을 때 **DB에는 기록이 들어갔는데 화면은 "저장 실패"**를
    // 띄운다. REF5는 같은 생성 세션에 두 번째 기록을 허용하지 않아 재입력마저 거부된다.

    // 실패 지점을 따라다니는 커서. 진행 시트에서 던진 오류가 "submit"으로 찍히면 다음
    // 조사가 엉뚱한 계층을 판다.
    let failedStage: string = SAVE_FAILURE_STAGES.progression;

    const outcome = await runSaveAttempt({
      save: async (): Promise<{ cancelled: true } | { cancelled: false; saved: unknown }> => {
        const progression = await resolveWorkoutLogProgressionOverride({
          selectedPlanId: selectedPlan?.id,
          autoProgressionEnabled: selectedPlan?.params?.autoProgression === true,
          sessionWeek: draft.session.week,
          sessionDay: draft.session.day,
          visibleExercises,
          programEntryState,
          locale,
          requestChoice: requestFailureProtocolChoice,
        });
        if (progression.cancelled) return { cancelled: true };

        failedStage = SAVE_FAILURE_STAGES.submit;
        const saved = await submitWorkoutLogDraft({
          draft,
          bodyweightKg,
          progressionTargetDecisions: progression.decisions,
          persistenceKey,
        });
        return { cancelled: false, saved };
      },
      afterSave: (result) => {
        if (result.cancelled) {
          // 사용자가 시트를 닫았다 — 저장을 시도조차 하지 않았으므로 성공도 실패도 아니다.
          setWorkflowState("editing");
          return;
        }

        const savedResponse = result.saved as { log?: { id?: unknown } } | null | undefined;
        const savedLogId =
          typeof savedResponse?.log?.id === "string" ? savedResponse.log.id : null;

        setWorkflowState("done");
        trackWorkoutUxEvent(WORKOUT_UX_EVENT_NAMES.saveSucceeded);
        onSaved(savedLogId);
      },
    });

    if (outcome.status === "failed") {
      reportSaveFailure(failedStage, outcome.error);
      return;
    }

    if (outcome.status === "saved-with-post-error") {
      // 저장은 끝났다. 실패로 접으면 사용자가 이미 저장된 세션을 다시 입력하게 된다.
      console.error("[workout-log] 저장 후 화면 전환이 실패했다", outcome.error);
    }
  }, [
    bodyweightKg,
    locale,
    onSaved,
    persistenceKey,
    reportSaveFailure,
    requestFailureProtocolChoice,
    selectedPlan,
    setSaveError,
    setWorkflowState,
    store,
  ]);

  return {
    failureProtocolSheet,
    handleFailureProtocolSelect,
    requestSave,
  };
}
