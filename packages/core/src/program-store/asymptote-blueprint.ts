import { EXERCISE_NAMES } from "../exercise/catalog";

// Asymptote Protocol 슬롯 청사진 — lib(커스터마이즈 draft 생성)와 server(처방·진행)가
// 공유하는 단일 진실원. 기존에 model.ts(asymptoteSessionDrafts)와
// server/program-engine/asymptote.ts(ASYMPTOTE_SESSIONS)에 중복 하드코딩돼 있던 세션 구성을
// 여기로 통합한다. 무게 계산·AMRAP 판정 헬퍼는 server 쪽 asymptote.ts에 남는다.

export type AsymptoteLift = "SQUAT" | "BENCH" | "DEADLIFT" | "OHP" | "PULL";

// 하이브리드(Asymptote × Async) 초기 TM 배수 — Async(공격적)와 원본 Asymptote(0.83 보수)의 절충.
// 플랜 시작 시 (최근 추정 1RM × 이 값)으로 TM을 잡는다. lib 단일 소스(서버/클라이언트 공유).
export const ASYMPTOTE_HYBRID_TM_PERCENT = 0.87;

/** 슬롯이 그 세션에서 맡는 역할(중강도/볼륨/폭발…). 커스터마이즈 시트에서 유저에게 노출된다. */
export type AsymptoteSlotRole = { ko: string; en: string };

// v0.5 프라이밍 탑세트(proximity patch §A): 강도 슬롯의 작업 세트 앞에 붙는 1세트.
// 자극·기술 연습이지 진행 신호가 아니다 — AMRAP 게이팅·failureStreak과 무관하고
// 그라인딩-정지가 유일한 밸브. cycles = 발동 사이클(적응 C1·디로드 C4 제외).
export type AsymptoteTopSetSpec = { reps: number; coef: number; cycles: number[] };

// 탑세트 처방 단일 소스 — TM×cycleCoef×1.0(사이클2 = TM×0.95, 사이클3 = TM×0.975 자연 파동).
export const ASYMPTOTE_TOP_SET: AsymptoteTopSetSpec = { reps: 3, coef: 1.0, cycles: [2, 3] };

// v0.5 세션A 스쿼트 계수 다이얼(proximity patch §B) — 스테이징, 기본 OFF(0.875 유지).
// 활성 조건(탑세트 도입 후 ≥1블록: C3 AMRAP 타겟 이상 + e1RM RISING/FLAT + 회복 정상)을
// 수동 판단으로 충족하면 0.90으로 올린다. 여기가 단일 소스 — 다른 곳에 0.875 재하드코딩 금지.
export const ASYMPTOTE_SQUAT_A_COEF = 0.875;

export type AsymptoteLiftRow = {
  target: AsymptoteLift;
  name: string;
  sets: number;
  reps: number;
  coef: number;
  amrap: boolean;
  role: AsymptoteSlotRole;
  note?: string;
  topSet?: AsymptoteTopSetSpec;
};

// 세션 1/2/3 = A/B/C. 각 슬롯의 흐름(sets·reps·coef·amrap)과 역할 라벨.
// Asymptote는 스쿼트 위주라 매 세션 스쿼트를 하되 중강도→볼륨→폭발로 성격이 흐른다.
// 탑세트는 강도 슬롯에만: SQ(세션A)·PULL(세션A)·BP(세션C). DL·OHP는 보조 역할 유지(§A.1).
export const ASYMPTOTE_SESSIONS: Record<number, AsymptoteLiftRow[]> = {
  1: [
    { target: "SQUAT", name: EXERCISE_NAMES.highBarBackSquat, sets: 4, reps: 3, coef: ASYMPTOTE_SQUAT_A_COEF, amrap: true, role: { ko: "중강도·검증", en: "Moderate · Test" }, topSet: ASYMPTOTE_TOP_SET },
    { target: "BENCH", name: EXERCISE_NAMES.benchPress, sets: 4, reps: 5, coef: 0.775, amrap: false, role: { ko: "볼륨", en: "Volume" } },
    { target: "PULL", name: EXERCISE_NAMES.weightedPullUp, sets: 4, reps: 3, coef: 0.85, amrap: true, role: { ko: "중강도·검증", en: "Moderate · Test" }, topSet: ASYMPTOTE_TOP_SET },
  ],
  2: [
    { target: "SQUAT", name: EXERCISE_NAMES.highBarBackSquat, sets: 5, reps: 5, coef: 0.70, amrap: false, role: { ko: "볼륨", en: "Volume" } },
    { target: "DEADLIFT", name: EXERCISE_NAMES.deadlift, sets: 3, reps: 3, coef: 0.80, amrap: false, role: { ko: "고강도", en: "Heavy" } },
    { target: "PULL", name: EXERCISE_NAMES.weightedPullUp, sets: 3, reps: 8, coef: 0.65, amrap: false, role: { ko: "고볼륨", en: "High Volume" } },
  ],
  3: [
    { target: "SQUAT", name: EXERCISE_NAMES.highBarBackSquat, sets: 6, reps: 3, coef: 0.75, amrap: false, role: { ko: "폭발·스피드", en: "Explosive" }, note: "explosive" },
    { target: "BENCH", name: EXERCISE_NAMES.benchPress, sets: 4, reps: 3, coef: 0.85, amrap: true, role: { ko: "고강도·검증", en: "Heavy · Test" }, topSet: ASYMPTOTE_TOP_SET },
    { target: "OHP", name: EXERCISE_NAMES.overheadPress, sets: 4, reps: 5, coef: 0.75, amrap: false, role: { ko: "스트렝스", en: "Strength" } },
  ],
};

export const ASYMPTOTE_SESSION_LABELS: Record<number, string> = { 1: "A", 2: "B", 3: "C" };

// 라벨("A"|"B"|"C") → 세션 번호 역방향 맵. 슬롯 스냅샷(slot.sessionKey)에서 청사진 행을
// 되찾을 때 쓴다 — ASYMPTOTE_SESSION_LABELS에서 파생하므로 drift 불가(audit §3.7).
export const ASYMPTOTE_SESSION_NUMBER_BY_LABEL: Record<string, number> = Object.fromEntries(
  Object.entries(ASYMPTOTE_SESSION_LABELS).map(([session, label]) => [label, Number(session)]),
);

// 세션별 AMRAP 대상 리프트. ASYMPTOTE_SESSIONS(단일 진실원)에서 파생하므로 손으로 재타이핑하던
// 맵과 silent drift가 불가능하다(audit §3.7). 결과: { 1: ["SQUAT","PULL"], 2: [], 3: ["BENCH"] }
export const ASYMPTOTE_AMRAP_TARGETS_BY_SESSION: Record<number, AsymptoteLift[]> =
  Object.fromEntries(
    Object.entries(ASYMPTOTE_SESSIONS).map(([session, rows]) => [
      Number(session),
      rows.filter((row) => row.amrap).map((row) => row.target),
    ]),
  );
