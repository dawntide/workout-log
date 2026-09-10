/**
 * 워크아웃 UX 퍼널 이벤트 이름의 단일 소스.
 *
 * 웹 클라이언트가 쏘고(`trackWorkoutUxEvent`), 두 곳이 센다 — 웹의 요약 함수와
 * ops UX 스냅샷 SQL. 세 곳이 문자열을 각자 적고 있었던 탓에 2026-03-24 IA 통합이
 * emit을 걷어냈을 때 소비처만 남아 퍼널 지표가 6개월간 0/0으로 표시됐다.
 * 이름을 여기 모아 두면 지울 때 타입이 깨져 소비처가 함께 드러난다.
 *
 * 새 이름을 넣으면 `web/scripts/workout-ux-event-emitters-guard.test.mjs`가
 * emit 지점을 요구한다. 반대로 기능이 사라져 emit을 뺄 때는 여기서도 지울 것.
 */
export const WORKOUT_UX_EVENT_NAMES = {
  logOpened: "workout_log_opened",
  generateApplyClicked: "workout_generate_apply_clicked",
  generateApplySucceeded: "workout_generate_apply_succeeded",
  addExerciseSheetOpened: "workout_add_exercise_sheet_opened",
  addExerciseAdded: "workout_add_exercise_added",
  saveClicked: "workout_save_clicked",
  saveSucceeded: "workout_save_succeeded",
  saveFailed: "workout_save_failed",
} as const;

export type WorkoutUxEventName =
  (typeof WORKOUT_UX_EVENT_NAMES)[keyof typeof WORKOUT_UX_EVENT_NAMES];
