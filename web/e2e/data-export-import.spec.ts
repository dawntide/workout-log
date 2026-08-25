/**
 * Data export + import E2E
 *
 * Covers:
 * - PR #258: POST /api/me/import dry-run path with valid v1 export shape
 * - existing /api/export?format=json: returns version 1 + arrays
 * - import body validation (rejects unsupported version, rejects missing arrays)
 * - replace 왕복이 자동 진행 상태를 잃지 않는가 (아래 describe)
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

test.describe("data export + import", () => {
  test("GET /api/export?format=json returns v1 envelope", async ({ request }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `export-${suffix}@example.com`;

    await request.post("/api/auth/signup", {
      data: { email, password: "export-test-pw-123" },
    });

    const res = await request.get("/api/export?format=json");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    const body = await res.json();
    expect(body.version).toBe(1);
    expect(typeof body.exportedAt).toBe("string");
    expect(typeof body.userId).toBe("string");
    for (const key of [
      "templates",
      "templateVersions",
      "plans",
      "planModules",
      "planOverrides",
      "generatedSessions",
      "workoutLogs",
      "workoutSets",
    ]) {
      expect(Array.isArray(body[key])).toBe(true);
    }
  });

  test("POST /api/me/import dry-run with empty user export returns summary", async ({
    request,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `import-${suffix}@example.com`;

    await request.post("/api/auth/signup", {
      data: { email, password: "import-test-pw-123" },
    });

    const exportRes = await request.get("/api/export?format=json");
    const exportPayload = await exportRes.json();

    const dryRun = await request.post("/api/me/import", {
      data: { mode: "dryRun", data: exportPayload },
    });
    expect(dryRun.status()).toBe(200);
    const body = await dryRun.json();
    expect(body.applied).toBe(false);
    expect(body.mode).toBe("dryRun");
    expect(body.schemaVersion).toBe(1);
    expect(Array.isArray(body.summary)).toBe(true);
    expect(
      body.summary.find((row: { table: string }) => row.table === "workoutLog"),
    ).toBeTruthy();
  });

  test("import rejects unsupported schemaVersion", async ({ request }) => {
    await request.post("/api/auth/signup", {
      data: {
        email: `import-bad-${Date.now()}@example.com`,
        password: "import-test-pw-123",
      },
    });

    const bad = await request.post("/api/me/import", {
      data: {
        mode: "dryRun",
        data: {
          version: 99,
          exportedAt: new Date().toISOString(),
          userId: "anything",
          templates: [],
          templateVersions: [],
          plans: [],
          planModules: [],
          planOverrides: [],
          generatedSessions: [],
          workoutLogs: [],
          workoutSets: [],
        },
      },
    });
    expect(bad.status()).toBe(400);
  });

  test("import replace requires confirmToken", async ({ request }) => {
    await request.post("/api/auth/signup", {
      data: {
        email: `import-noconfirm-${Date.now()}@example.com`,
        password: "import-test-pw-123",
      },
    });

    const exportRes = await request.get("/api/export?format=json");
    const exportPayload = await exportRes.json();

    const noConfirm = await request.post("/api/me/import", {
      data: { mode: "replace", data: exportPayload },
    });
    expect(noConfirm.status()).toBe(400);
  });
});


/**
 * replace import ↔ 자동 진행 상태
 *
 * `plan_runtime_state`는 삭제 대상인데 export에는 없다 — 파생 상태라 파일로 옮기지 않고
 * import가 로그에서 다시 만든다. 그 재계산이 빠지면 replace가 자동 진행 플랜의 workKg·
 * stage·failureStreak를 지운 채 끝나 프로그램이 템플릿 시작 무게로 되돌아간다(실제 결함).
 *
 * "삽입되는 행 수"로는 이 결함이 안 잡힌다(파일에 없으니 0이 맞다). 그래서 **왕복 뒤의
 * 진행 상태 자체**를 단언한다.
 *
 * 계정 하나를 두 테스트가 공유한다(bodyweight-trend.spec.ts와 같은 이유) — signup은
 * IP당 5/hr라 스펙마다 계정을 만들면 로컬에서 몇 번 돌리는 순간 429다. 덤으로 두 번째
 * 테스트는 플랜 2개가 든 계정을 왕복시키게 되어 재계산 루프가 여러 플랜을 도는 것까지
 * 함께 확인한다.
 */
test.describe.configure({ mode: "serial" });

test.describe("replace import — 자동 진행 상태", () => {
  test.setTimeout(120_000);

  let api: APIRequestContext;
  let close: () => Promise<void>;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    api = context.request;
    close = () => context.close();

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const signup = await api.post("/api/auth/signup", {
      data: { email: `import-progression-${suffix}@example.com`, password: "import-test-pw-123" },
    });
    expect(signup.ok(), `signup 실패: ${signup.status()}`).toBe(true);
  });

  test.afterAll(async () => {
    await close?.();
  });

  test("지워진 진행 상태를 로그에서 동일하게 되살린다", async () => {
    const planId = await startAutoProgressionPlan(api, "roundtrip");

    // 3×5 전부 성공 → SS LP가 +2.5 증량하고 runtime state가 생긴다.
    await logSession(api, planId, "2026-01-05T10:00:00.000Z", 100);

    const before = await readProgressionState(api, planId);
    expect(
      before.state,
      "로그를 넣었는데 진행 상태가 없다 — 시나리오가 성립하지 않는다",
    ).toBeTruthy();
    expect(before.state?.targets?.SQUAT?.workKg).toBe(102.5);

    const summary = await exportThenReplaceImport(api);

    // 요약은 이 테이블을 "삽입 0"이 아니라 "재계산"으로 알려야 한다 — 0만 보이면
    // 미리보기가 데이터 손실처럼 읽힌다.
    const runtimeRow = summary.find((row) => row.table === "planRuntimeState");
    expect(runtimeRow?.willRecompute, "planRuntimeState가 재계산으로 표기되지 않았다").toBe(true);
    expect(runtimeRow?.willInsert, "파일에 없는 테이블이라 삽입은 0이어야 한다").toBe(0);

    const after = await readProgressionState(api, planId);
    expect(after.state, "replace import가 자동 진행 상태를 복원하지 못했다").toBeTruthy();
    expect(after.state).toEqual(before.state);
  });

  test("사용자가 직접 고른 증감량 결정까지 되살린다", async () => {
    const planId = await startAutoProgressionPlan(api, "decisions");

    await logSession(api, planId, "2026-02-05T10:00:00.000Z", 100);
    // 리듀서라면 102.5 → 105로 올렸을 세션에서 사용자가 "유지 100"을 골랐다.
    // 이 결정은 로그에서 유도할 수 없다 — plan_progress_event.meta에만 있고,
    // 그 행은 replace가 plan을 지울 때 cascade로 함께 사라진다.
    await logSession(api, planId, "2026-02-07T10:00:00.000Z", 102.5, {
      SQUAT: { mode: "hold", workKg: 100 },
    });

    const before = await readProgressionState(api, planId);
    expect(before.state?.targets?.SQUAT?.workKg, "결정이 적용되지 않았다").toBe(100);

    await exportThenReplaceImport(api);

    const after = await readProgressionState(api, planId);
    expect(
      after.state?.targets?.SQUAT?.workKg,
      "결정이 유실돼 리듀서 기본값으로 되돌아갔다",
    ).toBe(100);
    expect(after.state).toEqual(before.state);
  });
});

type ProgressionStateResponse = {
  program: string | null;
  state: {
    targets?: Record<string, { workKg?: number } | undefined>;
  } | null;
};

type ImportSummaryRow = {
  table: string;
  willDelete: number;
  willInsert: number;
  willRecompute?: boolean;
};

/** 시드된 공개 프로그램으로 자동 진행 플랜 하나를 만든다. */
async function startAutoProgressionPlan(api: APIRequestContext, label: string): Promise<string> {
  const templatesRes = await api.get("/api/templates?limit=100");
  expect(templatesRes.status()).toBe(200);
  const templates = (await templatesRes.json()) as {
    items: Array<{ slug: string; latestVersion: { id: string } | null }>;
  };
  const version = templates.items.find((t) => t.slug === "starting-strength-lp")?.latestVersion;
  expect(version?.id, "starting-strength-lp 시드를 찾지 못했다").toBeTruthy();

  // POST /api/plans는 params에 autoProgression=true를 항상 채운다(withAutoProgressionDefaults).
  const planRes = await api.post("/api/plans", {
    data: {
      name: `import-${label}-${Date.now()}`,
      type: "SINGLE",
      rootProgramVersionId: version!.id,
      params: { sessionKeyMode: "DATE" },
    },
  });
  expect(planRes.status(), `plan 생성 실패: ${await planRes.text()}`).toBe(201);
  const planId = ((await planRes.json()) as { plan: { id: string } }).plan.id;
  expect(planId).toBeTruthy();
  return planId;
}

/** 스쿼트 3×5를 전부 채워 넣는다 — SS LP 기준 "성공한 세션". */
async function logSession(
  api: APIRequestContext,
  planId: string,
  performedAt: string,
  weightKg: number,
  progressionTargetDecisions?: Record<string, { mode: string; workKg: number }>,
) {
  const res = await api.post("/api/logs", {
    data: {
      performedAt,
      planId,
      sets: [0, 1, 2].map((index) => ({
        exerciseName: "Back Squat",
        sortOrder: index,
        setNumber: index + 1,
        reps: 5,
        weightKg,
      })),
      ...(progressionTargetDecisions ? { progressionTargetDecisions } : {}),
    },
  });
  expect(res.status(), `로그 저장 실패: ${await res.text()}`).toBe(201);
}

async function readProgressionState(api: APIRequestContext, planId: string) {
  const res = await api.get(`/api/plans/${planId}/progression-state`);
  expect(res.status()).toBe(200);
  return (await res.json()) as ProgressionStateResponse;
}

/** 자기 데이터를 그대로 내려받아 replace로 되돌린다 — 백업 복원의 최단 경로. */
async function exportThenReplaceImport(api: APIRequestContext): Promise<ImportSummaryRow[]> {
  const exportRes = await api.get("/api/export?format=json");
  expect(exportRes.status()).toBe(200);
  const payload = await exportRes.json();

  const replaced = await api.post("/api/me/import", {
    data: { mode: "replace", confirmToken: "REPLACE_USER_DATA", data: payload },
  });
  expect(replaced.status(), `replace import 실패: ${await replaced.text()}`).toBe(200);
  const body = (await replaced.json()) as { applied: boolean; summary: ImportSummaryRow[] };
  expect(body.applied).toBe(true);
  return body.summary;
}
