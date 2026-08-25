import { EXERCISE_EQUIPMENTS, type ExerciseEquipment } from "./catalog";

/**
 * 검색 시트에 노출하는 **부위 필터**.
 *
 * 카탈로그 755종의 `category`에서 뽑았지만 자동 파생이 아니라 **고정 목록**이다 —
 * 칩 순서가 화면 순서고, 자동 파생은 오픈 데이터 재생성 때 칩이 조용히 늘거나
 * 줄게 만든다. 대신 `search-filters.test.ts`가 두 방향을 모두 잠근다:
 * 죽은 칩(결과 0건)도, 숨은 무더기(칩 없는 대량 카테고리)도 실패로 잡는다.
 *
 * `Olympic Lift`는 카탈로그에 **1종**뿐이라 뺐다 — 칩 하나가 결과 1건을 위해
 * 가로 스크롤을 늘리는 것은 손해다. 필터 없이도 이름으로 바로 잡힌다.
 */
export const EXERCISE_CATEGORY_FILTERS = [
  "Legs",
  "Back",
  "Chest",
  "Shoulder",
  "Arm",
  "Core",
  "Glute",
] as const;

export type ExerciseCategoryFilter = (typeof EXERCISE_CATEGORY_FILTERS)[number];

/**
 * 검색 시트에 노출하는 **장비 필터**.
 *
 * `ExerciseEquipment`에서 `unknown`만 뺀 것이다. `unknown`은 "장비 미상"이 아니라
 * **우리 5종에 없는 장비**(케틀벨·밴드·메디신볼 등 207종)라, 사용자에게 "기타"로
 * 내밀면 그 안에서 다시 못 찾는다. 필터를 끄면(=전체) 전부 보이므로 도달 불가는
 * 아니다.
 */
export const EXERCISE_EQUIPMENT_FILTERS = EXERCISE_EQUIPMENTS.filter(
  (value): value is Exclude<ExerciseEquipment, "unknown"> => value !== "unknown",
);
