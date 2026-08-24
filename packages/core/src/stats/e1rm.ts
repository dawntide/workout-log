/**
 * 추정 1RM(e1RM) 단일 소스.
 *
 * 이 계산은 한때 11곳에 복제돼 있었고 그중 셋은 공식이 서로 달랐다. 세트 타입(웜업)
 * 필터를 11곳에 각각 꽂는 대신 여기로 모은다 — 앞으로 공식·필터를 바꿀 때 한 곳만
 * 고치면 된다(계획서 docs/set-type-plan.md §3.1).
 *
 * ## 표준 규칙 — 흩어져 있던 특례를 승격한 것이다
 *
 * 1. 무게나 반복이 0 이하면 0. (추정할 근거가 없다.)
 * 2. **1렙은 무게 그대로.** Epley는 1렙에서 3.3%를 과대추정한다 — 1회 든 무게의 1RM은
 *    정의상 그 무게다. apps/api가 갖고 있던 특례가 옳았다.
 * 3. **15렙 초과는 15로 클램프.** 고반복에서 Epley의 신뢰도가 급락한다. web 모델이
 *    갖고 있던 특례가 옳았다.
 * 4. 그 외에는 Epley: `weight × (1 + reps / 30)`.
 *
 * 자중 종목 환산은 호출자 책임이다 — 입력은 이미 총부하(bodyweight + 외부중량)여야
 * 한다(`resolveLoggedTotalLoadKg`).
 */

const MAX_TRUSTED_REPS = 15;

export function estimateE1rmKg(totalLoadKg: number, reps: number): number {
  if (!Number.isFinite(totalLoadKg) || totalLoadKg <= 0) return 0;
  if (!Number.isFinite(reps) || reps <= 0) return 0;
  if (reps === 1) return totalLoadKg;
  const effectiveReps = Math.min(reps, MAX_TRUSTED_REPS);
  return totalLoadKg * (1 + effectiveReps / 30);
}

/** 소수 첫째 자리 반올림 — 차트·PR 표시가 쓰던 관례를 그대로 유지한다. */
export function estimateE1rmRounded(totalLoadKg: number, reps: number): number {
  return Math.round(estimateE1rmKg(totalLoadKg, reps) * 10) / 10;
}
