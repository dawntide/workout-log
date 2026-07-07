import { expect, test, type Locator, type Page, type Request, type Route } from "@playwright/test";

const delayedMs = 780;

type EndpointBody = unknown | ((url: URL) => unknown);

type MockEndpoint = {
  id: string;
  path: string | RegExp;
  method?: string;
  body: EndpointBody;
  status?: number;
  delayMs?: number;
};

type InstalledApiMocks = {
  assertHit: (id: string) => void;
};

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fulfillJson(route: Route, body: unknown, status = 200, delay = delayedMs) {
  await sleep(delay);
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body),
  });
}

function endpointMatches(endpoint: MockEndpoint, request: Request, url: URL) {
  if (endpoint.method && request.method() !== endpoint.method) return false;
  if (typeof endpoint.path === "string") return url.pathname === endpoint.path;
  return endpoint.path.test(url.pathname);
}

async function installApiMocks(page: Page, endpoints: MockEndpoint[]): Promise<InstalledApiMocks> {
  const hitCountById = new Map<string, number>();

  await page.context().route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = endpoints.find((candidate) => endpointMatches(candidate, request, url));

    if (!endpoint) {
      await route.fulfill({
        status: 503,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          error: `Unmocked API request: ${request.method()} ${url.pathname}${url.search}`,
        }),
      });
      return;
    }

    hitCountById.set(endpoint.id, (hitCountById.get(endpoint.id) ?? 0) + 1);
    const payload = typeof endpoint.body === "function" ? endpoint.body(url) : endpoint.body;
    await fulfillJson(route, payload, endpoint.status ?? 200, endpoint.delayMs ?? delayedMs);
  });

  return {
    assertHit: (id: string) => {
      expect(hitCountById.get(id) ?? 0).toBeGreaterThan(0);
    },
  };
}

async function assertNeverVisibleDuring(locator: Locator, durationMs: number, sampleMs = 50) {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    const visible = await locator.first().isVisible().catch(() => false);
    expect(visible).toBe(false);
    await locator.page().waitForTimeout(sampleMs);
  }
}

function buildE1rmPayload(rangeDays: number) {
  const isShortRange = rangeDays <= 30;
  const series = isShortRange
    ? [{ date: "2026-03-01", e1rm: 196, weightKg: 170, reps: 3 }]
    : [
        { date: "2026-02-10", e1rm: 188, weightKg: 165, reps: 2 },
        { date: "2026-03-01", e1rm: 196, weightKg: 170, reps: 3 },
      ];
  return {
    from: isShortRange ? "2026-02-03" : "2025-12-01",
    to: "2026-03-04",
    rangeDays,
    exercise: "Back Squat",
    exerciseId: "sq-1",
    best: { date: "2026-03-01", e1rm: 196, weightKg: 170, reps: 3 },
    series,
  };
}

// /stats 라우트는 홈 stats 덱으로 통합됨(7182561). defer1rmBootstrap=1이면 page-bootstrap이
// 필터 옵션·e1rm을 비워서 돌려주고, 1rm 컨트롤러가 클라이언트에서 /api/exercises·/api/plans·
// /api/stats/e1rm을 지연 fetch한다 — 구 스펙의 지연쿼리 시나리오가 덱 밑에서 그대로 성립.
const deferredPageBootstrap = {
  initialBundle: { sessions30d: 0, tonnage30d: 0, prs90d: [] },
  initialExercises: undefined,
  initialPlans: undefined,
  initialE1rm: null,
  initialVolumeWeekly: null,
  initialSelectedExerciseId: null,
  initialSelectedPlanId: "",
  goal: "general",
  goalMetrics: { muscleVolume: null, strengthScore: null, endurance: null },
  asymptoteMonitor: null,
};

test.describe("stats-1rm async continuity", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      // 홈 첫 방문 온보딩 redirect 억제 — 이 스펙의 관심사는 1rm 패널의 지연쿼리 UX.
      window.localStorage.setItem("workout-log.v2.onboarding.done", "1");
    });
  });

  test("keeps empty state hidden across delayed range transition", async ({ page }) => {
    const e1rmDaysRequests: number[] = [];
    const apiMocks = await installApiMocks(page, [
      {
        id: "settings.snapshot",
        method: "GET",
        path: "/api/settings",
        delayMs: 120,
        body: { settings: {} },
      },
      {
        id: "stats.pageBootstrap",
        method: "GET",
        path: "/api/stats/page-bootstrap",
        delayMs: 120,
        body: deferredPageBootstrap,
      },
      {
        id: "options.exercises",
        method: "GET",
        path: "/api/exercises",
        body: {
          items: [
            { id: "sq-1", name: "Back Squat" },
            { id: "bp-1", name: "Bench Press" },
          ],
        },
      },
      {
        id: "options.plans",
        method: "GET",
        path: "/api/plans",
        body: {
          items: [{ id: "plan-1", name: "Mock Plan" }],
        },
      },
      {
        id: "stats.e1rm",
        method: "GET",
        path: "/api/stats/e1rm",
        body: (url: URL) => {
          const days = Number(url.searchParams.get("days") ?? "90");
          e1rmDaysRequests.push(days);
          return buildE1rmPayload(days);
        },
      },
    ]);

    await page.goto("/?deck=stats&defer1rmBootstrap=1", { waitUntil: "domcontentloaded" });

    const chartEmptyState = page.getByText("선택한 필터 조합에 데이터가 없습니다", { exact: true });
    await assertNeverVisibleDuring(chartEmptyState, 700);

    await expect(page.getByRole("heading", { name: "e1RM 상세 추이" })).toBeVisible();
    await expect(page.locator(".metric-value").first()).toBeVisible();
    await expect(chartEmptyState).toBeHidden();

    // "1M" 프리셋 버튼 클릭으로 범위 전환 (30일)
    await page.getByRole("button", { name: "1M", exact: true }).click();

    await assertNeverVisibleDuring(chartEmptyState, 700);
    await expect(page.getByRole("heading", { name: "e1RM 상세 추이" })).toBeVisible();
    await expect(chartEmptyState).toBeHidden();

    apiMocks.assertHit("stats.pageBootstrap");
    apiMocks.assertHit("options.exercises");
    apiMocks.assertHit("options.plans");
    apiMocks.assertHit("stats.e1rm");
    expect(e1rmDaysRequests).toContain(90);
    expect(e1rmDaysRequests).toContain(30);
  });

  test("shows exercise-empty state only after options query settles", async ({ page }) => {
    const apiMocks = await installApiMocks(page, [
      {
        id: "settings.snapshot",
        method: "GET",
        path: "/api/settings",
        delayMs: 120,
        body: { settings: {} },
      },
      {
        id: "stats.pageBootstrap",
        method: "GET",
        path: "/api/stats/page-bootstrap",
        delayMs: 120,
        body: deferredPageBootstrap,
      },
      {
        id: "options.exercises",
        method: "GET",
        path: "/api/exercises",
        delayMs: 860,
        body: { items: [] },
      },
      {
        id: "options.plans",
        method: "GET",
        path: "/api/plans",
        delayMs: 860,
        body: { items: [] },
      },
    ]);

    await page.goto("/?deck=stats&defer1rmBootstrap=1", { waitUntil: "domcontentloaded" });

    const noExerciseState = page.getByText("운동종목이 없습니다", { exact: true });
    await assertNeverVisibleDuring(noExerciseState, 760);
    await expect(noExerciseState).toBeVisible();

    apiMocks.assertHit("stats.pageBootstrap");
    apiMocks.assertHit("options.exercises");
    apiMocks.assertHit("options.plans");
  });
});
