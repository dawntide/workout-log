import assert from "node:assert/strict";
import test from "node:test";

import { validateImportParentScope, type ImportScopeInput } from "./validateImportScope";

function emptyInput(): ImportScopeInput {
  return {
    templates: [],
    templateVersions: [],
    plans: [],
    planModules: [],
    planOverrides: [],
    generatedSessions: [],
    workoutLogs: [],
    workoutSets: [],
  };
}

test("자기 부모만 가리키는 정상 export는 통과한다", () => {
  const result = validateImportParentScope({
    ...emptyInput(),
    templates: [{ id: "tpl-1" }],
    templateVersions: [{ id: "ver-1", templateId: "tpl-1" }],
    plans: [{ id: "plan-1" }],
    planModules: [{ id: "mod-1", planId: "plan-1" }],
    planOverrides: [{ id: "ovr-1", planId: "plan-1" }],
    generatedSessions: [{ id: "sess-1", planId: "plan-1" }],
    workoutLogs: [{ id: "log-1", planId: "plan-1", generatedSessionId: "sess-1" }],
    workoutSets: [{ id: "set-1", logId: "log-1" }],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("빈 export는 통과한다", () => {
  const result = validateImportParentScope(emptyInput());
  assert.equal(result.ok, true);
});

// 이 파일의 존재 이유. 남의 planId/logId를 적은 import는 FK를 통과해 피해자의
// 플랜·로그 안으로 행을 밀어 넣을 수 있었다 — 그 자식 테이블들엔 user 컬럼이 없다.
test("남의 planId를 가리키는 자식 행은 거부한다", () => {
  for (const [table, row] of [
    ["planModules", { id: "mod-1", planId: "victim-plan" }],
    ["planOverrides", { id: "ovr-1", planId: "victim-plan" }],
    ["generatedSessions", { id: "sess-1", planId: "victim-plan" }],
  ] as const) {
    const result = validateImportParentScope({
      ...emptyInput(),
      plans: [{ id: "my-plan" }],
      [table]: [row],
    });
    assert.equal(result.ok, false, `${table}가 통과해서는 안 된다`);
    assert.ok(
      result.errors.some((e) => e.includes(table) && e.includes("victim-plan")),
      `${table} 오류 메시지에 위반 값이 들어가야 한다: ${result.errors.join(", ")}`,
    );
  }
});

test("남의 logId를 가리키는 workoutSet은 거부한다", () => {
  const result = validateImportParentScope({
    ...emptyInput(),
    workoutLogs: [{ id: "my-log" }],
    workoutSets: [{ id: "set-1", logId: "victim-log" }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("workoutSets.logId")));
});

test("남의 templateId를 가리키는 programVersion은 거부한다", () => {
  const result = validateImportParentScope({
    ...emptyInput(),
    templates: [{ id: "my-tpl" }],
    templateVersions: [{ id: "ver-1", templateId: "victim-tpl" }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("templateVersions.templateId")));
});

test("workoutLog의 nullable 부모 참조는 없어도 통과, 있으면 검사한다", () => {
  const withoutParents = validateImportParentScope({
    ...emptyInput(),
    workoutLogs: [{ id: "log-1", planId: null, generatedSessionId: null }],
  });
  assert.equal(withoutParents.ok, true, "planId가 null인 로그는 정상이다");

  const withForeignPlan = validateImportParentScope({
    ...emptyInput(),
    plans: [{ id: "my-plan" }],
    workoutLogs: [{ id: "log-1", planId: "victim-plan" }],
  });
  assert.equal(withForeignPlan.ok, false, "값이 있으면 스코프를 검사해야 한다");
});

test("필수 부모 컬럼이 비면 별도로 보고한다", () => {
  const result = validateImportParentScope({
    ...emptyInput(),
    plans: [{ id: "plan-1" }],
    planModules: [{ id: "mod-1" }],
  });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.includes("planModules.planId") && e.includes("required")),
    `누락은 참조 위반과 구분돼야 한다: ${result.errors.join(", ")}`,
  );
});

test("같은 규칙의 위반 값은 모아서 한 줄로 보고한다", () => {
  const result = validateImportParentScope({
    ...emptyInput(),
    plans: [{ id: "my-plan" }],
    planModules: Array.from({ length: 50 }, (_, i) => ({
      id: `mod-${i}`,
      planId: `victim-${i}`,
    })),
  });
  assert.equal(result.ok, false);
  const scopeErrors = result.errors.filter((e) => e.includes("planModules.planId"));
  assert.equal(scopeErrors.length, 1, "행마다 한 줄씩 쏟아내면 안 된다");
  assert.ok(scopeErrors[0]!.includes("+47 more"), `초과분을 요약해야 한다: ${scopeErrors[0]}`);
});
