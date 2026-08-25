/**
 * 세트 강도(RPE) 입력값의 저장 표현.
 *
 * 화면은 빈 셀을 0으로 들고 있고(입력 상태 표현), DB는 "값 없음"을 NULL로 적어야
 * 한다. 그 번역을 **전송 경계 한 곳**에서만 한다 — 화면 배열을 NULL 허용으로 바꾸면
 * 입력·포커스·정규화 전부에 null 분기가 번진다.
 *
 * 이 함수가 없던 동안 웹은 미입력을 그대로 0으로 보냈고, 평균 RPE가 0으로 희석됐다
 * (prod 실측 2026-08-25: 739세트 중 692가 rpe=0, 평균 0.16 — 실제 입력값 평균은 8.00).
 */

/** RPE 유효 범위. 0은 "값 없음"이라 저장 대상이 아니다. */
const MIN_RPE = 0;
const MAX_RPE = 10;

/**
 * 화면 값 → 저장할 rpe. 미입력(0·음수·비유한)은 **null**이다.
 *
 * 0.5 스냅은 두 클라이언트가 공유하는 규칙이다 — RPE는 0.5 단위로 기록한다.
 */
export function toStoredRpe(input: number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const value = Number(input);
  if (!Number.isFinite(value)) return null;
  const clamped = Math.max(MIN_RPE, Math.min(MAX_RPE, value));
  const snapped = Math.round(clamped * 2) / 2;
  return snapped > 0 ? snapped : null;
}
