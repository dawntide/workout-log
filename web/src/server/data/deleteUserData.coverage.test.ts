import assert from "node:assert/strict";
import test from "node:test";
import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import * as schema from "../db/schema";

// audit §3.1: user_id를 가진 모든 테이블이 "계정 삭제 시 어떻게 정리되는지"를 명시 분류한다.
// 새 user-scoped 테이블이 추가되면 이 테스트가 실패 → deleteUserDomainData 또는
// account delete 라우트에서 정리하고 아래 정책에 분류하도록 강제(고아 데이터 방지).
// DB 레벨 FK/RLS가 없는 앱 레벨 격리 구조의 회귀 가드.

type CleanupKind =
  | "domain-helper" // deleteUserDomainData가 직접 삭제
  | "cascade" // FK ON DELETE CASCADE로 자동 삭제
  | "account-route" // account delete 라우트가 명시 삭제(또는 invalidate)
  | "retained-by-design"; // 의도적으로 보존(감사 로그 등)

const CLEANUP_POLICY: Record<string, CleanupKind> = {
  plan: "domain-helper",
  plan_runtime_state: "domain-helper",
  generated_session: "domain-helper",
  workout_log: "domain-helper",
  plan_progress_event: "cascade", // plan/workout_log FK ON DELETE CASCADE
  stats_cache: "account-route", // invalidateStatsCacheForUser
  user_setting: "account-route",
  ux_event_log: "account-route",
  auth_session: "account-route",
  password_reset_token: "account-route",
  email_verification_token: "account-route",
  auth_oauth_account: "account-route",
  auth_event_log: "retained-by-design", // 보안 감사 로그(ACCOUNT_DELETE 이벤트 포함) 보존
};

function userScopedTableNames(): string[] {
  const names: string[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value, Table)) continue; // pgTable이 아닌 export(타입 등)는 건너뜀
    const cols = getTableColumns(value);
    if (Object.values(cols).some((c) => c.name === "user_id")) {
      names.push(getTableName(value));
    }
  }
  return names;
}

test("user_id를 가진 모든 테이블은 계정 삭제 정리 정책에 분류되어야 한다", () => {
  const userScoped = userScopedTableNames();
  // introspection이 동작하는지 sanity(최소 10개 이상)
  assert.ok(
    userScoped.length >= 10,
    `user-scoped 테이블 감지가 비정상(${userScoped.length}개) — introspection 확인 필요`,
  );
  const unclassified = userScoped.filter((t) => !(t in CLEANUP_POLICY));
  assert.deepEqual(
    unclassified,
    [],
    `계정 삭제 정리 정책이 없는 user-scoped 테이블: ${unclassified.join(", ")} — ` +
      "deleteUserDomainData 또는 account delete 라우트에서 정리하고 CLEANUP_POLICY에 분류할 것",
  );
});

test("CLEANUP_POLICY에 스키마에 없는 stale 항목이 없어야 한다", () => {
  const userScoped = new Set(userScopedTableNames());
  const stale = Object.keys(CLEANUP_POLICY).filter((t) => !userScoped.has(t));
  assert.deepEqual(stale, [], `CLEANUP_POLICY의 stale 항목(스키마에 없음): ${stale.join(", ")}`);
});
