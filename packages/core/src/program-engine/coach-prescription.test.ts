import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  COACH_IDENTIFIERS,
  COACH_LIMITS,
  buildCoachSnapshot,
  buildEmptyCoachSnapshot,
  coachSnapshotMatchesPrescription,
  isCoachDateKey,
  isCoachPlanParams,
  isCoachProgramDefinition,
  readCoachSessionMeta,
  validateCoachPrescription,
  type CoachPrescription,
} from "./coach-prescription";
import { isRef5PlanParams } from "./ref5-integration";
import { extractSessionDate } from "../session-key";

const PLAN = { id: "plan-1", type: "MANUAL", name: "코치 플랜" };

type RawSet = { reps: number; targetWeightKg: number; rpe?: number; note?: string };
type RawBody = {
  rationale: string;
  exercises: Array<{ exerciseName: string; role?: string; sets: RawSet[] }>;
};

function validBody(): RawBody {
  return {
    rationale: "지난 세션 3×3 90 RPE 8. 같은 무게로 한 세트 추가.",
    exercises: [
      {
        exerciseName: "Back Squat",
        role: "MAIN",
        sets: [
          { reps: 3, targetWeightKg: 90, rpe: 8, note: "하이바" },
          { reps: 3, targetWeightKg: 90 },
          { reps: 5, targetWeightKg: 80, rpe: 7.5 },
        ],
      },
      { exerciseName: "Pull-Up", sets: [{ reps: 8, targetWeightKg: 0 }] },
    ],
  };
}

function mustValidate(raw: unknown): CoachPrescription {
  const result = validateCoachPrescription(raw);
  assert.equal(result.ok, true, result.ok ? "" : result.errors.join("\n"));
  return (result as { value: CoachPrescription }).value;
}

function errorsOf(raw: unknown): string[] {
  const result = validateCoachPrescription(raw);
  assert.equal(result.ok, false, "거부돼야 하는 처방이 통과했다");
  return (result as { errors: string[] }).errors;
}

test("코치 플랜 판별 — programFamily가 coach일 때만", () => {
  assert.equal(isCoachPlanParams({ programFamily: "coach" }), true);
  assert.equal(isCoachPlanParams({ programFamily: " Coach " }), true);
  assert.equal(isCoachPlanParams({ programFamily: "ref5" }), false);
  assert.equal(isCoachPlanParams({}), false);
  assert.equal(isCoachPlanParams(null), false);
  assert.equal(isCoachPlanParams([]), false);
});

test("코치 플랜과 REF5 플랜은 서로 겹치지 않는다", () => {
  // 코치 경로가 REF5 플랜에 닿으면 안 된다(제안서 §5-3).
  const coach = { programFamily: COACH_IDENTIFIERS.family, sessionKeyMode: "DATE" };
  const ref5 = { programFamily: "ref5", ref5: { protocolVersion: "1.6" } };
  assert.equal(isRef5PlanParams(coach), false);
  assert.equal(isCoachPlanParams(ref5), false);
});

test("프로그램 정의로도 코치 템플릿을 가린다", () => {
  assert.equal(isCoachProgramDefinition("coach-prescribed", {}), true);
  assert.equal(isCoachProgramDefinition("fork-123", { kind: "manual", programFamily: "coach" }), true);
  assert.equal(isCoachProgramDefinition("manual", { kind: "manual", sessions: [] }), false);
});

test("시드 템플릿의 slug·family가 COACH_IDENTIFIERS와 같다", () => {
  // seed.ts는 이 모듈을 import하지 않고 리터럴을 쓴다(seed 추적 목록 가드 때문).
  // 값이 어긋나면 스토어에서 만든 플랜이 코치 플랜으로 인식되지 않는다.
  const seedSource = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../db/seed.ts"),
    "utf8",
  );
  assert.ok(
    seedSource.includes(`upsertTemplate("${COACH_IDENTIFIERS.slug}"`),
    "seed.ts가 코치 템플릿 slug를 시드하지 않는다",
  );
  assert.ok(
    seedSource.includes(`programFamily: "${COACH_IDENTIFIERS.family}", sessions: []`),
    "seed.ts의 코치 정의 programFamily가 COACH_IDENTIFIERS.family와 다르다",
  );
});

test("날짜 키 — 실제 달력 날짜만", () => {
  assert.equal(isCoachDateKey("2026-11-12"), true);
  assert.equal(isCoachDateKey("2028-02-29"), true);
  assert.equal(isCoachDateKey("2026-02-30"), false);
  assert.equal(isCoachDateKey("2026-13-01"), false);
  assert.equal(isCoachDateKey("2026-1-1"), false);
  assert.equal(isCoachDateKey("COACH:2026-11-12"), false);
  assert.equal(isCoachDateKey(20261112), false);
});

test("정상 처방은 그대로 통과한다 — 값을 고치지 않는다", () => {
  const value = mustValidate(validBody());
  assert.equal(value.exercises.length, 2);
  assert.deepEqual(value.exercises[0]!.sets[0], {
    reps: 3,
    targetWeightKg: 90,
    rpe: 8,
    note: "하이바",
  });
  // 선택 필드는 없으면 만들지 않는다.
  assert.deepEqual(value.exercises[0]!.sets[1], { reps: 3, targetWeightKg: 90 });
  // role 기본값은 MAIN.
  assert.equal(value.exercises[1]!.role, "MAIN");
});

test("근거는 필수다 — 사용자가 시작 전에 읽는다", () => {
  assert.match(errorsOf({ ...validBody(), rationale: "  " }).join("\n"), /rationale/);
  assert.match(errorsOf({ exercises: validBody().exercises }).join("\n"), /rationale/);
  const long = "가".repeat(COACH_LIMITS.maxRationaleLength + 1);
  assert.match(errorsOf({ ...validBody(), rationale: long }).join("\n"), /2000자/);
});

test("범위 밖은 고치지 않고 거부한다", () => {
  const cases: Array<[string, (body: RawBody) => void, RegExp]> = [
    ["반복 0", (b) => (b.exercises[0]!.sets[0]!.reps = 0), /reps/],
    ["반복 51", (b) => (b.exercises[0]!.sets[0]!.reps = 51), /reps/],
    ["반복 소수", (b) => (b.exercises[0]!.sets[0]!.reps = 2.5), /reps/],
    ["무게 음수", (b) => (b.exercises[0]!.sets[0]!.targetWeightKg = -1), /targetWeightKg/],
    ["무게 501", (b) => (b.exercises[0]!.sets[0]!.targetWeightKg = 501), /targetWeightKg/],
    ["RPE 11", (b) => (b.exercises[0]!.sets[0]!.rpe = 11), /rpe/],
    ["RPE 0.25 단위", (b) => (b.exercises[0]!.sets[0]!.rpe = 8.25), /rpe/],
    ["세트 0개", (b) => (b.exercises[0]!.sets = []), /sets/],
    ["종목 이름 없음", (b) => (b.exercises[0]!.exerciseName = " "), /exerciseName/],
  ];
  for (const [label, mutate, pattern] of cases) {
    const body = validBody();
    mutate(body);
    assert.match(errorsOf(body).join("\n"), pattern, label);
  }
});

test("개수 한도 — 종목 12개, 종목당 12세트", () => {
  const set = { reps: 5, targetWeightKg: 50 };
  const tooManyExercises = {
    rationale: "x",
    exercises: Array.from({ length: COACH_LIMITS.maxExercises + 1 }, (_, i) => ({
      exerciseName: `Exercise ${i}`,
      sets: [set],
    })),
  };
  assert.match(errorsOf(tooManyExercises).join("\n"), /12개 이하/);

  const tooManySets = {
    rationale: "x",
    exercises: [
      {
        exerciseName: "Back Squat",
        sets: Array.from({ length: COACH_LIMITS.maxSetsPerExercise + 1 }, () => set),
      },
    ],
  };
  assert.match(errorsOf(tooManySets).join("\n"), /sets는 12개 이하/);
  assert.match(errorsOf({ rationale: "x", exercises: [] }).join("\n"), /1개 이상/);
});

test("문자열 숫자를 숫자로 바꿔 주지 않는다", () => {
  const body = validBody() as unknown as { exercises: Array<{ sets: Array<Record<string, unknown>> }> };
  body.exercises[0]!.sets[0]!.reps = "3";
  body.exercises[0]!.sets[0]!.targetWeightKg = "90";
  const errors = errorsOf(body).join("\n");
  assert.match(errors, /reps/);
  assert.match(errors, /targetWeightKg/);
});

test("모르는 필드는 거부한다 — weightKg 같은 오타가 조용히 버려지지 않는다", () => {
  const body = validBody() as unknown as { exercises: Array<Record<string, unknown>> };
  (body.exercises[0]!.sets as Array<Record<string, unknown>>)[0]!.weightKg = 90;
  body.exercises[1]!.progressionTarget = "SQUAT";
  const errors = errorsOf(body).join("\n");
  assert.match(errors, /sets\[0\]\.weightKg는 모르는 필드/);
  assert.match(errors, /exercises\[1\]\.progressionTarget는 모르는 필드/);
});

test("같은 종목을 두 번 넣으면 거부한다", () => {
  const body = validBody();
  body.exercises[1]!.exerciseName = "back squat";
  assert.match(errorsOf(body).join("\n"), /중복/);
});

test("오류는 한 번에 전부 돌려준다", () => {
  const body = validBody();
  body.rationale = "";
  body.exercises[0]!.sets[0]!.reps = 0;
  body.exercises[1]!.sets[0]!.targetWeightKg = 9999;
  assert.equal(errorsOf(body).length, 3);
});

test("본문이 객체가 아니면 거부한다", () => {
  assert.equal(validateCoachPrescription(null).ok, false);
  assert.equal(validateCoachPrescription([]).ok, false);
  assert.equal(validateCoachPrescription("x").ok, false);
});

function snapshotFor(prescription: CoachPrescription, revision = 1) {
  return buildCoachSnapshot({
    plan: PLAN,
    date: "2026-11-20",
    timezone: "Asia/Seoul",
    prescription,
    resolvedExercises: new Map([
      ["back squat", { id: "ex-squat", name: "Back Squat" }],
      ["pull-up", { id: "ex-pull", name: "Pull-Up" }],
    ]),
    prescribedAt: "2026-11-19T10:00:00.000Z",
    revision,
  });
}

test("스냅샷은 v3 모양이고 세션 키는 날짜다", () => {
  const snapshot = snapshotFor(mustValidate(validBody()));
  assert.equal(snapshot.schemaVersion, 3);
  assert.equal(snapshot.sessionKey, "2026-11-20");
  // 캘린더·라벨 경로가 이미 아는 형태여야 한다.
  assert.equal(extractSessionDate(snapshot.sessionKey), "2026-11-20");
  assert.equal(snapshot.sessionType, "COACH");
  assert.deepEqual(snapshot.plan, PLAN);
  assert.deepEqual(snapshot.coach, {
    rationale: validBody().rationale,
    prescribedAt: "2026-11-19T10:00:00.000Z",
    revision: 1,
  });
});

test("스냅샷 운동은 받은 무게·반복을 그대로 담는다", () => {
  const snapshot = snapshotFor(mustValidate(validBody()));
  const squat = snapshot.exercises[0]!;
  assert.equal(squat.exerciseId, "ex-squat");
  assert.equal(squat.exerciseName, "Back Squat");
  // AUTO여야 기록 화면이 세트별 무게(90/90/80)를 그대로 시딩한다.
  assert.equal(squat.rowType, "AUTO");
  assert.equal(squat.skipProgression, true);
  assert.deepEqual(
    squat.sets.map((set) => [set.reps, set.targetWeightKg, set.rpe ?? null]),
    [
      [3, 90, 8],
      [3, 90, null],
      [5, 80, 7.5],
    ],
  );
  assert.equal(squat.sets[0]!.note, "하이바");
  assert.equal(snapshot.exercises[1]!.order, 2);
});

test("종목 이름은 카탈로그의 정식 이름으로 저장된다", () => {
  const body = validBody();
  body.exercises[0]!.exerciseName = "back squat";
  const snapshot = snapshotFor(mustValidate(body));
  assert.equal(snapshot.exercises[0]!.exerciseName, "Back Squat");
});

test("처방이 없는 날은 빈 세션이다", () => {
  const snapshot = buildEmptyCoachSnapshot({ plan: PLAN, date: "2026-11-21", timezone: "UTC" });
  assert.deepEqual(snapshot.exercises, []);
  assert.equal(snapshot.coach, null);
  assert.equal(snapshot.sessionKey, "2026-11-21");
  assert.equal(readCoachSessionMeta(snapshot), null);
});

test("같은 처방을 다시 보내면 같은 내용으로 본다 — 재시도가 개정이 되지 않는다", () => {
  const prescription = mustValidate(validBody());
  const stored = JSON.parse(JSON.stringify(snapshotFor(prescription, 1)));
  const retry = snapshotFor(prescription, 2);
  assert.equal(coachSnapshotMatchesPrescription(stored, retry), true);

  const changedBody = validBody();
  changedBody.exercises[0]!.sets[0]!.targetWeightKg = 92.5;
  assert.equal(
    coachSnapshotMatchesPrescription(stored, snapshotFor(mustValidate(changedBody), 2)),
    false,
  );

  const changedRationale = { ...validBody(), rationale: "다른 근거" };
  assert.equal(
    coachSnapshotMatchesPrescription(stored, snapshotFor(mustValidate(changedRationale), 2)),
    false,
  );
  // 빈 세션은 어떤 처방과도 같지 않다.
  const empty = buildEmptyCoachSnapshot({ plan: PLAN, date: "2026-11-20", timezone: "UTC" });
  assert.equal(coachSnapshotMatchesPrescription(empty, retry), false);
});

test("되읽은 스냅샷의 키 순서가 달라도 같은 처방으로 본다 (jsonb는 순서를 보존하지 않는다)", () => {
  const prescription = mustValidate(validBody());
  const fresh = snapshotFor(prescription, 1);
  const reorder = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reorder);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .reverse()
          .map(([key, inner]) => [key, reorder(inner)]),
      );
    }
    return value;
  };
  const stored = reorder(JSON.parse(JSON.stringify(fresh)));
  assert.notEqual(JSON.stringify(stored), JSON.stringify(fresh), "대조군: 순서가 실제로 달라야 한다");
  assert.equal(coachSnapshotMatchesPrescription(stored, snapshotFor(prescription, 2)), true);
});

test("저장된 메타를 관용적으로 읽는다", () => {
  assert.equal(readCoachSessionMeta(null), null);
  assert.equal(readCoachSessionMeta({ coach: { rationale: "" } }), null);
  assert.deepEqual(readCoachSessionMeta({ coach: { rationale: "r", revision: "x" } }), {
    rationale: "r",
    prescribedAt: "",
    revision: 1,
  });
});
