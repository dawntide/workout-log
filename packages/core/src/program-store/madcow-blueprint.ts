// Madcow 5x5 주간 램프 테이블 — seed(정의 생성)와 문서가 함께 참조하는 단일 진실원.
//
// 구조: 월(볼륨) → 수(라이트) → 금(강도) 3일 주간 사이클. 각 리프트는 "그 주의 탑세트(top set of 5)"
// 하나를 기준 무게로 삼고, 모든 세션의 세트는 그 탑세트의 퍼센트로 파생된다(percent-derived).
// 그래서 슬롯 진행키는 요일이 아니라 **운동별로 공유**된다 — 월/수/금의 스쿼트가 같은 workKg를 읽는다.
//
// 진행: 금요일 1×3(탑세트 102.5%) 성공 시 다음 주 탑세트가 오른다. 원전은 "주당 약 2.5%"인데,
// 앱의 무게 그리드가 2.5kg라 퍼센트 누적은 경량 리프트에서 반올림에 흡수된다(45kg×1.025=46.1→45,
// 영구 정체). 그래서 **주당 +2.5kg 고정**으로 채택했다 — 스쿼트 원전 증량(주 5lb≈2.27kg)에 가장
// 가까운 그리드 근사이며, 상체는 원전보다 빠른 대신 정체 시 ×0.9 디로드 규칙이 흡수한다.

export type MadcowSetRow = {
  reps: number;
  percent: number;
  note: string;
};

/** 월(볼륨): 탑세트까지 5세트 램프. 간격 12.5%. */
export const MADCOW_VOLUME_RAMP: readonly number[] = [0.5, 0.625, 0.75, 0.875, 1.0];

/** 수(라이트) 스쿼트: 탑세트 없이 75%에서 멈춘다(회복일 성격). */
export const MADCOW_LIGHT_RAMP: readonly number[] = [0.5, 0.625, 0.75, 0.75];

/** 수(강도) OHP·데드리프트: 자체 탑세트까지 4세트 램프. */
export const MADCOW_WEDNESDAY_RAMP: readonly number[] = [0.625, 0.75, 0.875, 1.0];

/** 금(강도): 램프 4세트 → PR 트리플 → 백오프 8회. */
export const MADCOW_INTENSITY_RAMP: readonly number[] = [0.5, 0.625, 0.75, 0.875];
export const MADCOW_PR_TRIPLE_PERCENT = 1.025;
export const MADCOW_BACKOFF_PERCENT = 0.75;
export const MADCOW_BACKOFF_REPS = 8;

/** 주간 증량(그리드 근사 — 위 주석 참조)과 정체 규칙. */
export const MADCOW_WEEKLY_INCREASE_KG = 2.5;
export const MADCOW_FAIL_RESET_THRESHOLD = 2;
export const MADCOW_RESET_FACTOR = 0.9;

function rampSets(percents: readonly number[], reps: number, note: string): MadcowSetRow[] {
  return percents.map((percent, i) => ({
    reps,
    percent,
    note: i === percents.length - 1 && percent >= 1 ? `${note} · top set` : note,
  }));
}

/** 월요일(볼륨일) 5×5 램프. */
export function madcowVolumeSets(): MadcowSetRow[] {
  return rampSets(MADCOW_VOLUME_RAMP, 5, "volume ramp");
}

/** 수요일 스쿼트(라이트) 4×5. */
export function madcowLightSets(): MadcowSetRow[] {
  return rampSets(MADCOW_LIGHT_RAMP, 5, "light ramp");
}

/** 수요일 OHP·데드리프트(자체 탑세트) 4×5. */
export function madcowWednesdayTopSets(): MadcowSetRow[] {
  return rampSets(MADCOW_WEDNESDAY_RAMP, 5, "ramp");
}

/** 금요일(강도일): 램프 4×5 + PR 트리플 1×3 + 백오프 1×8. */
export function madcowIntensitySets(): MadcowSetRow[] {
  return [
    ...rampSets(MADCOW_INTENSITY_RAMP, 5, "ramp"),
    { reps: 3, percent: MADCOW_PR_TRIPLE_PERCENT, note: "PR triple" },
    { reps: MADCOW_BACKOFF_REPS, percent: MADCOW_BACKOFF_PERCENT, note: "back-off" },
  ];
}
