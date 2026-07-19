import { devices, expect, test } from "@playwright/test";

const iphone = devices["iPhone 13"];

test.use({
  userAgent: iphone.userAgent,
  viewport: iphone.viewport,
  deviceScaleFactor: iphone.deviceScaleFactor,
  isMobile: iphone.isMobile,
  hasTouch: iphone.hasTouch,
});

test("PTR 취소 시 safe-area 레이어를 움직이지 않고 상태를 정리한다", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.navigator, "standalone", {
      configurable: true,
      get: () => true,
    });
  });

  // 신규 CI 사용자는 홈에서 온보딩으로 비동기 이동할 수 있다. PTR 자체를 검증하는
  // 테스트이므로 온보딩 상태와 무관하게 앱 셸이 렌더되는 설정 화면에서 시작한다.
  await page.goto("/settings");

  const pathname = new URL(page.url()).pathname;
  test.skip(pathname === "/login", "외부 Preview에는 인증 테스트 사용자가 없습니다.");

  const ptr = page.locator(".ptr");
  const shell = page.locator(".app-shell");
  const main = page.locator(".app-main");
  const content = page.locator(".app-shell__content");

  await expect(ptr).toBeAttached();
  await expect(ptr).toHaveCSS("position", "absolute");
  await expect(shell).toHaveCSS("position", "relative");

  const dragState = await page.evaluate(() => {
    const target = document.body;
    const touch = (clientY: number) =>
      new Touch({
        identifier: 1,
        target,
        clientX: 100,
        clientY,
        pageX: 100,
        pageY: clientY,
        screenX: 100,
        screenY: clientY,
        radiusX: 1,
        radiusY: 1,
        rotationAngle: 0,
        force: 1,
      });

    const start = touch(10);
    document.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
        touches: [start],
        targetTouches: [start],
        changedTouches: [start],
      }),
    );

    // damp(170px) ≈ 68.7px: 70px 새로고침 임계값 바로 아래.
    const moved = touch(180);
    document.dispatchEvent(
      new TouchEvent("touchmove", {
        bubbles: true,
        cancelable: true,
        touches: [moved],
        targetTouches: [moved],
        changedTouches: [moved],
      }),
    );

    return {
      contentTransform:
        document.querySelector<HTMLElement>(".app-shell__content")?.style
          .transform ?? "",
      mainTransform:
        document.querySelector<HTMLElement>(".app-main")?.style.transform ?? "",
    };
  });

  expect(dragState.contentTransform).toContain("translate3d");
  expect(dragState.mainTransform).toBe("");

  await page.evaluate(() => {
    const target = document.body;
    const moved = new Touch({
      identifier: 1,
      target,
      clientX: 100,
      clientY: 180,
      pageX: 100,
      pageY: 180,
      screenX: 100,
      screenY: 180,
      radiusX: 1,
      radiusY: 1,
      rotationAngle: 0,
      force: 0,
    });
    document.dispatchEvent(
      new TouchEvent("touchend", {
        bubbles: true,
        cancelable: true,
        touches: [],
        targetTouches: [],
        changedTouches: [moved],
      }),
    );
  });

  await expect(content).toHaveCSS("transform", "none");
  await expect(main).toHaveCSS("transform", "none");
  await expect
    .poll(() => content.evaluate((node) => node.style.transition))
    .toBe("");
  await expect(ptr).not.toHaveClass(/is-refreshing/);
});
