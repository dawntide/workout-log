import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveManualEntry,
  applyManualRuntimeWeightOverrides,
} from "./generateSession";
import { resolveAutoProgressionProgram } from "@/server/progression/reducer";

// uniform LP(greyskull/SS/SL) 커스터마이즈 보존의 핵심:
// fork는 새 slug를 받지만 programFamily가 박혀 있어, slug가 아니라 family로 무게 override가 적용된다.
// (과거엔 applyManualRuntimeWeightOverrides가 "greyskull-lp" slug에만 하드코딩 → fork에서 깨짐)

const makeExercises = () => [
  { exerciseName: "Back Squat", role: "MAIN" as const, sets: [{ reps: 5, targetWeightKg: 60 }] },
  { exerciseName: "Bench Press", role: "MAIN" as const, sets: [{ reps: 5, targetWeightKg: 40 }] },
];
// reducer가 굴린 진행 무게(workKg). 운동명→target(SQUAT/BENCH)으로 처방 세트에 덮인다.
const runtime = { targets: { SQUAT: { workKg: 102.5 }, BENCH: { workKg: 82.5 } } };

test("uniform LP fork(slug 없음, family만)에서도 무게 override 적용 — greyskull/SS/SL", () => {
  for (const family of ["greyskull-lp", "starting-strength-lp", "stronglifts-5x5"]) {
    // fork 정의: kind=manual, programFamily=family (원본 slug는 사라짐)
    const entry = resolveManualEntry({ kind: "manual", programFamily: family });
    assert.equal(entry?.family, family, `${family} entry 보존`);
    assert.equal(entry?.weightOverrideMode, "family-target");

    const out = applyManualRuntimeWeightOverrides(entry, makeExercises() as never, runtime);
    assert.equal(out[0]!.sets[0]!.targetWeightKg, 102.5, "Squat 진행 무게 적용");
    assert.equal(out[1]!.sets[0]!.targetWeightKg, 82.5, "Bench 진행 무게 적용");
  }
});

test("슬롯형(operator/asymptote)은 family-target override를 받지 않음 — 전용 플래너가 무게 계산", () => {
  for (const family of ["operator", "asymptote"]) {
    const entry = resolveManualEntry({ kind: "manual", programFamily: family });
    assert.equal(entry?.weightOverrideMode, "slotted-internal");
    const out = applyManualRuntimeWeightOverrides(entry, makeExercises() as never, runtime);
    assert.equal(out[0]!.sets[0]!.targetWeightKg, 60, "원본 세트 유지(override 미적용)");
  }
});

test("operatorStyle 마커(하위호환)도 operator entry로 해석된다", () => {
  const entry = resolveManualEntry({ kind: "manual", operatorStyle: true });
  assert.equal(entry?.family, "operator");
});

test("슬롯형(531/gzclp/texas)은 등록됐지만 family-target override는 안 받음 (전용 플래너가 무게 계산)", () => {
  for (const family of ["wendler-531", "gzclp", "texas-method"]) {
    const entry = resolveManualEntry({ kind: "manual", programFamily: family });
    assert.equal(entry?.weightOverrideMode, "slotted-internal", `${family} slotted-internal`);
    const out = applyManualRuntimeWeightOverrides(entry, makeExercises() as never, runtime);
    assert.equal(out[0]!.sets[0]!.targetWeightKg, 60, `${family} 슬롯형은 override 미적용`);
  }
});

test("미등록 family(존재하지 않는 프로그램)는 override 없이 안전 통과", () => {
  const entry = resolveManualEntry({ kind: "manual", programFamily: "nonexistent-program" });
  assert.equal(entry, null);
  const out = applyManualRuntimeWeightOverrides(entry, makeExercises() as never, runtime);
  assert.equal(out[0]!.sets[0]!.targetWeightKg, 60, "미등록은 무게 고정으로 안전 통과");
});

test("reducer가 fork(새 slug)를 programFamily로 인식해 진행을 켠다 — uniform LP + 슬롯형", () => {
  const cases: Record<string, string> = {
    "greyskull-lp": "greyskull-lp",
    "starting-strength-lp": "starting-strength-lp",
    "stronglifts-5x5": "stronglifts-5x5",
    operator: "operator",
    asymptote: "asymptote",
  };
  for (const [family, expected] of Object.entries(cases)) {
    assert.equal(
      resolveAutoProgressionProgram("custom-fork-abc123", { kind: "manual", programFamily: family }),
      expected,
      `${family} fork 진행 인식`,
    );
  }
});
