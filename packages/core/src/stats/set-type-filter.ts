import { sql } from "drizzle-orm";
import { workoutSet } from "@workout/core/db/schema";

/**
 * 웜업 세트를 집계에서 빼는 술어. **집계 쿼리는 이걸 쓴다**(직접 조건을 쓰지 말 것).
 *
 * `IS DISTINCT FROM`인 이유는 `set_type`이 nullable이기 때문이다 —
 * `set_type <> 'WARMUP'`은 NULL 행을 통째로 떨어뜨리는데, NULL이 곧 작업 세트라
 * 레거시 로그 전부가 통계에서 사라진다. 이 한 글자 차이가 이 모듈이 존재하는
 * 이유의 절반이다(나머지 절반은 20곳 가까운 쿼리에 같은 조건을 복붙하지 않는 것).
 *
 * NULL-safe라는 성질은 LEFT JOIN에서도 값을 한다 — 보통 우측 테이블 조건을 WHERE에
 * 넣으면 조인이 INNER로 바뀌어 미매칭 행이 날아가는데, 미매칭 행의 set_type은 NULL이고
 * `NULL IS DISTINCT FROM 'WARMUP'`은 true라 그대로 남는다(prod에서 69=69 확인).
 *
 * **실패(FAILURE)는 빼지 않는다** — 실패해도 든 무게와 반복은 실제 수행이다.
 * 진행 판정에서만 신호로 쓴다(계획서 docs/set-type-plan.md §3.3).
 */
export function excludeWarmupSets() {
  return sql`${workoutSet.setType} is distinct from 'WARMUP'`;
}

/**
 * JS 루프용 같은 판정. SQL로 좁힐 수 없는 집계(근육군 볼륨·세션 요약)에서 쓴다.
 * `isWarmupSetType`을 직접 부르는 대신 이 이름을 쓰면 SQL 쪽과 짝이 보인다.
 */
export { isWarmupSetType } from "@workout/core/workout-set-type";
