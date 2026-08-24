/**
 * 세트 타입 — 한 세트가 "작업 세트"인지, 웜업인지, 실패인지.
 *
 * `workout_set.set_type` 컬럼의 값 집합이자 클라이언트가 주고받는 표현이다.
 * **NULL = 작업 세트**로 두는 것이 이 설계의 핵심이다 — 기존 로그 전부가 자동으로
 * 작업 세트가 되므로 백필이 필요 없고, 웜업 제외 필터도
 * `set_type IS DISTINCT FROM 'WARMUP'`으로 끝난다(계획서 docs/set-type-plan.md §3.2).
 *
 * `isExtra`와는 **다른 축**이다. `isExtra`는 "사용자가 처방 밖에 추가한 운동"(운동 단위)이고,
 * 이건 세트 단위 성격이다. 둘은 독립적으로 붙는다.
 */

export const WORKOUT_SET_TYPES = ["WARMUP", "FAILURE"] as const;

/** 작업 세트는 값이 없다(null) — 별도 리터럴을 두지 않는다. */
export type WorkoutSetType = (typeof WORKOUT_SET_TYPES)[number];

const VALID = new Set<string>(WORKOUT_SET_TYPES);

/**
 * 미지/레거시 값을 작업 세트(null)로 떨어뜨린다.
 *
 * 구 클라이언트가 모르는 타입을 보내거나 DB에 손으로 넣은 값이 있어도 통계가
 * 깨지지 않게 하는 것이 목적이다. 대소문자는 흡수한다(TUI·web·수동 import 혼재).
 */
export function normalizeWorkoutSetType(value: unknown): WorkoutSetType | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  return VALID.has(upper) ? (upper as WorkoutSetType) : null;
}

/** 웜업은 볼륨·e1RM·진행 판정에서 빠진다. 실패는 빠지지 않는다(실제로 든 무게다). */
export function isWarmupSetType(value: unknown): boolean {
  return normalizeWorkoutSetType(value) === "WARMUP";
}
