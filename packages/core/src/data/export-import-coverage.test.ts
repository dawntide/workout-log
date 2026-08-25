import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getTableName, is, Table } from "drizzle-orm";
import * as schema from "@workout/core/db/schema";

// 사용자 데이터 테이블이 **export와 import 양쪽에** 등재됐는지 강제한다.
//
// 계정 삭제 쪽은 deleteUserData.coverage.test.ts가 이미 introspection으로 분류를
// 강제한다. 여기는 그 짝인 "데이터 이동" 축을 맡는다 — 세 곳(export·import·삭제)을
// 손으로 맞추는 구조라 하나만 빠지는 일이 실제로 일어났다:
//
//   plan_runtime_state는 삭제와 import에는 있는데 **export에는 없었다.**
//   → replace import가 자동 진행 상태를 지우고 복원하지 않았다(중량·단계 리셋).
//
// 그 결함은 export 등재가 아니라 **import 후 재계산**으로 고쳤다(kind: recomputed).
// 파생 상태라 파일의 옛 값을 되살리면 방금 갈아끼운 로그와 어긋나기 때문이다.
//
// 새 테이블이 같은 비대칭에 빠지지 않도록, 스키마에 user-scoped 테이블을 추가하면
// 여기서 분류를 강제받는다. 계획서: docs/bodyweight-timeseries-plan.md §2.5

const EXPORT_SOURCE = readFileSync(new URL("../export/userExport.ts", import.meta.url), "utf8");
const IMPORT_SOURCE = readFileSync(new URL("../import/userImport.ts", import.meta.url), "utf8");
const SHAPE_SOURCE = readFileSync(new URL("../import/validateExportShape.ts", import.meta.url), "utf8");

type MoveKind =
  | "portable" // export·import 양쪽에 등재 — 사용자가 만든 데이터
  | "not-portable" // 옮기지 않는다(파생·인증·텔레메트리·참조)
  | "recomputed"; // 파일로 옮기지 않고 import가 로그에서 다시 만든다.

const MOVE_POLICY: Record<string, MoveKind> = {
  plan: "portable",
  plan_module: "portable",
  plan_override: "portable",
  generated_session: "portable",
  workout_log: "portable",
  workout_set: "portable",
  body_measurement: "portable",
  program_template: "portable",
  program_version: "portable",

  // 자동 진행 상태 — 로그에서 파생된다. userImport가 삽입 후
  // rebuildAutoProgressionForPlan으로 다시 만든다(아래 recomputed 테스트).
  plan_runtime_state: "recomputed",

  plan_progress_event: "not-portable", // 진행 이벤트 로그 — plan 삭제에 cascade되고 위 재계산이 다시 만든다
  stats_cache: "not-portable", // 파생 캐시
  user_setting: "not-portable", // 설정 — 계정 라이프사이클이 다룬다
  ux_event_log: "not-portable", // 텔레메트리
  auth_session: "not-portable",
  password_reset_token: "not-portable",
  email_verification_token: "not-portable",
  auth_oauth_account: "not-portable",
  // PAT — **export에 절대 넣지 말 것.** 해시만 저장하므로 옮겨도 쓸 수 없고,
  // 옮길 수 있게 만들면 export 파일이 자격증명 저장소가 된다.
  auth_api_token: "not-portable",
  auth_event_log: "not-portable", // 감사 로그
  exercise: "not-portable", // 운동 카탈로그(참조 데이터) — 시드가 소유한다
  exercise_alias: "not-portable", // 운동 별칭(참조 데이터)
  app_user: "not-portable", // 계정 자체
  account_deletion_tombstone: "not-portable", // 삭제 흔적 — 옮기면 안 된다
  migration_run_log: "not-portable", // 인프라
};

/**
 * 스키마의 **모든** 테이블. user 컬럼으로 후보를 좁히지 않는다 — workout_set·plan_module
 * 처럼 부모로만 소유자가 정해지는 자식 테이블이 정확히 옮겨야 하는 것들이라, 좁히면
 * 대상이 통째로 빠진다(실제로 첫 시도에서 그랬다).
 */
function allTables(): string[] {
  const names = new Set<string>();
  for (const value of Object.values(schema)) {
    if (!is(value, Table)) continue;
    names.add(getTableName(value));
  }
  return [...names].sort();
}

/** snake_case 테이블명 → 소스에 쓰이는 camelCase 식별자. */
function camel(tableName: string): string {
  return tableName.replace(/_([a-z])/g, (_m, ch: string) => ch.toUpperCase());
}

/**
 * 식별자 경계까지 본 포함 검사 — `plan`이 `planModule`에 매치되면 안 된다.
 * 정규식을 쓰지 않는다: 템플릿 리터럴의 `\b`는 단어 경계가 아니라 백스페이스 문자여서
 * 검사가 조용히 항상 false가 되는데, 이스케이프 층이 없으면 그 실수 자체가 불가능하다.
 */
function mentionsIdentifier(source: string, identifier: string): boolean {
  const isWordChar = (ch: string | undefined) => ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
  let from = 0;
  for (;;) {
    const at = source.indexOf(identifier, from);
    if (at === -1) return false;
    if (!isWordChar(source[at - 1]) && !isWordChar(source[at + identifier.length])) return true;
    from = at + 1;
  }
}

test("introspection이 동작한다 (커버리지 단정)", () => {
  const tables = allTables();
  assert.ok(tables.length >= 20, `테이블 ${tables.length}개 — introspection 확인 필요`);
  for (const known of ["workout_set", "plan_module", "body_measurement"]) {
    assert.ok(tables.includes(known), `알려진 테이블 ${known}이 스캔에 안 잡혔다`);
  }
});

test("스키마의 모든 테이블이 분류돼 있다", () => {
  const unclassified = allTables().filter((t) => !(t in MOVE_POLICY));
  assert.deepEqual(
    unclassified,
    [],
    `export/import 이동 정책이 없는 테이블: ${unclassified.join(", ")} — ` +
      "MOVE_POLICY에 portable(양쪽 등재) 또는 not-portable(이유 주석)로 분류할 것",
  );
});

test("MOVE_POLICY에 스키마에 없는 stale 항목이 없다", () => {
  const known = new Set(allTables());
  const stale = Object.keys(MOVE_POLICY).filter((t) => !known.has(t));
  assert.deepEqual(stale, [], `스키마에 없는 MOVE_POLICY 항목: ${stale.join(", ")}`);
});

test("portable 테이블은 export와 import 양쪽에 등재돼 있다", () => {
  const missing: string[] = [];
  for (const [tableName, kind] of Object.entries(MOVE_POLICY)) {
    if (kind !== "portable") continue;
    const identifier = camel(tableName);
    if (!mentionsIdentifier(EXPORT_SOURCE, identifier)) missing.push(`${tableName} → export`);
    if (!mentionsIdentifier(IMPORT_SOURCE, identifier)) missing.push(`${tableName} → import`);
  }
  assert.deepEqual(
    missing,
    [],
    `등재 누락:\n${missing.map((m) => `  ${m}`).join("\n")}\n` +
      "export 누락 = replace import가 복원하지 못한다(데이터 손실).",
  );
});

test("recomputed 테이블은 export에 없고, import가 재계산을 호출한다", () => {
  const recomputed = Object.entries(MOVE_POLICY)
    .filter(([, kind]) => kind === "recomputed")
    .map(([tableName]) => tableName);
  assert.ok(recomputed.length > 0, "recomputed 테이블이 없다 — 분류/테스트가 어긋났다");

  // export 등재는 "고침"이 아니라 **회귀**다. 파생 상태를 파일에서 되살리면 replace가
  // 방금 갈아끼운 로그와 어긋난 옛 값을 심는다. 고치는 방법은 재계산 하나뿐이다.
  const leaked = recomputed.filter((t) => mentionsIdentifier(EXPORT_SOURCE, camel(t)));
  assert.deepEqual(
    leaked,
    [],
    `recomputed인데 export에 등재된 테이블: ${leaked.join(", ")} — ` +
      "파생 상태는 파일로 옮기지 않고 import 후 로그에서 재계산한다",
  );

  // 재계산 호출이 사라지면 삭제만 남아 원래 결함으로 되돌아간다.
  assert.ok(
    mentionsIdentifier(IMPORT_SOURCE, "rebuildAutoProgressionForPlan"),
    "import가 rebuildAutoProgressionForPlan을 호출하지 않는다 — " +
      "replace가 plan_runtime_state를 지운 채 복원하지 않는다(데이터 손실)",
  );
});

test("v1 이후 추가된 배열 키는 필수가 아니다", () => {
  // 필수로 만들면 사용자가 반년 전 받아 둔 백업이 통째로 거부된다.
  assert.ok(
    !mentionsIdentifier(SHAPE_SOURCE, "bodyMeasurements"),
    "bodyMeasurements를 필수 키로 만들면 구 export가 거부된다",
  );
  assert.ok(
    IMPORT_SOURCE.includes("data.bodyMeasurements ?? []"),
    "import는 키 부재를 빈 배열로 다뤄야 한다",
  );
});
