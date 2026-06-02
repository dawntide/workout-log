import { test } from "node:test";
import assert from "node:assert/strict";
import {
  plannedExercisesFromSlottedLpManualSession,
  resolveManualEntry,
} from "./generateSession";
import { resolveAutoProgressionProgram } from "@/server/progression/reducer";
import {
  inferSessionDraftsFromTemplate,
  toManualDefinition,
} from "@/lib/program-store/model";

// gzclp/texas per-slot LP: 같은 운동이라도 슬롯(tier/요일)별 독립 진행 키로 무게가 따로 굴러간다.

test("gzclp: 같은 세션의 다른 tier가 각자 slotKey workKg로 독립 처방", () => {
  // D3: Bench(T1) + Squat(T2). Squat은 D1에서 T1(EX_SQUAT_T1)이지만 여기선 T2(EX_SQUAT_T2)로 독립.
  const session = {
    key: "D3",
    items: [
      {
        exerciseName: "Bench Press",
        rowType: "AUTO",
        progressionTarget: "BENCH",
        slot: { role: { ko: "T1", en: "T1" }, sessionKey: "D3", tier: "T1", progressionKey: "EX_BENCH_T1" },
        sets: [{ reps: 3, targetWeightKg: 75 }, { reps: 3, targetWeightKg: 75 }],
      },
      {
        exerciseName: "Back Squat",
        rowType: "AUTO",
        progressionTarget: "SQUAT",
        slot: { role: { ko: "T2", en: "T2" }, sessionKey: "D3", tier: "T2", progressionKey: "EX_SQUAT_T2" },
        sets: [{ reps: 10, targetWeightKg: 90 }],
      },
    ],
  };
  // reducer가 굴린 슬롯별 workKg. EX_SQUAT_T1(110)과 EX_SQUAT_T2(95)는 같은 SQUAT이지만 독립.
  const params = { trainingMaxKg: { EX_BENCH_T1: 80, EX_SQUAT_T2: 95, EX_SQUAT_T1: 110 } };
  const out = plannedExercisesFromSlottedLpManualSession(session, params, {});

  assert.equal(out[0]!.progressionKey, "EX_BENCH_T1");
  assert.equal(out[0]!.sets[0]!.targetWeightKg, 80); // T1 Bench
  assert.equal(out[1]!.progressionKey, "EX_SQUAT_T2");
  assert.equal(out[1]!.sets[0]!.targetWeightKg, 95); // T2 Squat — D1의 T1(110)과 독립
});

test("slotted-lp: slotKey workKg가 없으면 저장 무게로 폴백(첫 세션/마이그레이션 안전)", () => {
  const session = {
    key: "D1",
    items: [
      {
        exerciseName: "Back Squat",
        rowType: "AUTO",
        progressionTarget: "SQUAT",
        slot: { role: { ko: "T1", en: "T1" }, sessionKey: "D1", tier: "T1", progressionKey: "EX_SQUAT_T1" },
        sets: [{ reps: 3, targetWeightKg: 100 }],
      },
    ],
  };
  const out = plannedExercisesFromSlottedLpManualSession(session, { trainingMaxKg: {} }, {});
  assert.equal(out[0]!.sets[0]!.targetWeightKg, 100);
  assert.equal(out[0]!.progressionKey, "EX_SQUAT_T1");
});

test("slotted-lp: CUSTOM/슬롯키 없는 행은 진행 추적 안 함(저장 세트 통과)", () => {
  const session = {
    key: "D1",
    items: [{ exerciseName: "Bicep Curl", rowType: "CUSTOM", sets: [{ reps: 12, targetWeightKg: 20 }] }],
  };
  const out = plannedExercisesFromSlottedLpManualSession(session, { trainingMaxKg: {} }, {});
  assert.equal(out[0]!.progressionKey, null);
  assert.equal(out[0]!.sets[0]!.targetWeightKg, 20);
});

test("gzclp/texas 레지스트리·진행 인식: fork도 slotted-lp 플래너 + family 진행", () => {
  for (const family of ["gzclp", "texas-method"]) {
    const entry = resolveManualEntry({ kind: "manual", programFamily: family });
    assert.equal(entry?.family, family);
    assert.equal(entry?.manualPlanner, "slotted-lp");
    assert.equal(entry?.flowStyle, "slotted");
    assert.equal(
      resolveAutoProgressionProgram("fork-" + family, { kind: "manual", programFamily: family }),
      family,
    );
  }
});

test("gzclp 통합: 원본→draft(슬롯주입)→저장→플래너 — 진행키 일관 + startWeightKg/workKg 폴백", () => {
  // 원본 seed 형태의 gzclp 템플릿 (slug 매칭으로 slotted 빌더가 잡힘)
  const template = {
    slug: "gzclp",
    latestVersion: {
      definition: {
        kind: "manual",
        sessions: [
          {
            key: "D1",
            items: [
              { exerciseName: "Back Squat", sets: [{ reps: 3, targetWeightKg: 100, note: "T1 main" }] },
              { exerciseName: "Bench Press", sets: [{ reps: 10, targetWeightKg: 60, note: "T2 volume" }] },
            ],
          },
        ],
      },
    },
  };

  // 1) 커스터마이즈 진입 → draft에 슬롯 메타 주입(note→tier 역할 + 인덱스 진행키 + 시작무게)
  const drafts = inferSessionDraftsFromTemplate(template as never);
  const squat = drafts[0]!.exercises[0]!;
  assert.equal(squat.slot?.tier, "T1"); // 표시용 tier는 note에서
  assert.equal(squat.slot?.progressionKey, "D1_s0"); // 진행키는 인덱스(표류 면역)
  assert.equal(squat.slot?.startWeightKg, 100);
  assert.equal(drafts[0]!.exercises[1]!.slot?.tier, "T2");
  assert.equal(drafts[0]!.exercises[1]!.slot?.progressionKey, "D1_s1");

  // 2) 저장(toManualDefinition) — 슬롯 정체성 보존(targetWeightKg는 0으로 평탄화돼도 slot.startWeightKg가 남음)
  const def = toManualDefinition(drafts, { programFamily: "gzclp" });
  const session = def.sessions[0]!;
  assert.equal((session.items[0]!.slot as { progressionKey?: string })?.progressionKey, "D1_s0");

  // 3) 처방 — reducer workKg 없으면 startWeightKg(100), 있으면 그 값
  const out0 = plannedExercisesFromSlottedLpManualSession(session, { trainingMaxKg: {} }, {});
  assert.equal(out0[0]!.sets[0]!.targetWeightKg, 100); // startWeightKg 폴백
  assert.equal(out0[0]!.progressionKey, "D1_s0");

  const out1 = plannedExercisesFromSlottedLpManualSession(session, { trainingMaxKg: { D1_s0: 105 } }, {});
  assert.equal(out1[0]!.sets[0]!.targetWeightKg, 105); // reducer 진행 무게
});

test("원본(slot 없는 정의) + family 전달 → 플래너가 동적 슬롯키(인덱스) 생성 + 진행", () => {
  // 원본 미-fork 정의는 sessions에 slot 메타가 없다. slug로 slotted-lp 라우팅된 뒤 family가 넘어오면
  // 플래너가 note/index로 슬롯키를 동적 생성해 fork와 동일하게 진행한다.
  const session = {
    key: "D1",
    items: [
      { exerciseName: "Back Squat", sets: [{ reps: 3, targetWeightKg: 100, note: "T1 main" }] },
      { exerciseName: "Bench Press", sets: [{ reps: 10, targetWeightKg: 60, note: "T2 volume" }] },
    ],
  };
  const out0 = plannedExercisesFromSlottedLpManualSession(session, { trainingMaxKg: {} }, {}, "gzclp");
  assert.equal(out0[0]!.progressionKey, "D1_s0"); // 동적 슬롯키
  assert.equal(out0[0]!.sets[0]!.targetWeightKg, 100); // seed 무게 폴백
  assert.equal(out0[1]!.progressionKey, "D1_s1");

  const out1 = plannedExercisesFromSlottedLpManualSession(session, { trainingMaxKg: { D1_s0: 107.5 } }, {}, "gzclp");
  assert.equal(out1[0]!.sets[0]!.targetWeightKg, 107.5); // reducer 진행 무게

  // family 미전달(라우팅 전) → 동적 안 함 → 진행 추적 0, 저장 무게 통과
  const outNoFam = plannedExercisesFromSlottedLpManualSession(session, { trainingMaxKg: {} }, {});
  assert.equal(outNoFam[0]!.progressionKey, null);
  assert.equal(outNoFam[0]!.sets[0]!.targetWeightKg, 100);
});
