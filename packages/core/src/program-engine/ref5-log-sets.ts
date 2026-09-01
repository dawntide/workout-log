import type { Ref5EndReason } from "./ref5";
import type { WorkoutSetInput } from "../services/workout-log/upsert-log";

/**
 * REF5 생성 세션 스냅샷 → **저장 가능한 세트 페이로드**.
 *
 * REF5는 다른 프로그램과 달리 세트만으로 저장되지 않는다. 저장 경로가 세트마다
 * `meta.ref5`를 열어 **동결 처방과 대조**하고(`prescription`·`runtimeRevision*`·
 * `plannedReps`), 종료 사유로 PASS/HOLD/FAIL을 판정한 뒤 진행을 움직인다. 하나라도
 * 어긋나면 저장이 통째로 거부된다 — "missing REF5 set …", "terminationReason is
 * required for …" 같은 오류가 그것이다.
 *
 * 그래서 이 조립은 **웹 UI가 아닌 곳에서 REF5 세션을 저장하려는 모든 코드가 필요로 한다**
 * — 프로그램 워크플로 검증 스크립트, 데모 재생 시더가 지금 그렇다. 각자 한 벌씩 들고
 * 있으면 REF5 계약이 바뀔 때 한쪽만 고쳐지고 다른 쪽이 조용히 낡는다. 여기 한 벌만 둔다.
 *
 * 판정 규칙은 재현하지 않는다. 이 함수는 **처방을 그대로 옮겨 적을 뿐**이고, PASS/FAIL은
 * 저장 경로가 계산한다. 그래야 프로그램 로직이 바뀌면 호출자도 자동으로 그 로직을 따른다.
 */

/** 한 세트의 위치. 실제 수행값을 처방과 다르게 만들 때 쓰는 좌표다. */
export type Ref5SetContext = {
  exerciseIndex: number;
  exerciseName: string;
  /** 운동 안에서의 0-기반 순서. 저장되는 setNumber는 이 값 +1이다. */
  setIndex: number;
  plannedReps: number;
};

export type Ref5ExerciseContext = {
  exerciseIndex: number;
  exerciseName: string;
};

export type BuildRef5LogSetsOptions = {
  /**
   * 종료 사유를 **운동 단위로** 정한다. 세트 단위가 아닌 것은 의도다 — 저장 경로가
   * "한 운동의 모든 세트는 같은 종료 사유"를 강제하므로, 세트별로 열어 두면 호출자가
   * 만들 수 없는 값을 만들 수 있게 된다. 기본값은 `"NORMAL"`(처방대로 완수).
   */
  terminationReasonFor?: (context: Ref5ExerciseContext) => Ref5EndReason;
  /** 실제 수행 횟수. 기본값은 처방된 횟수 그대로. */
  actualRepsFor?: (context: Ref5SetContext) => number;
  /** 세트 완료 시각(ISO). 웹은 실제 완료 시각을 넣는다. */
  completedAt?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function buildRef5LogSets(
  snapshot: unknown,
  options: BuildRef5LogSetsOptions = {},
): WorkoutSetInput[] {
  const snap = asRecord(snapshot);
  const ref5 = asRecord(snap.ref5);
  const protocolVersion = String(ref5.protocolVersion ?? snap.protocolVersion ?? "");

  return asRecords(snap.exercises).flatMap((exercise, exerciseIndex) => {
    const exerciseName = String(exercise.exerciseName);
    // 동결 처방 원본. 저장 경로가 이것으로 세트의 정체(prescriptionId)를 확인한다.
    const prescription = asRecord(exercise.ref5);
    const terminationReason =
      options.terminationReasonFor?.({ exerciseIndex, exerciseName }) ?? "NORMAL";

    return asRecords(exercise.sets).map((set, setIndex) => {
      const plannedReps = Number(set.plannedReps ?? set.reps ?? 0);
      const actualReps =
        options.actualRepsFor?.({ exerciseIndex, exerciseName, setIndex, plannedReps }) ??
        plannedReps;
      return {
        exerciseName,
        sortOrder: exerciseIndex,
        setNumber: setIndex + 1,
        reps: actualReps,
        // 맨몸 운동은 총 부하가 아니라 **외부 부하**로 저장한다(체중은 저장 경로가 더한다).
        weightKg: Number(set.externalLoadKg ?? set.targetWeightKg ?? 0),
        rpe: 0,
        isExtra: false,
        meta: {
          ...asRecord(set.meta),
          ref5: {
            prescription,
            terminationReason,
            protocolVersion,
            actualStartAt: ref5.actualStartAt,
            startEventId: ref5.startEventId,
            completionEventId: `${ref5.startEventId}:completion`,
            runtimeRevisionBefore: ref5.runtimeRevisionBefore,
            runtimeRevisionAfter: ref5.runtimeRevisionAfter,
            plannedReps,
            actualReps,
            setIndex,
            ...(options.completedAt ? { completedAt: options.completedAt } : {}),
          },
        },
      } satisfies WorkoutSetInput;
    });
  });
}
