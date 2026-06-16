import { test } from "node:test";
import assert from "node:assert/strict";
import {
  plannedExercisesFromManualSession,
  plannedExercisesFromOperatorManualSession,
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

// PR-D(한계2 gzclp): 정석 stage 변형 처방. v2 옵트인 + stageByKey(reducer 파생)일 때만
// 강등 스킴(T1 6×2/10×1, T2 3×8/3×6)으로 세트를 도출. stage 0/비-v2는 저장 세트 보존.
test("PR-D gzclp(v2): T1 stage>0 → 강등 스킴(6×2/10×1), stage 0·비-v2는 저장 세트 보존", () => {
  const squat5x3 = {
    exerciseName: "Back Squat",
    rowType: "AUTO",
    progressionTarget: "SQUAT",
    slot: { role: { ko: "T1", en: "T1" }, sessionKey: "D1", tier: "T1", progressionKey: "D1_s0", startWeightKg: 100 },
    sets: [
      { reps: 3, targetWeightKg: 100 }, { reps: 3, targetWeightKg: 100 }, { reps: 3, targetWeightKg: 100 },
      { reps: 3, targetWeightKg: 100 }, { reps: 3, targetWeightKg: 100 },
    ],
  };
  const session = { key: "D1", items: [squat5x3] };

  // stage 1 → 6×2 (무게는 reducer workKg)
  const s1 = plannedExercisesFromSlottedLpManualSession(session, { progressionModel: "v2", trainingMaxKg: { D1_s0: 102.5 }, stageByKey: { D1_s0: 1 } }, {}, "gzclp");
  assert.equal(s1[0]!.sets.length, 6);
  assert.equal(s1[0]!.sets[0]!.reps, 2);
  assert.equal(s1[0]!.sets[0]!.targetWeightKg, 102.5);

  // stage 2 → 10×1
  const s2 = plannedExercisesFromSlottedLpManualSession(session, { progressionModel: "v2", trainingMaxKg: { D1_s0: 102.5 }, stageByKey: { D1_s0: 2 } }, {}, "gzclp");
  assert.equal(s2[0]!.sets.length, 10);
  assert.equal(s2[0]!.sets[0]!.reps, 1);

  // stage 0(맵 없음) → 저장 5×3 보존
  const s0 = plannedExercisesFromSlottedLpManualSession(session, { progressionModel: "v2", trainingMaxKg: { D1_s0: 102.5 } }, {}, "gzclp");
  assert.equal(s0[0]!.sets.length, 5);
  assert.equal(s0[0]!.sets[0]!.reps, 3);

  // 비-v2(flag 없음) → stage 무시, 저장 세트
  const sV1 = plannedExercisesFromSlottedLpManualSession(session, { trainingMaxKg: { D1_s0: 102.5 }, stageByKey: { D1_s0: 2 } }, {}, "gzclp");
  assert.equal(sV1[0]!.sets.length, 5);
  assert.equal(sV1[0]!.sets[0]!.reps, 3);
});

test("PR-D gzclp(v2): T2 stage 1 → 3×8 (T2 강등 스킴)", () => {
  const benchT2 = {
    exerciseName: "Bench Press",
    rowType: "AUTO",
    progressionTarget: "BENCH",
    slot: { role: { ko: "T2", en: "T2" }, sessionKey: "D1", tier: "T2", progressionKey: "D1_s1", startWeightKg: 60 },
    sets: [{ reps: 10, targetWeightKg: 60 }, { reps: 10, targetWeightKg: 60 }, { reps: 10, targetWeightKg: 60 }],
  };
  const session = { key: "D1", items: [benchT2] };
  const out = plannedExercisesFromSlottedLpManualSession(session, { progressionModel: "v2", trainingMaxKg: { D1_s1: 62.5 }, stageByKey: { D1_s1: 1 } }, {}, "gzclp");
  assert.equal(out[0]!.sets.length, 3);
  assert.equal(out[0]!.sets[0]!.reps, 8);
  assert.equal(out[0]!.sets[0]!.targetWeightKg, 62.5);
});

// PR-D3(한계2 gzclp T3): 정석 T3는 마지막 세트가 AMRAP(reducer가 실측 reps≥25면 증량). mapManualSet이
// amrap을 버리므로 v2 옵트인 + tier=T3일 때만 마지막 세트에 amrap:true를 명시 주입한다.
test("PR-D gzclp(v2): T3 마지막 세트만 AMRAP 주입 — reducer ≥25 증량 게이트", () => {
  const t3 = {
    exerciseName: "Lat Pulldown",
    rowType: "AUTO",
    progressionTarget: "ROW",
    slot: { role: { ko: "T3", en: "T3" }, sessionKey: "D1", tier: "T3", progressionKey: "D1_s2", startWeightKg: 40 },
    sets: [{ reps: 15, targetWeightKg: 40 }, { reps: 15, targetWeightKg: 40 }, { reps: 15, targetWeightKg: 40 }],
  };
  const session = { key: "D1", items: [t3] };

  // v2 → 마지막 세트만 amrap:true, 앞 세트는 미부착. 무게는 reducer workKg.
  const v2 = plannedExercisesFromSlottedLpManualSession(session, { progressionModel: "v2", trainingMaxKg: { D1_s2: 42.5 } }, {}, "gzclp");
  assert.equal(v2[0]!.sets.length, 3);
  assert.equal(v2[0]!.sets[0]!.amrap, undefined);
  assert.equal(v2[0]!.sets[1]!.amrap, undefined);
  assert.equal(v2[0]!.sets[2]!.amrap, true);
  assert.equal(v2[0]!.sets[2]!.targetWeightKg, 42.5);
  assert.equal(v2[0]!.progressionKey, "D1_s2");
});

test("PR-D gzclp: 비-v2 T3는 AMRAP 미부착(forward-only), T1/T2는 v2여도 미부착(T3 전용)", () => {
  const t3 = {
    exerciseName: "Lat Pulldown",
    rowType: "AUTO",
    progressionTarget: "ROW",
    slot: { role: { ko: "T3", en: "T3" }, sessionKey: "D1", tier: "T3", progressionKey: "D1_s2", startWeightKg: 40 },
    sets: [{ reps: 15, targetWeightKg: 40 }, { reps: 15, targetWeightKg: 40 }, { reps: 15, targetWeightKg: 40 }],
  };
  // 비-v2 → 기존 동작(amrap 미부착)
  const v1 = plannedExercisesFromSlottedLpManualSession({ key: "D1", items: [t3] }, { trainingMaxKg: { D1_s2: 42.5 } }, {}, "gzclp");
  assert.equal(v1[0]!.sets[2]!.amrap, undefined);

  // v2 + T1 → AMRAP 미부착(stage 0이라 저장 3×3 유지)
  const t1 = {
    exerciseName: "Back Squat",
    rowType: "AUTO",
    progressionTarget: "SQUAT",
    slot: { role: { ko: "T1", en: "T1" }, sessionKey: "D1", tier: "T1", progressionKey: "D1_s0", startWeightKg: 100 },
    sets: [{ reps: 3, targetWeightKg: 100 }, { reps: 3, targetWeightKg: 100 }, { reps: 3, targetWeightKg: 100 }],
  };
  const t1Out = plannedExercisesFromSlottedLpManualSession({ key: "D1", items: [t1] }, { progressionModel: "v2", trainingMaxKg: { D1_s0: 102.5 } }, {}, "gzclp");
  assert.equal(t1Out[0]!.sets[2]!.amrap, undefined);
});

test("PR-D: texas는 gzclp stage 변형 영향 안 받음(family 가드)", () => {
  const session = {
    key: "I",
    items: [{
      exerciseName: "Back Squat",
      rowType: "AUTO",
      progressionTarget: "SQUAT",
      slot: { role: { ko: "I", en: "I" }, sessionKey: "I", tier: "T1", progressionKey: "I_s0", startWeightKg: 100 },
      sets: [{ reps: 5, targetWeightKg: 100 }],
    }],
  };
  const out = plannedExercisesFromSlottedLpManualSession(session, { progressionModel: "v2", trainingMaxKg: { I_s0: 100 }, stageByKey: { I_s0: 2 } }, {}, "texas-method");
  assert.equal(out[0]!.sets.length, 1); // 저장 그대로 — texas는 stage 변형 미적용
  assert.equal(out[0]!.sets[0]!.reps, 5);
});

// PR-D4(한계2 gzclp 활성화): 처방이 UI 배지용 tier/stage 표시 메타를 노출. v2 옵트인 + gzclp일 때만
// 부착하고, T3는 AMRAP이라 stage=null. 비-v2/타 family는 전부 null이라 배지가 뜨지 않는다.
test("PR-D4 gzclp(v2): T1/T2 처방에 tier + 현재 stage 노출 (UI 배지용)", () => {
  const t1 = {
    exerciseName: "Back Squat",
    rowType: "AUTO",
    progressionTarget: "SQUAT",
    slot: { role: { ko: "T1", en: "T1" }, sessionKey: "D1", tier: "T1", progressionKey: "D1_s0", startWeightKg: 100 },
    sets: [{ reps: 3, targetWeightKg: 100 }, { reps: 3, targetWeightKg: 100 }, { reps: 3, targetWeightKg: 100 }],
  };

  // v2 + stage 1 → tier "T1", stage 1
  const s1 = plannedExercisesFromSlottedLpManualSession({ key: "D1", items: [t1] }, { progressionModel: "v2", trainingMaxKg: { D1_s0: 102.5 }, stageByKey: { D1_s0: 1 } }, {}, "gzclp");
  assert.equal(s1[0]!.tier, "T1");
  assert.equal(s1[0]!.stage, 1);

  // v2 + stage 미설정 → stage 0 (기본, 배지 미표시 대상)
  const s0 = plannedExercisesFromSlottedLpManualSession({ key: "D1", items: [t1] }, { progressionModel: "v2", trainingMaxKg: { D1_s0: 102.5 } }, {}, "gzclp");
  assert.equal(s0[0]!.tier, "T1");
  assert.equal(s0[0]!.stage, 0);

  // 비-v2 → tier/stage 모두 null
  const v1 = plannedExercisesFromSlottedLpManualSession({ key: "D1", items: [t1] }, { trainingMaxKg: { D1_s0: 102.5 } }, {}, "gzclp");
  assert.equal(v1[0]!.tier, null);
  assert.equal(v1[0]!.stage, null);
});

test("PR-D4 gzclp(v2): T3는 tier만 T3, stage=null(AMRAP이라 강등 무의미)", () => {
  const t3 = {
    exerciseName: "Lat Pulldown",
    rowType: "AUTO",
    progressionTarget: "ROW",
    slot: { role: { ko: "T3", en: "T3" }, sessionKey: "D1", tier: "T3", progressionKey: "D1_s2", startWeightKg: 40 },
    sets: [{ reps: 15, targetWeightKg: 40 }, { reps: 15, targetWeightKg: 40 }, { reps: 15, targetWeightKg: 40 }],
  };
  const out = plannedExercisesFromSlottedLpManualSession({ key: "D1", items: [t3] }, { progressionModel: "v2", trainingMaxKg: { D1_s2: 42.5 }, stageByKey: { D1_s2: 2 } }, {}, "gzclp");
  assert.equal(out[0]!.tier, "T3");
  assert.equal(out[0]!.stage, null);
});

test("PR-D4: texas/비-gzclp는 tier/stage 미부착(gzclp 전용 배지)", () => {
  const session = {
    key: "I",
    items: [{
      exerciseName: "Back Squat",
      rowType: "AUTO",
      progressionTarget: "SQUAT",
      slot: { role: { ko: "I", en: "I" }, sessionKey: "I", tier: "T1", progressionKey: "I_s0", startWeightKg: 100 },
      sets: [{ reps: 5, targetWeightKg: 100 }],
    }],
  };
  const out = plannedExercisesFromSlottedLpManualSession(session, { progressionModel: "v2", trainingMaxKg: { I_s0: 100 } }, {}, "texas-method");
  assert.equal(out[0]!.tier, null);
  assert.equal(out[0]!.stage, null);
});

// PR-E(한계2 texas 주간 모델): I(강도일)가 진행 기준. V/R은 같은 target의 I workKg × 계수
// (볼륨 0.9 / 회복 0.8)로 파생하고 progressionKey를 흘리지 않아 reducer가 I만 굴린다.
// v2 옵트인 + slot.texasRole 게이팅. 비-v2는 기존 슬롯 독립 LP 유지.
test("PR-E texas(v2): I 슬롯은 자체 workKg + intensity 역할 + progressionKey 유지", () => {
  const i = {
    exerciseName: "Back Squat",
    rowType: "AUTO",
    progressionTarget: "SQUAT",
    slot: { role: { ko: "강도일", en: "I" }, sessionKey: "I", texasRole: "intensity", progressionKey: "I_s0", startWeightKg: 100 },
    sets: [{ reps: 5, targetWeightKg: 100 }],
  };
  const out = plannedExercisesFromSlottedLpManualSession({ key: "I", items: [i] }, { progressionModel: "v2", trainingMaxKg: { I_s0: 105 } }, {}, "texas-method");
  assert.equal(out[0]!.progressionKey, "I_s0"); // I는 진행 추적
  assert.equal(out[0]!.sets[0]!.targetWeightKg, 105); // 자체 workKg
  assert.equal(out[0]!.texasRole, "intensity");
});

test("PR-E texas(v2): V/R은 I workKg×계수(0.9/0.8)로 파생, progressionKey 없음", () => {
  const mk = (role: string, sessionKey: string, key: string) => ({
    exerciseName: "Back Squat",
    rowType: "AUTO",
    progressionTarget: "SQUAT",
    slot: { role: { ko: role, en: role }, sessionKey, texasRole: role, progressionKey: key, startWeightKg: 90 },
    sets: [{ reps: 5, targetWeightKg: 90 }],
  });
  const params = { progressionModel: "v2", trainingMaxKg: {}, texasIntensityByTarget: { SQUAT: 100 } };

  const outV = plannedExercisesFromSlottedLpManualSession({ key: "V", items: [mk("volume", "V", "V_s0")] }, params, {}, "texas-method");
  assert.equal(outV[0]!.sets[0]!.targetWeightKg, 90); // 100 × 0.9
  assert.equal(outV[0]!.progressionKey, null); // 진행 추적 안 함(reducer 미도달)
  assert.equal(outV[0]!.texasRole, "volume");

  const outR = plannedExercisesFromSlottedLpManualSession({ key: "R", items: [mk("recovery", "R", "R_s0")] }, params, {}, "texas-method");
  assert.equal(outR[0]!.sets[0]!.targetWeightKg, 80); // 100 × 0.8
  assert.equal(outR[0]!.progressionKey, null);
  assert.equal(outR[0]!.texasRole, "recovery");
});

test("PR-E texas(v2): I workKg 미존재(첫 주기)면 V는 seed 무게 폴백", () => {
  const v = {
    exerciseName: "Back Squat",
    rowType: "AUTO",
    progressionTarget: "SQUAT",
    slot: { role: { ko: "volume", en: "volume" }, sessionKey: "V", texasRole: "volume", progressionKey: "V_s0", startWeightKg: 120 },
    sets: [{ reps: 5, targetWeightKg: 120 }],
  };
  const out = plannedExercisesFromSlottedLpManualSession({ key: "V", items: [v] }, { progressionModel: "v2", trainingMaxKg: {} }, {}, "texas-method");
  assert.equal(out[0]!.sets[0]!.targetWeightKg, 120); // texasIntensityByTarget 없음 → seed 폴백
  assert.equal(out[0]!.texasRole, "volume");
});

test("PR-E texas(비-v2): 슬롯 독립 LP 유지(파생 안 함), texasRole null", () => {
  const v = {
    exerciseName: "Back Squat",
    rowType: "AUTO",
    progressionTarget: "SQUAT",
    slot: { role: { ko: "volume", en: "volume" }, sessionKey: "V", texasRole: "volume", progressionKey: "V_s0", startWeightKg: 120 },
    sets: [{ reps: 5, targetWeightKg: 120 }],
  };
  const out = plannedExercisesFromSlottedLpManualSession({ key: "V", items: [v] }, { trainingMaxKg: { V_s0: 122.5 } }, {}, "texas-method");
  assert.equal(out[0]!.sets[0]!.targetWeightKg, 122.5); // 슬롯 독립 workKg
  assert.equal(out[0]!.progressionKey, "V_s0"); // 진행 추적(기존)
  assert.equal(out[0]!.texasRole, null); // 비-v2 배지 없음
});

// Greyskull(v2): 메인 리프트 마지막 세트에만 amrap:true 주입(ASSIST·앞 세트 미부착, 비-v2 미부착).
test("greyskull(v2): plannedExercisesFromManualSession이 메인 마지막 세트에 amrap 주입", () => {
  const session = {
    key: "A",
    items: [
      { exerciseName: "Back Squat", role: "MAIN", sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }] },
      { exerciseName: "Chin-Up", role: "ASSIST", sets: [{ reps: 8 }, { reps: 8 }] },
    ],
  };

  const v2 = plannedExercisesFromManualSession(session, { injectAmrapLastMainSet: true });
  // 메인: 마지막 세트만 amrap, 앞 세트는 미부착
  assert.equal(v2[0]!.sets[0]!.amrap, undefined);
  assert.equal(v2[0]!.sets[1]!.amrap, undefined);
  assert.equal(v2[0]!.sets[2]!.amrap, true);
  // 보조(ASSIST): 미부착
  assert.equal(v2[1]!.sets[1]!.amrap, undefined);

  // 비-v2(플래그 없음): 아무 세트도 amrap 아님 — forward-only
  const v1 = plannedExercisesFromManualSession(session);
  assert.equal(v1[0]!.sets[2]!.amrap, undefined);
});

// SS/StrongLifts(v2): MAIN + progressionTarget 매핑 행에만 enforcePlannedReps 마킹.
// ASSIST·progressionTarget 미매핑(bodyweight 등) 행은 제외 — 저장 경로가 이 마킹을 보고 reps-only
// plannedRef를 흘릴지 결정한다. 비-옵션은 미부착(forward-only).
test("SS/SL(enforcePlannedReps): MAIN+progressionTarget 행에만 마킹, ASSIST·미매핑 행은 제외", () => {
  const session = {
    key: "A",
    items: [
      { exerciseName: "Back Squat", role: "MAIN", progressionTarget: "SQUAT", sets: [{ reps: 5 }, { reps: 5 }, { reps: 5 }] },
      { exerciseName: "Chin-Up", role: "ASSIST", sets: [{ reps: 8 }, { reps: 8 }] },
      { exerciseName: "Mystery Lift", role: "MAIN", sets: [{ reps: 5 }] }, // MAIN이나 progressionTarget 미매핑
    ],
  };

  const v2 = plannedExercisesFromManualSession(session, { enforcePlannedReps: true });
  assert.equal(v2[0]!.enforcePlannedReps, true); // MAIN + progressionTarget
  assert.notEqual(v2[1]!.enforcePlannedReps, true); // ASSIST 제외
  assert.notEqual(v2[2]!.enforcePlannedReps, true); // progressionTarget 미매핑 제외(bodyweight 가드)

  // 비-옵션: 마킹 안 함 — forward-only
  const v1 = plannedExercisesFromManualSession(session);
  assert.notEqual(v1[0]!.enforcePlannedReps, true);
});

// operator(v2): AUTO(MAIN) 행에만 enforcePlannedReps 마킹, CUSTOM 행은 제외. 비-v2는 미마킹(forward-only).
// operator는 EX_ progressionKey를 들지만, 마킹은 저장 경로에서 progressionKey 없는 reps-only plannedRef로만 소비된다.
test("operator(enforcePlannedReps): v2면 AUTO 행에 마킹, CUSTOM 행은 제외, 비-v2는 미마킹", () => {
  const session = {
    key: "C1W6D3",
    items: [
      { exerciseName: "Back Squat", rowType: "AUTO", progressionTarget: "SQUAT", sets: [{ reps: 1 }] },
      { exerciseName: "Face Pull", rowType: "CUSTOM", sets: [{ reps: 15 }] },
    ],
  };

  const v2 = plannedExercisesFromOperatorManualSession(session, 6, { progressionModel: "v2" }, {}, {});
  assert.equal(v2[0]!.enforcePlannedReps, true); // AUTO + progressionTarget
  assert.notEqual(v2[1]!.enforcePlannedReps, true); // CUSTOM 제외

  const v1 = plannedExercisesFromOperatorManualSession(session, 6, {}, {}, {});
  assert.notEqual(v1[0]!.enforcePlannedReps, true); // 비-v2 미마킹(forward-only)
});
