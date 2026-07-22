// Tactical Barbell 템플릿별 세션 클러스터 — 처방(generateSession)과 스토어 draft(model)가
// 함께 참조하는 단일 진실원. lib에 두어야 model(lib)이 program-engine(server)을 import하지 않는다.
//
// 세 템플릿은 **같은 6주 파형(70/80/90/75/85/95)과 같은 블록 증량 규칙**을 쓴다. 차이는 주당
// 세션 수와 세션별 리프트 구성뿐이다.
//  · operator(주 3일): 스쿼트·벤치 3회, 풀업 2회, 데드리프트 1회
//  · fighter(주 2일): 매 세션 4대 리프트 전부 — 주 3~4일을 낼 수 없는 스케줄용
//  · zulu(주 4일): A/B 교대. 전 종목이 주 2회 — Operator보다 스쿼트·벤치는 적고 데드·오버헤드는 많다
//
// reducer는 프로그램 정의를 못 보므로 주당 세션 수를 planParams.sessionsPerWeek로 받는다.
// 정의의 `schedule.sessionsPerWeek`가 프로그램 시작 시 그 값으로 흘러간다.

export type TacticalBarbellTarget = "SQUAT" | "BENCH" | "DEADLIFT" | "OHP" | "PULL";

export const TACTICAL_BARBELL_CLUSTERS: Record<string, TacticalBarbellTarget[][]> = {
  operator: [
    ["SQUAT", "BENCH", "PULL"],
    ["SQUAT", "BENCH", "PULL"],
    ["SQUAT", "BENCH", "DEADLIFT"],
  ],
  fighter: [
    ["SQUAT", "BENCH", "OHP", "DEADLIFT"],
    ["SQUAT", "BENCH", "OHP", "DEADLIFT"],
  ],
  zulu: [
    ["SQUAT", "BENCH", "PULL"],
    ["DEADLIFT", "OHP"],
    ["SQUAT", "BENCH", "PULL"],
    ["DEADLIFT", "OHP"],
  ],
};

/** 정의의 variant → 세션 클러스터. 미지정/미지의 값은 operator(주 3일)로 떨어진다. */
export function tacticalBarbellCluster(variant: unknown): TacticalBarbellTarget[][] {
  const key = String(variant ?? "").trim().toLowerCase();
  return TACTICAL_BARBELL_CLUSTERS[key] ?? TACTICAL_BARBELL_CLUSTERS.operator!;
}

/** 템플릿 variant의 주당 세션 수(Operator 3 / Fighter 2 / Zulu 4). */
export function tacticalBarbellSessionsPerWeek(variant: unknown): number {
  return tacticalBarbellCluster(variant).length;
}

/**
 * 세션 키(D1..Dn). Zulu는 A/B 교대지만 키까지 "A","B","A","B"로 두면 중복이 되어,
 * 세션 키로 정의를 찾는 경로(pickManualSession)가 fork 후 두 번째 A/B를 못 집는다.
 * 교대 구성은 클러스터가 이미 담고 있으므로 키는 항상 고유하게 D1..Dn을 쓴다.
 */
export function tacticalBarbellSessionKeys(variant: unknown): string[] {
  return tacticalBarbellCluster(variant).map((_, i) => `D${i + 1}`);
}
