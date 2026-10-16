import type { PlannedExercise } from "./generateSession";
import type { ManualSession } from "../program-dsl/schema";

/**
 * Snapshot v3 — 비-REF5 `generateSession`이 생산하고 `generated_session.snapshot`(jsonb)에
 * 저장하는 세션 처방 형태. REF5는 별도 형태(`Ref5SessionSnapshot`, schemaVersion 5 — 이어받은
 * v1.4 세션은 4)를 쓴다.
 *
 * 이 타입은 엔진의 *생산* 계약이다(엔진이 필드를 구성한다). 저장된 jsonb를 되읽는 소비자는
 * 레거시(v1/v2)·REF5·유저 fork 형태가 섞여 있을 수 있으므로 이 타입을 그대로 씌우지 말고
 * 관용적으로 파싱해야 한다(READ 경로 전환은 후속 Phase).
 */

export type SnapshotPlanRef = {
  id: string;
  type: string;
  name: string;
};

export type SnapshotProgramRef = {
  slug: string;
  name: string;
  type: string;
  version: number;
};

export type SnapshotBlock = {
  target: string;
  program: SnapshotProgramRef;
  /** program_version.definition(jsonb) — LOGIC 디스패처가 관용적으로 읽는다(kind 판별). */
  definition: unknown;
  defaults?: Record<string, unknown>;
  params?: Record<string, unknown>;
  /** REPLACE_EXERCISE 오버라이드가 부착하는 치환 마킹. */
  replacements?: {
    mainExercise?: string;
    source?: { overrideId: string };
  };
};

/**
 * LOGIC 디스패처(`plannedExercisesFromBlocks`)가 실제로 읽는 블록 필드만 담은 입력 계약.
 * 저장 스냅샷 블록(`SnapshotBlock`, program 포함)뿐 아니라 미리보기 경로가 program 없이
 * 조립하는 임시 블록도 이 형태에 맞으므로, 생성기는 SnapshotV3 전체가 아니라 이 형태를 받는다.
 */
export type LogicBlockSource = {
  target?: string;
  definition: unknown;
  params?: Record<string, unknown>;
  defaults?: Record<string, unknown>;
};

export type SnapshotAccessorySet = {
  setNumber?: number;
  reps?: number;
  weightKg?: number;
  rpe?: number;
};

export type SnapshotAccessory = {
  exerciseName: string;
  sets: SnapshotAccessorySet[];
  order: number;
  source: { overrideId: string };
};

export type SnapshotOverrideApplied = {
  overrideId: string;
  op: string;
  target?: string;
};

/**
 * 엔진이 만들던 느슨한 스냅샷을 대체하는 생산 타입. 초기 리터럴은 공통 필드만 담고, kind별 경로가
 * 아래 optional 필드를 조건부로 덧붙인다(COMPOSITE/LOGIC→blocks, MANUAL→manualSession/program 등).
 */
export type SnapshotV3 = {
  schemaVersion: 3;
  sessionKey: string;
  sessionDate: string;
  timezone: string;
  week: number;
  day: number;
  plan: SnapshotPlanRef;
  exercises: PlannedExercise[];
  // COMPOSITE / LOGIC(SINGLE) 경로
  blocks?: SnapshotBlock[];
  // MANUAL 경로
  program?: SnapshotProgramRef;
  manualSession?: ManualSession | null;
  manualSessionKey?: string;
  manualError?: string;
  // 세션 수준 피드백 표식(F3 보류 AMRAP 배너 · F4 라이트 블록 배지)
  amrapDeferred?: boolean;
  lightBlockMode?: boolean;
  // 오버라이드 적용 결과
  overridesApplied?: SnapshotOverrideApplied[];
  accessories?: SnapshotAccessory[];
};
