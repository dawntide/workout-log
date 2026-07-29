import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  UX_EVENTS_RETENTION_DAYS_DEFAULT,
  resolveUxEventsCleanupDryRun,
  resolveUxEventsRetentionDays,
  uxEventsCleanupCutoff,
} from "./ux-event-retention";

describe("resolveUxEventsRetentionDays", () => {
  test("미설정·비수치는 기본값", () => {
    assert.equal(resolveUxEventsRetentionDays(undefined), UX_EVENTS_RETENTION_DAYS_DEFAULT);
    assert.equal(resolveUxEventsRetentionDays(""), UX_EVENTS_RETENTION_DAYS_DEFAULT);
    assert.equal(resolveUxEventsRetentionDays("forever"), UX_EVENTS_RETENTION_DAYS_DEFAULT);
  });

  test("0·음수는 기본값으로 되돌린다", () => {
    // 0이 통과하면 cutoff=now라 전량 삭제된다 — 오타 한 번에 로그가 사라지면 안 된다.
    assert.equal(resolveUxEventsRetentionDays("0"), UX_EVENTS_RETENTION_DAYS_DEFAULT);
    assert.equal(resolveUxEventsRetentionDays("-30"), UX_EVENTS_RETENTION_DAYS_DEFAULT);
  });

  test("양의 정수는 그대로, 소수는 내림", () => {
    assert.equal(resolveUxEventsRetentionDays("30"), 30);
    assert.equal(resolveUxEventsRetentionDays("30.9"), 30);
  });
});

describe("resolveUxEventsCleanupDryRun", () => {
  test('"1"만 dry-run', () => {
    assert.equal(resolveUxEventsCleanupDryRun("1"), true);
    assert.equal(resolveUxEventsCleanupDryRun("0"), false);
    assert.equal(resolveUxEventsCleanupDryRun(undefined), false);
    // "true"/"yes"를 dry-run으로 읽으면 삭제를 도는데 안 도는 줄 알게 된다 — 오히려 위험.
    assert.equal(resolveUxEventsCleanupDryRun("true"), false);
  });
});

describe("uxEventsCleanupCutoff", () => {
  test("now에서 retentionDays만큼 뺀다", () => {
    const now = new Date("2026-07-29T00:00:00.000Z");
    assert.equal(
      uxEventsCleanupCutoff(now, 120).toISOString(),
      "2026-03-31T00:00:00.000Z",
    );
    assert.equal(
      uxEventsCleanupCutoff(now, 1).toISOString(),
      "2026-07-28T00:00:00.000Z",
    );
  });
});
