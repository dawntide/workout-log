/**
 * Data export + import dry-run E2E
 *
 * Covers:
 * - PR #258: POST /api/me/import dry-run path with valid v1 export shape
 * - existing /api/export?format=json: returns version 1 + arrays
 * - import body validation (rejects unsupported version, rejects missing arrays)
 */
import { expect, test } from "@playwright/test";

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
