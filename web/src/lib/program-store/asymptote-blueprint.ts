// Asymptote Protocol 슬롯 청사진 — lib(커스터마이즈 draft 생성)와 server(처방·진행)가
// 공유하는 단일 진실원. 기존에 model.ts(asymptoteSessionDrafts)와
// server/program-engine/asymptote.ts(ASYMPTOTE_SESSIONS)에 중복 하드코딩돼 있던 세션 구성을
// 여기로 통합한다. 무게 계산·AMRAP 판정 헬퍼는 server 쪽 asymptote.ts에 남는다.

export type AsymptoteLift = "SQUAT" | "BENCH" | "DEADLIFT" | "OHP" | "PULL";

/** 슬롯이 그 세션에서 맡는 역할(중강도/볼륨/폭발…). 커스터마이즈 시트에서 유저에게 노출된다. */
export type AsymptoteSlotRole = { ko: string; en: string };

export type AsymptoteLiftRow = {
  target: AsymptoteLift;
  name: string;
  sets: number;
  reps: number;
  coef: number;
  amrap: boolean;
  role: AsymptoteSlotRole;
  note?: string;
};

// 세션 1/2/3 = A/B/C. 각 슬롯의 흐름(sets·reps·coef·amrap)과 역할 라벨.
// Asymptote는 스쿼트 위주라 매 세션 스쿼트를 하되 중강도→볼륨→폭발로 성격이 흐른다.
export const ASYMPTOTE_SESSIONS: Record<number, AsymptoteLiftRow[]> = {
  1: [
    { target: "SQUAT", name: "Back Squat", sets: 4, reps: 3, coef: 0.875, amrap: true, role: { ko: "중강도·검증", en: "Moderate · Test" } },
    { target: "BENCH", name: "Bench Press", sets: 4, reps: 5, coef: 0.775, amrap: false, role: { ko: "볼륨", en: "Volume" } },
    { target: "PULL", name: "Weighted Pull-Up", sets: 4, reps: 3, coef: 0.85, amrap: true, role: { ko: "중강도·검증", en: "Moderate · Test" } },
  ],
  2: [
    { target: "SQUAT", name: "Back Squat", sets: 5, reps: 5, coef: 0.70, amrap: false, role: { ko: "볼륨", en: "Volume" } },
    { target: "DEADLIFT", name: "Deadlift", sets: 3, reps: 3, coef: 0.80, amrap: false, role: { ko: "고강도", en: "Heavy" } },
    { target: "PULL", name: "Weighted Pull-Up", sets: 3, reps: 8, coef: 0.65, amrap: false, role: { ko: "고볼륨", en: "High Volume" } },
  ],
  3: [
    { target: "SQUAT", name: "Back Squat", sets: 6, reps: 3, coef: 0.75, amrap: false, role: { ko: "폭발·스피드", en: "Explosive" }, note: "explosive" },
    { target: "BENCH", name: "Bench Press", sets: 4, reps: 3, coef: 0.85, amrap: true, role: { ko: "고강도·검증", en: "Heavy · Test" } },
    { target: "OHP", name: "Overhead Press", sets: 4, reps: 5, coef: 0.75, amrap: false, role: { ko: "스트렝스", en: "Strength" } },
  ],
};

export const ASYMPTOTE_SESSION_LABELS: Record<number, string> = { 1: "A", 2: "B", 3: "C" };

// 세션별 AMRAP 대상 리프트. ASYMPTOTE_SESSIONS(단일 진실원)에서 파생하므로 손으로 재타이핑하던
// 맵과 silent drift가 불가능하다(audit §3.7). 결과: { 1: ["SQUAT","PULL"], 2: [], 3: ["BENCH"] }
export const ASYMPTOTE_AMRAP_TARGETS_BY_SESSION: Record<number, AsymptoteLift[]> =
  Object.fromEntries(
    Object.entries(ASYMPTOTE_SESSIONS).map(([session, rows]) => [
      Number(session),
      rows.filter((row) => row.amrap).map((row) => row.target),
    ]),
  );
