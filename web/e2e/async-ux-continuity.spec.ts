import { expect, test, type Locator, type Page, type Request, type Route } from "@playwright/test";

const delayedMs = 850;

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

const commonEndpoints: MockEndpoint[] = [
  {
    id: "settings.snapshot",
    method: "GET",
    path: "/api/settings",
    delayMs: 120,
    body: { settings: {} },
  },
];

// /stats 라우트는 홈 stats 덱으로 통합됨(7182561): 덱 활성 시 StatsContainer가
// /api/stats/page-bootstrap을 클라이언트에서 지연 fetch한다 — 이것이 현재의 지연쿼리
// 표면이다. (plans/manage는 서버 컴포넌트가 initialPlans를 SSR 주입하고 마운트 시
// 클라이언트 fetch가 없어 empty-state flicker 창 자체가 소멸 → 해당 시나리오 삭제.)
const statsDeckEndpoints: MockEndpoint[] = [
  {
    id: "stats.pageBootstrap",
    method: "GET",
    path: "/api/stats/page-bootstrap",
    body: {
      initialBundle: {
        sessions30d: 24,
        tonnage30d: 12500,
        prs90d: [
          {
            exerciseId: "sq-1",
            exerciseName: "Back Squat",
            best: { date: "2026-03-01", e1rm: 195, weightKg: 170, reps: 3 },
            latest: { date: "2026-03-01", e1rm: 195, weightKg: 170, reps: 3 },
            improvement: 7,
          },
        ],
      },
      initialExercises: [
        { id: "sq-1", name: "Back Squat" },
        { id: "bp-1", name: "Bench Press" },
      ],
      initialPlans: [{ id: "plan-1", name: "Mock Plan" }],
      initialE1rm: {
        from: "2025-12-01",
        to: "2026-03-04",
        rangeDays: 90,
        exercise: "Back Squat",
        exerciseId: "sq-1",
        best: { date: "2026-03-01", e1rm: 195, weightKg: 170, reps: 3 },
        series: [
          { date: "2026-02-10", e1rm: 188, weightKg: 165, reps: 2 },
          { date: "2026-03-01", e1rm: 195, weightKg: 170, reps: 3 },
        ],
      },
      initialVolumeWeekly: null,
      initialSelectedExerciseId: "sq-1",
      initialSelectedPlanId: "",
      goal: "general",
      goalMetrics: { muscleVolume: null, strengthScore: null, endurance: null },
      asymptoteMonitor: null,
    },
  },
];

test.describe("async ux continuity: no empty-state flicker on delayed queries", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
      // 홈 첫 방문 온보딩 redirect 억제 — 이 스펙의 관심사는 stats 덱의 지연쿼리 UX.
      window.localStorage.setItem("workout-log.v2.onboarding.done", "1");
    });
  });

  test("stats deck keeps analytic empty states hidden while delayed bootstrap is in flight", async ({ page }) => {
    const apiMocks = await installApiMocks(page, [...commonEndpoints, ...statsDeckEndpoints]);

    await page.goto("/?deck=stats", { waitUntil: "domcontentloaded" });

    const emptyStateLabel = page.getByText("운동종목이 없습니다", { exact: true });
    await assertNeverVisibleDuring(emptyStateLabel, 820);

    await expect(page.getByText("PR 기록 추적", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "e1RM 상세 추이" })).toBeVisible();
    await expect(emptyStateLabel).toBeHidden();

    apiMocks.assertHit("stats.pageBootstrap");
  });
});
