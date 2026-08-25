import test from "node:test";
import assert from "node:assert/strict";

import {
  MUSCLE_FRESHNESS_DEFAULTS,
  aggregateSessionMuscleLoad,
  computeMuscleFreshness,
  decayAt,
  freshnessLookbackDays,
  type MuscleFreshnessInputRow,
} from "./muscle-freshness";

const NOW = new Date("2026-08-25T09:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 86_400_000;

function at(hoursAgo: number): string {
  return new Date(NOW.getTime() - hoursAgo * HOUR).toISOString();
}

/** 한 세션의 세트 행을 만든다. 스쿼트 = { Quad: 1.0, Glute: 0.5 }. */
function squatSets(logId: string, hoursAgo: number, sets: number, weightKg: number, reps: number) {
  return Array.from({ length: sets }, (): MuscleFreshnessInputRow => ({
    logId,
    performedAt: at(hoursAgo),
    exerciseName: "High-Bar Back Squat",
    category: "Legs",
    weightKg,
    reps,
  }));
}

function freshnessOf(result: { groups: Array<{ muscleGroup: string; freshnessPct: number }> }) {
  const map: Record<string, number> = {};
  for (const group of result.groups) map[group.muscleGroup] = group.freshnessPct;
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// G1 — 감쇠 모델 경계
// ─────────────────────────────────────────────────────────────────────────────

test("기록이 0건이면 전 부위 100%", () => {
  const result = computeMuscleFreshness({ sessions: [], now: NOW });
  for (const group of result.groups) {
    assert.equal(group.freshnessPct, 100, `${group.muscleGroup}가 100%가 아니다`);
    assert.equal(group.capacityKg, 0);
  }
  assert.equal(result.otherSetShare, 0);
});

test("capacity가 0인 부위는 100% — 나눗셈이 아니라 '안 쓴 부위'다", () => {
  // 8주 창 **밖**의 세션만 있다 → capacity 0. 감쇠도 이미 0이라 피로도 없다.
  const { sessions } = aggregateSessionMuscleLoad(squatSets("old", 70 * 24, 3, 100, 5));
  const result = computeMuscleFreshness({ sessions, now: NOW });
  assert.equal(freshnessOf(result).Quad, 100);
});

test("recoveryHours가 정확히 지나면 100%로 복귀한다", () => {
  const { sessions } = aggregateSessionMuscleLoad([
    ...squatSets("a", MUSCLE_FRESHNESS_DEFAULTS.recoveryHours, 3, 100, 5),
    // capacity를 만들되 감쇠 창 밖에 있는 세션 — 이게 없으면 capacity 0으로 빠져
    // "100%"가 감쇠 때문인지 capacity 때문인지 구분되지 않는다.
    ...squatSets("b", 20 * 24, 3, 100, 5),
  ]);
  const result = computeMuscleFreshness({ sessions, now: NOW });
  const quad = result.groups.find((group) => group.muscleGroup === "Quad")!;
  assert.ok(quad.capacityKg > 0, "capacity가 0이면 이 테스트는 아무것도 단언하지 않는다");
  assert.equal(quad.freshnessPct, 100);
  assert.equal(quad.fatigue, 0);
});

test("경과 시간이 recoveryHours의 절반이면 부하도 절반만 남는다", () => {
  const half = MUSCLE_FRESHNESS_DEFAULTS.recoveryHours / 2;
  assert.equal(decayAt(0, 144), 1);
  assert.equal(decayAt(half, 144), 0.5);
  assert.equal(decayAt(144, 144), 0);
  assert.equal(decayAt(200, 144), 0);
});

test("당일 고볼륨은 0%에서 멈춘다 — 음수로 내려가지 않는다", () => {
  const { sessions } = aggregateSessionMuscleLoad([
    // 방금 8주치를 한 번에 했다 → fatigue가 1을 크게 넘는다.
    ...squatSets("today", 0.5, 40, 200, 10),
    ...squatSets("past", 30 * 24, 3, 100, 5),
  ]);
  const result = computeMuscleFreshness({ sessions, now: NOW });
  const quad = result.groups.find((group) => group.muscleGroup === "Quad")!;
  assert.equal(quad.freshnessPct, 0);
  // 클램프 전 값은 남는다 — 근거 시트가 "얼마나 넘겼는지"를 보여줘야 한다.
  assert.ok(quad.fatigue > 1, `클램프 전 피로가 보존되지 않았다: ${quad.fatigue}`);
});

test("미래 시각 기록은 무시한다 — capacity에도 넣지 않는다", () => {
  const { sessions } = aggregateSessionMuscleLoad(squatSets("future", -48, 3, 100, 5));
  const result = computeMuscleFreshness({ sessions, now: NOW });
  const quad = result.groups.find((group) => group.muscleGroup === "Quad")!;
  assert.equal(quad.freshnessPct, 100);
  assert.equal(quad.capacityKg, 0, "미래 부하가 capacity에 섞이면 분모가 거짓이 된다");
});

test("recoveryHours가 0 이하면 감쇠가 즉시 0 — 0으로 나누지 않는다", () => {
  assert.equal(decayAt(0, 0), 0);
  assert.equal(decayAt(1, -5), 0);
  const { sessions } = aggregateSessionMuscleLoad(squatSets("a", 1, 3, 100, 5));
  const result = computeMuscleFreshness({ sessions, now: NOW, recoveryHours: 0 });
  assert.equal(freshnessOf(result).Quad, 100);
});

// ─────────────────────────────────────────────────────────────────────────────
// 기여도 분배 · 집계
// ─────────────────────────────────────────────────────────────────────────────

test("한 운동이 여러 부위에 가중치대로 분배된다", () => {
  // 스쿼트 100kg × 5회 × 3세트 = 1500kg → Quad 1500, Glute 750
  const { sessions, totalSets, otherSets } = aggregateSessionMuscleLoad(
    squatSets("a", 24, 3, 100, 5),
  );
  const quad = sessions.find((s) => s.muscleGroup === "Quad")!;
  const glute = sessions.find((s) => s.muscleGroup === "Glute")!;
  assert.equal(quad.loadKg, 1500);
  assert.equal(glute.loadKg, 750);
  assert.equal(quad.setCount, 3);
  assert.equal(totalSets, 3);
  assert.equal(otherSets, 0);
});

test("reps가 없거나 0인 세트는 집계에서 빠진다", () => {
  const { sessions, totalSets } = aggregateSessionMuscleLoad([
    { logId: "a", performedAt: at(24), exerciseName: "High-Bar Back Squat", category: "Legs", weightKg: 100, reps: null },
    { logId: "a", performedAt: at(24), exerciseName: "High-Bar Back Squat", category: "Legs", weightKg: 100, reps: 0 },
  ]);
  assert.deepEqual(sessions, []);
  assert.equal(totalSets, 0);
});

test("자중 종목은 meta.totalLoadKg로 환산한다 — 추가중량만 세지 않는다", () => {
  const { sessions } = aggregateSessionMuscleLoad([
    {
      logId: "a",
      performedAt: at(24),
      exerciseName: "Pull-Up",
      category: "Back",
      weightKg: 0,
      reps: 5,
      meta: { totalLoadKg: 74 },
    },
  ]);
  const back = sessions.find((s) => s.muscleGroup === "Back")!;
  // 74kg × 5회 = 370. weightKg(0)만 봤다면 0이 된다.
  assert.equal(back.loadKg, 370);
});

test("같은 세션의 여러 종목이 한 부위에 합산된다", () => {
  // 데드리프트{Back 1.0} + 풀업{Back 1.0} — 같은 logId면 Back 한 줄이어야 한다.
  const { sessions } = aggregateSessionMuscleLoad([
    { logId: "a", performedAt: at(24), exerciseName: "Deadlift", category: "Back", weightKg: 100, reps: 5 },
    { logId: "a", performedAt: at(24), exerciseName: "Pull-Up", category: "Back", weightKg: 0, reps: 5, meta: { totalLoadKg: 80 } },
  ]);
  const back = sessions.filter((s) => s.muscleGroup === "Back");
  assert.equal(back.length, 1, "같은 세션·부위가 두 줄로 쪼개졌다");
  assert.equal(back[0].loadKg, 900); // 500 + 400
  assert.equal(back[0].setCount, 2);
});

// ─────────────────────────────────────────────────────────────────────────────
// G3 — 매핑 커버리지 리포트
// ─────────────────────────────────────────────────────────────────────────────

test("Other로 떨어진 세트 비율을 보고한다", () => {
  const summary = aggregateSessionMuscleLoad([
    { logId: "a", performedAt: at(24), exerciseName: "High-Bar Back Squat", category: "Legs", weightKg: 100, reps: 5 },
    { logId: "a", performedAt: at(24), exerciseName: "완전히 모르는 운동", category: null, weightKg: 20, reps: 10 },
  ]);
  assert.equal(summary.totalSets, 2);
  assert.equal(summary.otherSets, 1);
  const result = computeMuscleFreshness({
    sessions: summary.sessions,
    now: NOW,
    totalSets: summary.totalSets,
    otherSets: summary.otherSets,
  });
  assert.equal(result.otherSetShare, 0.5);
});

// ─────────────────────────────────────────────────────────────────────────────
// G4 — 시간 주입 / 조회 창
// ─────────────────────────────────────────────────────────────────────────────

test("같은 입력에 다른 now를 주면 값이 단조 회복한다", () => {
  const { sessions } = aggregateSessionMuscleLoad([
    ...squatSets("a", 0, 3, 100, 5),
    ...squatSets("b", 20 * 24, 3, 100, 5),
  ]);
  let previous = -1;
  for (const hoursLater of [0, 24, 48, 72, 96, 120, 144]) {
    const now = new Date(NOW.getTime() + hoursLater * HOUR);
    const value = freshnessOf(computeMuscleFreshness({ sessions, now })).Quad;
    assert.ok(
      value >= previous,
      `${hoursLater}시간 뒤에 신선도가 떨어졌다: ${previous} → ${value}`,
    );
    previous = value;
  }
  assert.equal(previous, 100, "recoveryHours가 지나도 100%에 닿지 않는다");
});

test("조회 창은 capacity 창을 덮는다 — 6일로는 8주 capacity를 못 만든다", () => {
  // 계획서 §3.2의 "lookbackDays 기본 14일이면 충분"이 §3.1과 어긋났던 지점이다.
  assert.equal(freshnessLookbackDays(8, 144), 56);
  assert.equal(freshnessLookbackDays(1, 144), 7);
  // 회복 창이 capacity 창보다 길면 그쪽을 따른다.
  assert.equal(freshnessLookbackDays(1, 24 * 30), 30);
});

// ─────────────────────────────────────────────────────────────────────────────
// 골든 — prod 실측 형태(2026-08-25 기준 6종·주 3회)
// ─────────────────────────────────────────────────────────────────────────────

test("골든: 실사용 패턴에서 휴식 뒤 회복하고 연속 훈련 뒤 떨어진다", () => {
  // prod 실측 형태를 축약했다 — 주 3회 스쿼트, 8주.
  const rows: MuscleFreshnessInputRow[] = [];
  for (let week = 0; week < 8; week += 1) {
    for (const dayOffset of [0, 2, 4]) {
      const hoursAgo = (week * 7 + dayOffset) * 24 + 9;
      rows.push(...squatSets(`w${week}d${dayOffset}`, hoursAgo, 3, 100, 5));
    }
  }
  const { sessions } = aggregateSessionMuscleLoad(rows);

  // capacity = 8주 총부하 / 8 = (24세션 × 1500) / 8 = 4500kg/주
  const now = computeMuscleFreshness({ sessions, now: NOW });
  const quadNow = now.groups.find((group) => group.muscleGroup === "Quad")!;
  assert.equal(quadNow.capacityKg, 4500);

  // 훈련 직후(가장 최근 세션이 9시간 전)는 신선하지 않다.
  assert.ok(
    quadNow.freshnessPct < 70,
    `연속 훈련 중인데 ${quadNow.freshnessPct}%로 나온다 — 모델이 신호를 못 낸다`,
  );

  // 6일 쉬면 100%.
  const rested = computeMuscleFreshness({
    sessions,
    now: new Date(NOW.getTime() + 6 * DAY),
  });
  assert.equal(freshnessOf(rested).Quad, 100);

  // 근거가 남아 있어야 한다 — 이 값이 "왜 그 숫자인가"의 유일한 설명이다.
  assert.ok(quadNow.contributions.length > 0);
  assert.equal(
    quadNow.contributions[0].performedAt,
    at(9),
    "기여 세션이 최신순이 아니다",
  );
  const sum = quadNow.contributions.reduce((total, entry) => total + entry.fatigue, 0);
  assert.ok(
    Math.abs(sum - quadNow.fatigue) < 1e-9,
    "기여 합이 누적 피로와 다르다 — 근거 시트가 총합을 설명하지 못한다",
  );
});

test("부위마다 다른 값이 나온다 — 하나의 숫자로 뭉개지지 않는다", () => {
  // 어제 하체, 5일 전 가슴. "오늘 뭘 하지"에 답하려면 둘이 달라야 한다.
  const { sessions, totalSets, otherSets } = aggregateSessionMuscleLoad([
    ...squatSets("legs-recent", 24, 3, 100, 5),
    ...squatSets("legs-old", 30 * 24, 3, 100, 5),
    { logId: "chest-old", performedAt: at(5 * 24), exerciseName: "Bench Press", category: "Chest", weightKg: 100, reps: 5 },
    { logId: "chest-older", performedAt: at(30 * 24), exerciseName: "Bench Press", category: "Chest", weightKg: 100, reps: 5 },
  ]);
  const result = computeMuscleFreshness({ sessions, now: NOW, totalSets, otherSets });
  const map = freshnessOf(result);
  assert.ok(
    map.Chest > map.Quad,
    `5일 쉰 가슴(${map.Chest}%)이 어제 한 하체(${map.Quad}%)보다 신선하지 않다`,
  );
});
