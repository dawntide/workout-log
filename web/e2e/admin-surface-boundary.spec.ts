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

  test("일반 계정은 테스트 계정으로 전환할 수 없다", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const email = `impersonate-denied-${suffix}@example.com`;

    const signup = await page.request.post("/api/auth/signup", {
      data: { email, password: "impersonate-denied-pw-123" },
    });
    expect(signup.status()).toBe(200);

    // 전환은 관리자 표면이다. 여기가 열리면 아무나 다른 계정의 세션을 발급받는다.
    const attempt = await page.request.post("/api/admin/impersonate");
    expect(attempt.status()).toBe(403);

    // 전환하지 않았으니 복귀도 없다(마커 없음 → 400).
    const back = await page.request.post("/api/admin/impersonate/return");
    expect(back.status()).toBe(400);
  });

  test("관리자는 테스트 계정으로 전환했다가 돌아온다", async ({ page }) => {
    const before = await (await page.request.get("/api/auth/me")).json();
    expect(before.user?.role).toBe("admin");
    const adminId = before.user?.id;

    const switched = await page.request.post("/api/admin/impersonate");
    expect(switched.status()).toBe(200);

    // 전환 후에는 문자 그대로 그 테스트 계정의 사용자다 — 신원·권한이 함께 바뀐다.
    const during = await (await page.request.get("/api/auth/me")).json();
    expect(during.user?.role).toBe("test");
    expect(during.user?.id).not.toBe(adminId);
    expect(during.user?.impersonating).toBe(true);

    // 전환 중에는 관리자 표면이 닫힌다. 그래서 복귀 경로가 그 페이지 밖에 있어야 한다.
    const debugWhileSwitched = await page.goto("/settings/debug", { timeout: NAV_TIMEOUT });
    expect(debugWhileSwitched?.status()).toBe(404);

    // 중첩 전환 금지 — 허용하면 복귀 마커가 덮여 원래 신원으로 못 돌아간다.
    expect((await page.request.post("/api/admin/impersonate")).status()).toBe(403);

    const returned = await page.request.post("/api/admin/impersonate/return");
    expect(returned.status()).toBe(200);

    const after = await (await page.request.get("/api/auth/me")).json();
    expect(after.user?.role).toBe("admin");
    expect(after.user?.id).toBe(adminId);
    expect(after.user?.impersonating).toBe(false);
  });

  test("전환 중에는 복귀 알약이 화면마다 뜨고, 펼쳐서 돌아온다", async ({ page }) => {
    expect((await page.request.post("/api/admin/impersonate")).status()).toBe(200);

    // 알약이 유일한 복귀 경로다(관리자 페이지는 전환 중 404). 안 뜨면 갇힌다 —
    // 그래서 API가 아니라 실제 렌더를 본다.
    const pill = page.getByRole("button", {
      name: /테스트 계정 메뉴 열기|Open test account menu/,
    });

    // AppShell에 있으므로 화면을 옮겨도 유지된다.
    await page.goto("/calendar", { timeout: NAV_TIMEOUT });
    await expect(pill).toBeVisible();

    // 온보딩에서 **누른다**. 새 브라우저는 온보딩을 안 끝낸 상태라 전환 직후 여기로
    // 떨어지는데, 이 화면은 position:fixed·z-index:90 오버레이다. 알약을 그 아래 두면
    // 렌더는 되면서 가려져 눌리지 않는다(배너 시절 실측). toBeVisible()은 가림을 못 보고
    // click()은 히트 테스트를 하므로, 그 회귀는 이 클릭만이 잡는다.
    await page.goto("/onboarding", { timeout: NAV_TIMEOUT });
    await expect(pill).toBeVisible();
    await pill.click();

    // 펼치면 지금 누구인지와 복귀 버튼이 나온다.
    await expect(
      page.getByText(/테스트 계정 사용 중|Using a test account/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /관리자로 돌아가기|Return to admin/ })
      .click();

    // 복귀는 클릭 핸들러 안에서 비동기로 끝난다(POST → 캐시 정리 → 리로드). 클릭 직후를
    // 재면 아직 진행 중이라 impersonating이 true로 잡힌다 — 서버 상태가 뒤집힐 때까지 본다.
    await expect
      .poll(
        async () => (await (await page.request.get("/api/auth/me")).json()).user?.impersonating,
        { timeout: NAV_TIMEOUT },
      )
      .toBe(false);
    await expect(pill).toBeHidden({ timeout: NAV_TIMEOUT });
    const me = await (await page.request.get("/api/auth/me")).json();
    expect(me.user?.role).toBe("admin");
  });

  test("복귀 알약은 드래그로 옮기면 그 자리를 기억한다", async ({ page }) => {
    expect((await page.request.post("/api/admin/impersonate")).status()).toBe(200);
    await page.goto("/calendar", { timeout: NAV_TIMEOUT });

    const pill = page.getByRole("button", {
      name: /테스트 계정 메뉴 열기|Open test account menu/,
    });
    await expect(pill).toBeVisible();

    // **hover로 시작한다.** page.mouse는 좌표만 쏘고 액셔너빌리티 검사를 건너뛴다 —
    // 앱 시작 스플래시가 아직 덮고 있으면 눌림이 그 오버레이로 가고 드래그가 통째로
    // 무효가 된다(실측: elementFromPoint가 버튼 밖 DIV를 돌려줬다). hover는 요소가
    // 실제로 이벤트를 받을 수 있을 때까지 기다린 뒤 중앙으로 커서를 옮긴다.
    await pill.hover();
    const before = await pill.boundingBox();
    expect(before).not.toBeNull();

    // 드래그 — 임계값(6px)을 넘겨 움직인다. 넘긴 뒤에는 탭으로 해석되면 안 되므로
    // 패널이 펼쳐지지 않아야 한다(둘을 한 제스처로 구분하는 것이 이 UI의 핵심이다).
    await page.mouse.down();
    await page.mouse.move(before!.x + 20, before!.y - 120, { steps: 8 });
    await page.mouse.up();

    await expect(
      page.getByRole("button", { name: /관리자로 돌아가기|Return to admin/ }),
    ).toHaveCount(0);

    // mouse.up()은 이벤트를 쏘고 바로 돌아온다 — 그 직후 boundingBox를 읽으면 React가
    // 아직 리렌더하지 않아 옛 좌표가 잡힌다(진단 로그를 끼웠더니 통과했던 이유가 이것이다).
    // 좌표가 실제로 바뀔 때까지 기다린다.
    await expect
      .poll(async () => Math.round((await pill.boundingBox())!.y), { timeout: NAV_TIMEOUT })
      .toBeLessThan(Math.round(before!.y));
    const after = await pill.boundingBox();
    expect(after).not.toBeNull();

    // 다른 화면으로 옮겨도 그 자리를 기억한다(저장된 위치를 다시 읽는다).
    await page.goto("/plans", { timeout: NAV_TIMEOUT });
    await expect(pill).toBeVisible();
    const restored = await pill.boundingBox();
    expect(Math.abs(restored!.y - after!.y)).toBeLessThan(4);

    expect((await page.request.post("/api/admin/impersonate/return")).status()).toBe(200);
  });

  test("알약 패널이 전환 중 테스트 도구를 대신 제공한다", async ({ page }) => {
    // 전환 중에는 role이 test라 /settings/debug도, 설정의 관리자용 데이터 항목도 닿지
    // 않는다. 그 도구들이 패널에 있어야 테스트 세션이 성립한다.
    expect((await page.request.post("/api/admin/impersonate")).status()).toBe(200);

    // 빈 상태에서 시작해야 아래 시드 단언이 공허해지지 않는다.
    expect(
      (
        await page.request.post("/api/settings/app-reset", {
          data: { confirmToken: "RESET_APP_DATA" },
        })
      ).status(),
    ).toBe(200);

    await page.goto("/calendar", { timeout: NAV_TIMEOUT });
    const pill = page.getByRole("button", {
      name: /테스트 계정 메뉴 열기|Open test account menu/,
    });
    await pill.hover();
    await pill.click();

    const seed = page.getByRole("button", { name: /데모 데이터 시드|Seed demo data/ });
    await expect(seed).toBeVisible();
    await expect(
      page.getByRole("button", { name: /캐시 비우고 새로고침|Clear caches/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /앱 데이터 초기화|Reset app data/ }),
    ).toBeVisible();

    // 껍데기가 아닌지 — 하나는 실제로 눌러 결과를 본다.
    await seed.click();
    await expect
      .poll(
        async () => {
          const logs = await (await page.request.get("/api/logs?limit=1")).json();
          return Array.isArray(logs.items) ? logs.items.length : 0;
        },
        { timeout: 60_000 },
      )
      .toBeGreaterThan(0);

    expect((await page.request.post("/api/admin/impersonate/return")).status()).toBe(200);
  });

  test("데모 플랜 시드는 테스트 계정에서만 돈다", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await page.request.post("/api/auth/signup", {
      data: { email: `demo-seed-denied-${suffix}@example.com`, password: "demo-seed-pw-123" },
    });

    // 일반 계정에 데모 데이터를 쏟아붓지 못한다.
    const denied = await page.request.post("/api/settings/seed-demo-data", { data: {} });
    expect(denied.status()).toBe(403);
    expect((await page.request.get("/api/plans")).ok()).toBe(true);
  });

  test("전환한 테스트 계정에 데모 플랜과 기록이 시드된다", async ({ page }) => {
    expect((await page.request.post("/api/admin/impersonate")).status()).toBe(200);

    const seeded = await page.request.post("/api/settings/seed-demo-data", { data: {} });
    expect(seeded.status()).toBe(200);
    const summary = (await seeded.json()).summary;

    const plans = await (await page.request.get("/api/plans")).json();
    expect(Array.isArray(plans.items) ? plans.items.length : 0).toBeGreaterThan(0);

    // 플랜만 있고 기록이 없으면 통계·캘린더가 빈 화면이라 데모의 목적을 못 이룬다.
    expect(summary?.logCount).toBeGreaterThan(0);
    const logs = await (await page.request.get("/api/logs?limit=5")).json();
    expect(Array.isArray(logs.items) ? logs.items.length : 0).toBeGreaterThan(0);

    // 기록에서 파생되는 화면이 실제로 채워지는지 — 집계가 비어 있으면 시드가 무의미하다.
    const strength = await (await page.request.get("/api/stats/strength-summary")).json();
    expect(Array.isArray(strength.items) ? strength.items.length : 0).toBeGreaterThan(0);

    // 재실행이 쌓이지 않는다(데모 태그 기록만 갈아 끼운다).
    const again = await page.request.post("/api/settings/seed-demo-data", { data: {} });
    expect(again.status()).toBe(200);
    expect((await again.json()).summary?.logCount).toBe(summary.logCount);

    expect((await page.request.post("/api/admin/impersonate/return")).status()).toBe(200);
  });

  test("초기화는 호출자 본인 데이터만 지운다", async ({ page, playwright, baseURL }) => {
    // app-reset은 where 없이 workout_log·plan·user_setting을 비웠다 — 한 사람의
    // "초기화"가 전 사용자의 기록을 지웠다. 평범한 계정 둘로 그 범위를 잰다.
    //
    // 관리자를 쓰지 않는 이유: CI의 관리자는 쿠키 없는 env 폴백 신원인데, 그 폴백은
    // **web에만** 열려 있고 apps/api(=/api/settings)에는 WORKOUT_API_ALLOW_ENV_AUTH가
    // 없어 401이다. 로컬은 NODE_ENV가 production이 아니라 통과해서, 그 차이에 기댄
    // 이전 버전이 로컬에서만 초록이었다.
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const password = "reset-scope-pw-123";

    // A — 남아 있어야 하는 쪽. 설정은 종전 초기화가 통째로 비우던 테이블이다.
    const signupA = await page.request.post("/api/auth/signup", {
      data: { email: `reset-scope-keep-${suffix}@example.com`, password },
    });
    expect(signupA.status()).toBe(200);
    expect(
      (await page.request.patch("/api/settings", {
        data: { key: "prefs.autoSync", value: false },
      })).ok(),
    ).toBe(true);

    // B — 초기화를 실행하는 다른 계정. 쿠키 병을 나누려고 별도 컨텍스트를 쓴다.
    const other = await playwright.request.newContext({ baseURL });
    try {
      const signupB = await other.post("/api/auth/signup", {
        data: { email: `reset-scope-run-${suffix}@example.com`, password },
      });
      expect(signupB.status()).toBe(200);
      const reset = await other.post("/api/settings/app-reset", {
        data: { confirmToken: "RESET_APP_DATA" },
      });
      expect(reset.status()).toBe(200);
    } finally {
      await other.dispose();
    }

    const settings = await (await page.request.get("/api/settings")).json();
    expect(settings.settings?.["prefs.autoSync"]).toBe(false);
  });
});
