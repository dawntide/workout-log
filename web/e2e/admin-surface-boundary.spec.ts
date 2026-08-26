/**
 * 관리자 표면 경계 E2E
 *
 * 더보기 화면에서 링크를 숨기는 것과 서버가 막는 것은 다른 일이다. 링크를 지워도 URL은
 * 남으므로, 이 스펙은 **URL로 직접 두드리는 일반 계정**이 관리자 표면에 닿지 못하는지만
 * 본다(노출 여부는 보지 않는다).
 *
 * 거부만 단언하면 "전부 막힘"도 초록이라, 관리자 쪽 통과를 같은 스펙에서 함께 잠근다.
 */
import { expect, test } from "@playwright/test";

const NAV_TIMEOUT = 30_000;
const TELEMETRY_URL = "/api/stats/migration-telemetry?lookbackMinutes=60&limit=1";
/** 더보기 화면의 관리자 진입점. ko/en 어느 로케일로 떠도 잡히도록 둘 다 받는다. */
const DEBUG_ROW_NAME = /디버그 도구|Debug Tools/;

test.describe("관리자 표면 경계", () => {
  test("일반 계정은 디버그 페이지·마이그레이션 텔레메트리에 닿지 못한다", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `admin-boundary-${suffix}@example.com`;
    const password = "admin-boundary-pw-123";

    // page.request로 가입해야 쿠키가 page 컨텍스트에 실린다 — 별도 컨텍스트인 request
    // 픽스처로 가입하면 이어지는 page.goto가 쿠키 없는(=env 폴백 관리자) 요청이 된다.
    const signup = await page.request.post("/api/auth/signup", {
      data: { email, password },
    });
    expect(signup.status()).toBe(200);

    // 방금 만든 계정은 기본 권한(user)이어야 한다 — 가입 경로가 권한을 주지 않음을 잠근다.
    const me = await page.request.get("/api/auth/me");
    expect(me.status()).toBe(200);
    expect((await me.json()).user?.role).toBe("user");

    // migration_run_log는 사용자 데이터가 아니라 배포 인프라 이력(러너·호스트·실패 메시지).
    const telemetry = await page.request.get(TELEMETRY_URL);
    expect(telemetry.status()).toBe(403);
    expect((await telemetry.json()).checks).toBeUndefined();

    // 페이지는 403 대신 404로 접어 존재 자체를 숨긴다.
    const debugPage = await page.goto("/settings/debug", { timeout: NAV_TIMEOUT });
    expect(debugPage?.status()).toBe(404);

    // 진입점도 사라진다. 계정 카드에 이메일이 뜬 뒤에 확인해야 /api/auth/me가 아직
    // 안 온 순간을 "없음"으로 오독하지 않는다.
    await page.goto("/settings", { timeout: NAV_TIMEOUT });
    await expect(page.getByText(email).first()).toBeVisible();
    await expect(page.getByRole("link", { name: DEBUG_ROW_NAME })).toHaveCount(0);
  });

  test("관리자 계정은 같은 표면에 그대로 닿는다", async ({ page }) => {
    // 쿠키 없는 요청 = CI의 env 폴백 신원, 곧 시드가 role='admin'으로 심는 canonical 계정.
    // 시드가 승격을 놓치면 여기서 먼저 깨진다(디자인 감사 스펙이 /settings/debug를 훑기 전에).
    const me = await page.request.get("/api/auth/me");
    expect(me.status()).toBe(200);
    expect((await me.json()).user?.role).toBe("admin");

    // 이 라우트의 상태 코드는 **마이그레이션 건강도**다(정상 200, pending이면 503) — 인가와
    // 무관하게 흔들리므로 거기에 단언을 걸지 않는다. 인가가 통과했는지는 인프라 payload가
    // 실제로 실려 왔는지로 본다.
    const telemetry = await page.request.get(TELEMETRY_URL);
    expect(telemetry.status()).not.toBe(403);
    expect((await telemetry.json()).checks?.migrations).toBeTruthy();

    const debugPage = await page.goto("/settings/debug", { timeout: NAV_TIMEOUT });
    expect(debugPage?.status()).toBe(200);

    // 반대 방향 회귀 — 게이트가 과하게 걸려 관리자에게서도 진입점이 사라지면 여기서 깨진다.
    await page.goto("/settings", { timeout: NAV_TIMEOUT });
    await expect(page.getByRole("link", { name: DEBUG_ROW_NAME })).toBeVisible();
  });
});
