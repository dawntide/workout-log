import assert from "node:assert/strict";
import test from "node:test";
import { validateExportShape } from "./validateExportShape";

const baseValidShape = {
  version: 1,
  exportedAt: "2026-05-07T00:00:00.000Z",
  userId: "user-1",
  templates: [],
  templateVersions: [],
  plans: [],
  planModules: [],
  planOverrides: [],
  generatedSessions: [],
  workoutLogs: [],
  workoutSets: [],
  exercises: [],
  exerciseAliases: [],
};

test("validateExportShape: minimal valid v1 export passes", () => {
  const result = validateExportShape(baseValidShape);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("validateExportShape: rejects non-object input", () => {
  const result = validateExportShape("not an object");
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("validateExportShape: rejects null input", () => {
  const result = validateExportShape(null);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("validateExportShape: rejects unsupported version", () => {
  const result = validateExportShape({ ...baseValidShape, version: 99 });
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.includes("unsupported export version")),
    `expected unsupported version error, got: ${result.errors.join(", ")}`,
  );
});

test("validateExportShape: rejects missing userId", () => {
  const { userId: _omit, ...rest } = baseValidShape;
  void _omit;
  const result = validateExportShape(rest);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("userId")));
});

test("validateExportShape: rejects non-array required fields", () => {
  const result = validateExportShape({
    ...baseValidShape,
    workoutLogs: "not an array",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("workoutLogs")));
});

test("validateExportShape: rejects when required arrays missing", () => {
  const partial: Record<string, unknown> = { ...baseValidShape };
  delete partial.workoutSets;
  const result = validateExportShape(partial);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("workoutSets")));
});

test("validateExportShape: collects multiple errors", () => {
  const broken = {
    ...baseValidShape,
    version: "abc", // not a number
    userId: 123, // not a string
  };
  const result = validateExportShape(broken);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 2);
});

// ── 체중 기록(M2-1 PR1) ─────────────────────────────────────────────────────

test("validateExportShape: bodyMeasurements 없는 구 export도 통과한다", () => {
  // v1 이후 추가된 키를 필수로 만들면 사용자가 반년 전 받아 둔 백업이 통째로
  // 거부된다. 부재는 "빈 이력"이지 형식 오류가 아니다.
  assert.equal(validateExportShape(baseValidShape).ok, true);
});

test("validateExportShape: bodyMeasurements가 있어도 통과한다", () => {
  const withMeasurements = {
    ...baseValidShape,
    bodyMeasurements: [
      { id: "bm-1", userId: "user-1", kind: "weight", valueKg: 72.5, measuredAt: "2026-03-01T00:00:00.000Z" },
    ],
  };
  assert.equal(validateExportShape(withMeasurements).ok, true);
});
