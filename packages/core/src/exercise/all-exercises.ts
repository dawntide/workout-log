import {
  CURATED_EXERCISE_CATALOG,
  type ExerciseCatalogItem,
} from "./catalog";
import { OPEN_EXERCISE_CATALOG } from "./open-catalog";

/**
 * 전체 수록 카탈로그 = 수기 큐레이션 + 오픈 데이터.
 *
 * ⚠️ **서버 전용이다.** 오픈 데이터 723종이 딸려 오므로 클라이언트 컴포넌트에서
 * import하면 페이지마다 그만큼이 번들에 실린다 — 실측으로 gzip 10KB였고, 그 청크의
 * 95%가 이 배열이었다(계획서 §4 G6).
 *
 * 클라이언트가 필요로 하는 것은 장비 판별 하나뿐이라 `catalog.ts`가 경량
 * `open-equipment.ts`만 참조한다. 그쪽을 쓸 것.
 *
 * 소비처: seed(전역 exercise 테이블 채우기), 근육군 해석, 이름 해석.
 */
export const EXERCISE_CATALOG: readonly ExerciseCatalogItem[] = [
  // 큐레이션 항목이 **앞**이다 — 이름 해석이 첫 매치를 반환하므로 순서가 곧 우선순위다.
  ...CURATED_EXERCISE_CATALOG,
  ...OPEN_EXERCISE_CATALOG,
];

/**
 * 사용자 입력·프로그램 라벨을 전체 카탈로그의 정식 이름으로 해석한다.
 *
 * `catalog.ts`의 같은 이름 함수는 **수기 32종만** 본다(클라이언트 안전). 통계·기록
 * 식별처럼 오픈 데이터까지 봐야 하는 서버 경로가 이 함수를 쓴다.
 */
export function canonicalExerciseNameForInputAll(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;

  for (const item of EXERCISE_CATALOG) {
    if (item.name.toLowerCase() === normalized) return item.name;
    if (item.aliases.some((alias) => alias.toLowerCase() === normalized)) {
      return item.name;
    }
  }
  return null;
}
