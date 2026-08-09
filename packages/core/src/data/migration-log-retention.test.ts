import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  MIGRATION_LOG_RETENTION_DAYS_DEFAULT,
  migrationLogCleanupCutoff,
  resolveMigrationLogCleanupDryRun,
  resolveMigrationLogRetentionDays,
} from "./migration-log-retention";
import { isMissingTableError } from "./missing-table";

describe("resolveMigrationLogRetentionDays", () => {
  test("미설정·비수치는 기본값", () => {
    assert.equal(resolveMigrationLogRetentionDays(undefined), MIGRATION_LOG_RETENTION_DAYS_DEFAULT);
    assert.equal(resolveMigrationLogRetentionDays(""), MIGRATION_LOG_RETENTION_DAYS_DEFAULT);
    assert.equal(resolveMigrationLogRetentionDays("forever"), MIGRATION_LOG_RETENTION_DAYS_DEFAULT);
  });

  test("0·음수는 기본값으로 되돌린다", () => {
    // 0이 통과하면 cutoff=now라 전량 삭제된다 — 마이그레이션 이력이 오타 한 번에 사라지면 안 된다.
    assert.equal(resolveMigrationLogRetentionDays("0"), MIGRATION_LOG_RETENTION_DAYS_DEFAULT);
    assert.equal(resolveMigrationLogRetentionDays("-30"), MIGRATION_LOG_RETENTION_DAYS_DEFAULT);
  });

  test("양의 정수는 그대로, 소수는 내림", () => {
    assert.equal(resolveMigrationLogRetentionDays("30"), 30);
    assert.equal(resolveMigrationLogRetentionDays("30.9"), 30);
  });
});

describe("resolveMigrationLogCleanupDryRun", () => {
  test('"1"만 dry-run', () => {
    assert.equal(resolveMigrationLogCleanupDryRun("1"), true);
    assert.equal(resolveMigrationLogCleanupDryRun("0"), false);
    assert.equal(resolveMigrationLogCleanupDryRun(undefined), false);
    // "true"를 dry-run으로 읽으면 삭제를 도는데 안 도는 줄 알게 된다 — 오히려 위험.
    assert.equal(resolveMigrationLogCleanupDryRun("true"), false);
  });
});

describe("migrationLogCleanupCutoff", () => {
  test("보존일만큼 과거 시각", () => {
    const now = new Date("2026-08-09T00:00:00.000Z");
    assert.equal(
      migrationLogCleanupCutoff(now, 120).toISOString(),
      "2026-04-11T00:00:00.000Z",
    );
    assert.equal(migrationLogCleanupCutoff(now, 1).toISOString(), "2026-08-08T00:00:00.000Z");
  });

  // 이 테이블을 읽는 화면은 짧은 창만 본다 — 텔레메트리 대시보드 lookback 상한이 7일,
  // ops가 1일이다. 기본 보존이 그 상한 아래로 내려가면 대시보드가 빈 채로 보이기 시작한다.
  test("기본 보존은 소비자 lookback 상한(7일)보다 훨씬 길다", () => {
    const MAX_CONSUMER_LOOKBACK_DAYS = 7;
    assert.ok(
      MIGRATION_LOG_RETENTION_DAYS_DEFAULT > MAX_CONSUMER_LOOKBACK_DAYS * 4,
      `기본 보존 ${MIGRATION_LOG_RETENTION_DAYS_DEFAULT}일이 소비자 상한 ${MAX_CONSUMER_LOOKBACK_DAYS}일에 너무 가깝다`,
    );
  });
});

describe("isMissingTableError", () => {
  test("42P01만 무작업으로 삼킨다", () => {
    assert.equal(isMissingTableError({ code: "42P01" }), true);
    assert.equal(isMissingTableError({ cause: { code: "42P01" } }), true);
    // 다른 에러를 삼키면 정리가 조용히 안 도는 상태가 된다.
    assert.equal(isMissingTableError({ code: "42501" }), false);
    assert.equal(isMissingTableError(new Error("boom")), false);
    assert.equal(isMissingTableError(null), false);
    assert.equal(isMissingTableError("42P01"), false);
  });
});
