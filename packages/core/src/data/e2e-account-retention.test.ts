import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  E2E_ACCOUNT_MIN_AGE_HOURS_DEFAULT,
  E2eAccountCleanupForbiddenSchemaError,
  cleanupE2eAccounts,
  e2eAccountCleanupCutoff,
  isE2eAccountCleanupAllowedSchema,
  resolveE2eAccountCleanupDryRun,
  resolveE2eAccountMinAgeHours,
} from "./e2e-account-retention";

describe("resolveE2eAccountMinAgeHours", () => {
  test("미설정·비수치는 기본값", () => {
    assert.equal(resolveE2eAccountMinAgeHours(undefined), E2E_ACCOUNT_MIN_AGE_HOURS_DEFAULT);
    assert.equal(resolveE2eAccountMinAgeHours(""), E2E_ACCOUNT_MIN_AGE_HOURS_DEFAULT);
    assert.equal(resolveE2eAccountMinAgeHours("어제"), E2E_ACCOUNT_MIN_AGE_HOURS_DEFAULT);
  });

  test("0·음수는 기본값으로 되돌린다", () => {
    // 0이 통과하면 cutoff=now라 **지금 돌고 있는 E2E의 계정까지** 지운다.
    assert.equal(resolveE2eAccountMinAgeHours("0"), E2E_ACCOUNT_MIN_AGE_HOURS_DEFAULT);
    assert.equal(resolveE2eAccountMinAgeHours("-24"), E2E_ACCOUNT_MIN_AGE_HOURS_DEFAULT);
  });

  test("양의 정수는 그대로, 소수는 내림", () => {
    assert.equal(resolveE2eAccountMinAgeHours("72"), 72);
    assert.equal(resolveE2eAccountMinAgeHours("72.9"), 72);
  });
});

describe("resolveE2eAccountCleanupDryRun", () => {
  test('"1"만 dry-run', () => {
    assert.equal(resolveE2eAccountCleanupDryRun("1"), true);
    assert.equal(resolveE2eAccountCleanupDryRun("0"), false);
    assert.equal(resolveE2eAccountCleanupDryRun(undefined), false);
    // "true"를 dry-run으로 읽으면 삭제를 도는데 안 도는 줄 알게 된다.
    assert.equal(resolveE2eAccountCleanupDryRun("true"), false);
  });
});

describe("e2eAccountCleanupCutoff", () => {
  test("now에서 minAgeHours만큼 뺀다", () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    assert.equal(e2eAccountCleanupCutoff(now, 24).toISOString(), "2026-08-31T12:00:00.000Z");
  });
});

describe("isE2eAccountCleanupAllowedSchema", () => {
  test('"dev"만 허용한다', () => {
    assert.equal(isE2eAccountCleanupAllowedSchema("dev"), true);
    assert.equal(isE2eAccountCleanupAllowedSchema(" dev "), true);
  });

  test("빈 값은 거부다 — 빈 DB_SCHEMA는 public(=프로덕션)이다", () => {
    // "dev가 아니면 거부"가 아니라 "dev일 때만 허용"이라야 미설정이 안전한 쪽으로 떨어진다.
    assert.equal(isE2eAccountCleanupAllowedSchema(undefined), false);
    assert.equal(isE2eAccountCleanupAllowedSchema(""), false);
    assert.equal(isE2eAccountCleanupAllowedSchema("public"), false);
    assert.equal(isE2eAccountCleanupAllowedSchema("Dev"), false);
  });
});

describe("cleanupE2eAccounts 스키마 가드", () => {
  test("dev가 아니면 DB를 건드리기 전에 던진다", async () => {
    // 이 테스트가 진짜 값어치를 하려면 **DB 없이** 던져야 한다. 쿼리를 돌고 나서
    // 던지면 프로덕션에서 이미 select가 나간 뒤다.
    const original = process.env.DB_SCHEMA;
    for (const schema of [undefined, "", "public", "prod"]) {
      if (schema === undefined) delete process.env.DB_SCHEMA;
      else process.env.DB_SCHEMA = schema;
      await assert.rejects(
        () => cleanupE2eAccounts({ dryRun: true }),
        E2eAccountCleanupForbiddenSchemaError,
        `DB_SCHEMA=${JSON.stringify(schema)}에서 거부되지 않았다`,
      );
    }
    if (original === undefined) delete process.env.DB_SCHEMA;
    else process.env.DB_SCHEMA = original;
  });
});
