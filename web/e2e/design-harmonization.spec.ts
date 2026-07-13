import { expect, test, type Page } from "@playwright/test";
import { designHarmonizationTargets } from "./design-harmonization.targets";

type ColorScheme = "light" | "dark";
type AuditMetrics = {
  htmlBg: string;
  bodyBg: string;
  mainBg: string;
  uiCardBg: string | null;
  bgWhiteBg: string | null;
  bottomSheetVisible: boolean;
  bottomSheetPanelBg: string | null;
  hasSettingsModalBackground: boolean;
  settingsModalBackgroundOpacity: number | null;
};

const strictVisualRegression = process.env.DESIGN_HARMONIZATION_VISUAL_STRICT === "1";
const colorSchemes = (process.env.DESIGN_HARMONIZATION_COLOR_SCHEMES ?? "light,dark")
  .split(",")
  .map((item) => item.trim())
  .filter((item): item is ColorScheme => item === "light" || item === "dark");

function parseRgb(color: string) {
  const match = color.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

function colorDistance(left: string, right: string) {
  const l = parseRgb(left);
  const r = parseRgb(right);
  if (!l || !r) return null;
  const dr = l[0] - r[0];
  const dg = l[1] - r[1];
  const db = l[2] - r[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

const contextDestroyedPattern = /Execution context was destroyed/i;

async function waitForStableRoute(page: Page) {
  let previousUrl = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(220);
    const currentUrl = page.url();
    if (currentUrl === previousUrl) return;
    previousUrl = currentUrl;
  }
}

async function addFreezeStyle(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.addStyleTag({
        content:
          "*,:before,:after{animation:none!important;transition:none!important;caret-color:transparent!important;}.program-list-card{content-visibility:visible!important;contain-intrinsic-size:auto!important;}",
      });
      return;
    } catch (error) {
      if (!contextDestroyedPattern.test(String(error))) throw error;
      await waitForStableRoute(page);
    }
  }
}

async function readAuditMetrics(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.evaluate((): AuditMetrics => {
        const main = document.querySelector<HTMLElement>(".app-shell-main");
        const firstUiCard = document.querySelector<HTMLElement>(".ui-card, .motion-card");
        const firstBgWhite = document.querySelector<HTMLElement>(".bg-white");
        const firstPanel = document.querySelector<HTMLElement>(".mobile-bottom-sheet-panel");
        const settingsModalBg = document.querySelector<HTMLElement>(".settings-child-modal-background");

        return {
          htmlBg: window.getComputedStyle(document.documentElement).backgroundColor,
          bodyBg: window.getComputedStyle(document.body).backgroundColor,
          mainBg: main ? window.getComputedStyle(main).backgroundColor : "rgba(0, 0, 0, 0)",
          uiCardBg: firstUiCard ? window.getComputedStyle(firstUiCard).backgroundColor : null,
          bgWhiteBg: firstBgWhite ? window.getComputedStyle(firstBgWhite).backgroundColor : null,
          bottomSheetVisible: Boolean(firstPanel && firstPanel.getBoundingClientRect().height > 0),
          bottomSheetPanelBg: firstPanel ? window.getComputedStyle(firstPanel).backgroundColor : null,
          hasSettingsModalBackground: Boolean(settingsModalBg),
          settingsModalBackgroundOpacity: settingsModalBg
            ? Number(window.getComputedStyle(settingsModalBg).opacity)
            : null,
        };
      });
    } catch (error) {
      if (!contextDestroyedPattern.test(String(error))) throw error;
      await waitForStableRoute(page);
    }
  }

  throw new Error("Failed to evaluate audit metrics after retries.");
}

test.describe("design harmonization: full-screen audit", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const target of designHarmonizationTargets) {
    for (const colorScheme of colorSchemes) {
      test(`${target.id} (${colorScheme}) surface consistency`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(target.path, { waitUntil: "domcontentloaded" });
        await waitForStableRoute(page);

        if (target.expectsBottomSheet) {
          await expect(page.locator(".mobile-bottom-sheet-panel").first()).toBeVisible();
        }

        await addFreezeStyle(page);
        const metrics = await readAuditMetrics(page);

        const hasSurfaceBg = [metrics.htmlBg, metrics.bodyBg, metrics.mainBg].some((value) => value !== "rgba(0, 0, 0, 0)");
        expect(hasSurfaceBg).toBe(true);

        if (metrics.mainBg !== "rgba(0, 0, 0, 0)") {
          expect(metrics.mainBg).not.toBe("rgba(0, 0, 0, 0)");
        }

        if (metrics.uiCardBg && metrics.bgWhiteBg) {
          const distance = colorDistance(metrics.uiCardBg, metrics.bgWhiteBg);
          expect(distance).not.toBeNull();
          if (distance !== null) {
            expect(distance).toBeLessThanOrEqual(4);
          }
        }

        if (target.expectsBottomSheet) {
          expect(metrics.bottomSheetVisible).toBe(true);
        }

        // backdrop 요소는 검사하지 않는다 — blur backdrop은 Safari 상태바 배경색
        // 오염 때문에 의도적으로 제거됨(ddb1b7b). 시트는 패널 배경 + 외부 클릭 닫기만 가진다.
        if (metrics.bottomSheetVisible) {
          expect(metrics.bottomSheetPanelBg).not.toBeNull();
        }

        if (metrics.hasSettingsModalBackground) {
          expect(metrics.settingsModalBackgroundOpacity).not.toBeNull();
          if (metrics.settingsModalBackgroundOpacity !== null) {
            expect(metrics.settingsModalBackgroundOpacity).toBeGreaterThanOrEqual(0.65);
            expect(metrics.settingsModalBackgroundOpacity).toBeLessThanOrEqual(0.9);
          }
        }

        const screenshot = await page.screenshot({ fullPage: true });
        await test.info().attach(`design-harmonization-${target.id}-${colorScheme}`, {
          body: screenshot,
          contentType: "image/png",
        });

        if (strictVisualRegression) {
          expect(screenshot).toMatchSnapshot(`design-harmonization-${target.id}-${colorScheme}.png`, {
            maxDiffPixelRatio: 0.012,
          });
          return;
        }

        // non-blank 휴리스틱. 15KB는 과도했음 — CI(390×844, flat paper 톤) 실측에서
        // 유효한 sparse 화면들이 11.1~14.8KB로 걸림(2026-07-06 nightly 트리아지).
        // 진짜 blank(단색) PNG는 ~3-5KB라 8KB면 여전히 빈 화면을 잡는다.
        expect(screenshot.byteLength).toBeGreaterThan(8_000);
      });
    }
  }
});
