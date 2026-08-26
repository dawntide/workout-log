import { expect, test, type Page } from "@playwright/test";
import { designHarmonizationTargets, type DesignHarmonizationTarget } from "./design-harmonization.targets";
import { MIN_SURFACE_DELTA_E, deltaE, flattenStack } from "./surface-contrast";

type ColorScheme = "light" | "dark";
/**
 * 보이는 카드 하나와 **그 아래 색 스택**.
 *
 * 최근접 조상 하나만 잡으면 안 된다 — 그 조상이 반투명하면(다크 테마의
 * `--v2-accent-weak`은 전부 알파 0.14~0.17이다) 실제로 눈에 보이는 색은 더 아래까지
 * 합성해야 나온다. `stack[0]`이 카드, 나머지가 배경 스택이며 **불투명한 색을 만나면
 * 멈춘다.**
 */
type CardSurface = { stack: string[]; label: string };
type AuditMetrics = {
  htmlBg: string;
  bodyBg: string;
  mainBg: string;
  mainPresent: boolean;
  cardCount: number;
  cardSurfaces: CardSurface[];
  bottomSheetVisible: boolean;
  bottomSheetPanelBg: string | null;
};

const strictVisualRegression = process.env.DESIGN_HARMONIZATION_VISUAL_STRICT === "1";
const colorSchemes = (process.env.DESIGN_HARMONIZATION_COLOR_SCHEMES ?? "light,dark")
  .split(",")
  .map((item) => item.trim())
  .filter((item): item is ColorScheme => item === "light" || item === "dark");

/**
 * 이 감사가 읽는 셀렉터 전부. **한 번도 매치되지 않으면 실패한다**(맨 아래 afterAll).
 *
 * 이 장치가 없어서 감사가 조용히 썩었다 — 2026-08-26 실측 시점에 스펙이 읽던
 * `.app-shell-main`·`.ui-card`·`.motion-card`·`.bg-white`·`.settings-child-modal-background`
 * **다섯 개가 소스에 존재하지 않았다**(V2 전환·2026-07 설정 IA 개편으로 사라짐).
 * 관련 단언은 전부 `if (없으면 건너뛴다)` 안에 있어 **초록으로 통과했다.**
 * 이름이 다시 바뀌면 이번에는 테스트가 말한다.
 */
const AUDITED_SELECTORS = {
  main: ".app-main",
  card: ".v2-card",
  sheetPanel: ".mobile-bottom-sheet-panel",
} as const;
const selectorHits = new Map<string, number>(
  Object.values(AUDITED_SELECTORS).map((selector) => [selector, 0]),
);
const auditedTargetIds = new Set<string>();

const TRANSPARENT = "rgba(0, 0, 0, 0)";
const contextDestroyedPattern = /Execution context was destroyed/i;

/**
 * 목적지가 실제로 그려질 때까지 기다린다.
 *
 * 이전 구현(`waitForStableRoute`)은 **URL이 두 번 연속 같으면 끝**으로 봤는데, 셤에서는
 * 리다이렉트가 아직 시작도 안 해 URL이 "이미 안정"이라 곧바로 통과했다. 그 뒤의
 * addStyleTag·evaluate는 "Execution context destroyed" 재시도로 어떻게든 버텼지만
 * **screenshot에는 재시도가 없어** 빈 셤이 그대로 찍혔다.
 *
 * 그래서 URL 안정성 대신 세 가지를 기다린다: 선언된 도착지 → load → 렌더된 본문.
 */
async function settleRoute(page: Page, target: DesignHarmonizationTarget) {
  if (target.redirectsTo) {
    const destination = target.redirectsTo;
    await page.waitForURL((url) => url.pathname === destination, { timeout: 20_000 });
  }
  await page.waitForLoadState("load");
  // `.app-main`은 전 화면 공통 셸이라 화면별 지식 없이 쓸 수 있는 유일한 앵커다.
  await expect(page.locator(AUDITED_SELECTORS.main)).toBeVisible({ timeout: 20_000 });
  await waitForRenderedContent(page);
}

/**
 * DOM 노드 수가 두 번 연속 같아질 때까지 기다린다 — 스켈레톤→실제 전환을 넘긴다.
 *
 * 본문 텍스트 길이가 아니라 **노드 수**를 보는 이유: 타이머·시계가 있는 화면에서
 * 텍스트는 영원히 안 멈춘다.
 *
 * 예산은 6초다. 로컬 실측에서 가장 느린 화면이 load 후 ~1.5초에 안정됐고, CI 러너는
 * 이 머신보다 느리므로 4배 여유를 둔다. 안정되면 즉시 빠져나오므로 빠른 화면에는
 * 비용이 없다. **예산을 넘겨도 던지지 않는다** — 여기서 실패시키면 원인이 "대기가
 * 부족했다"로만 보이고, 실제 판정은 아래 빈-화면 단언이 한다.
 */
const CONTENT_SETTLE_POLL_MS = 150;
const CONTENT_SETTLE_ATTEMPTS = 40;

async function waitForRenderedContent(page: Page) {
  let previous = -1;
  for (let attempt = 0; attempt < CONTENT_SETTLE_ATTEMPTS; attempt += 1) {
    const count = await page
      .evaluate(() => document.querySelectorAll("*").length)
      .catch(() => -1);
    if (count > 0 && count === previous) return;
    previous = count;
    await page.waitForTimeout(CONTENT_SETTLE_POLL_MS);
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
      // settleRoute가 경로를 확정한 뒤라 여기까지 오는 일은 드물다 — 하이드레이션과
      // 겹치는 경우를 위한 백스톱이지, 더는 주 메커니즘이 아니다.
      if (!contextDestroyedPattern.test(String(error))) throw error;
      await page.waitForTimeout(220);
    }
  }
}

async function readAuditMetrics(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // 셀렉터를 인자로 넘긴다 — 여기에 문자열을 다시 적으면 썩음 가드가 감시하는
      // 이름과 실제로 읽는 이름이 갈라져, 가드가 엉뚱한 셀렉터를 지키게 된다.
      return await page.evaluate((selectors): AuditMetrics => {
        const NONE = "rgba(0, 0, 0, 0)";
        const main = document.querySelector<HTMLElement>(selectors.main);
        const firstPanel = document.querySelector<HTMLElement>(selectors.sheetPanel);

        // 안 보이는 표면은 감사하지 않는다 — 닫힌 시트·접힌 아코디언의 카드까지
        // 재면 "화면에서 구분되는가"라는 질문과 무관한 실패가 난다.
        const isVisible = (element: HTMLElement) => {
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          if (element.closest("[inert]") || element.closest("[aria-hidden='true']")) return false;
          let node: HTMLElement | null = element;
          while (node) {
            const style = window.getComputedStyle(node);
            if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
              return false;
            }
            node = node.parentElement;
          }
          return true;
        };

        // 완전 불투명한 색인지(브라우저는 항상 rgb()/rgba()/color()로 돌려준다).
        const opaque = (color: string) => {
          if (color === NONE) return false;
          const alpha = color.match(/[\d.]+\s*\)$/);
          if (!color.includes("rgba") && !color.includes("/")) return true;
          return alpha ? Number(alpha[0].slice(0, -1)) >= 0.999 : true;
        };

        const cards = Array.from(document.querySelectorAll<HTMLElement>(selectors.card));
        const cardSurfaces = [];
        for (const card of cards) {
          if (!isVisible(card)) continue;
          const cardBg = window.getComputedStyle(card).backgroundColor;
          // 투명한 카드는 표면을 만들지 않는다(순수 레이아웃 래퍼) — 비교 대상이 아니다.
          if (cardBg === NONE) continue;
          // 불투명한 색을 만날 때까지 조상을 모은다. 반투명 배경 위의 카드는
          // 아래까지 합성해야 실제로 보이는 색이 나온다.
          const stack = [cardBg];
          let node: HTMLElement | null = card.parentElement;
          while (node && !opaque(stack[stack.length - 1])) {
            const bg = window.getComputedStyle(node).backgroundColor;
            if (bg !== NONE) stack.push(bg);
            node = node.parentElement;
          }
          // 배경이 하나도 없으면(스택 길이 1) 비교 대상이 없다.
          if (stack.length < 2) continue;
          cardSurfaces.push({
            stack,
            label: (card.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40),
          });
        }

        return {
          htmlBg: window.getComputedStyle(document.documentElement).backgroundColor,
          bodyBg: window.getComputedStyle(document.body).backgroundColor,
          mainBg: main ? window.getComputedStyle(main).backgroundColor : NONE,
          mainPresent: Boolean(main),
          cardCount: cards.length,
          cardSurfaces,
          bottomSheetVisible: Boolean(firstPanel && firstPanel.getBoundingClientRect().height > 0),
          bottomSheetPanelBg: firstPanel ? window.getComputedStyle(firstPanel).backgroundColor : null,
        };
      }, AUDITED_SELECTORS);
    } catch (error) {
      if (!contextDestroyedPattern.test(String(error))) throw error;
      await page.waitForTimeout(220);
    }
  }

  throw new Error("Failed to evaluate audit metrics after retries.");
}

function countHit(selector: string) {
  selectorHits.set(selector, (selectorHits.get(selector) ?? 0) + 1);
}

function recordSelectorHits(metrics: AuditMetrics) {
  if (metrics.mainPresent) countHit(AUDITED_SELECTORS.main);
  if (metrics.cardCount > 0) countHit(AUDITED_SELECTORS.card);
  if (metrics.bottomSheetPanelBg !== null) countHit(AUDITED_SELECTORS.sheetPanel);
}

test.describe("design harmonization: full-screen audit", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const target of designHarmonizationTargets) {
    for (const colorScheme of colorSchemes) {
      test(`${target.id} (${colorScheme}) surface consistency`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await page.goto(target.path, { waitUntil: "domcontentloaded" });
        await settleRoute(page, target);

        if (target.expectsBottomSheet) {
          await expect(page.locator(AUDITED_SELECTORS.sheetPanel).first()).toBeVisible();
        }

        await addFreezeStyle(page);
        const metrics = await readAuditMetrics(page);
        recordSelectorHits(metrics);
        auditedTargetIds.add(target.id);

        // 표면색은 html·body·main 중 어디서 와도 되지만, 아무 데도 없으면 배경이
        // 뚫려 뷰어의 바탕이 비친다.
        const hasSurfaceBg = [metrics.htmlBg, metrics.bodyBg, metrics.mainBg].some(
          (value) => value !== TRANSPARENT,
        );
        expect(hasSurfaceBg, "html·body·main 어디에도 배경색이 없다").toBe(true);

        // 카드 표면 대비 — No-Line Rule의 유일한 계층 구분 수단이 배경색이라,
        // 카드가 그 뒤 배경과 같아지면 카드 자체가 사라진다. 첫 카드만 보던 옛
        // 구현과 달리 **보이는 카드를 전부** 본다(중첩 카드가 정확히 그 함정이었다).
        for (const surface of metrics.cardSurfaces) {
          // 카드가 반투명하면 아래 스택과 합성해야 실제로 보이는 색이 나온다.
          const cardColor = flattenStack(surface.stack);
          const backdropColor = flattenStack(surface.stack.slice(1));
          const distance = cardColor && backdropColor ? deltaE(cardColor, backdropColor) : null;
          expect(
            distance,
            `색 스택을 평탄화하지 못했다: ${surface.stack.join(" over ")}` +
              (surface.label ? ` — "${surface.label}"` : ""),
          ).not.toBeNull();
          if (distance === null) continue;
          expect(
            distance,
            `카드가 뒷배경과 구분되지 않는다 (ΔE ${distance.toFixed(2)} < ${MIN_SURFACE_DELTA_E}): ` +
              `${cardColor} on ${backdropColor}` +
              (surface.label ? ` — "${surface.label}"` : "") +
              "\n중첩 카드라면 표면 사다리를 한 칸 내릴 것(paper → inset).",
          ).toBeGreaterThanOrEqual(MIN_SURFACE_DELTA_E);
        }

        if (target.expectsBottomSheet) {
          expect(metrics.bottomSheetVisible).toBe(true);
        }

        // backdrop 요소는 검사하지 않는다 — blur backdrop은 Safari 상태바 배경색
        // 오염 때문에 의도적으로 제거됨(ddb1b7b). 시트는 패널 배경 + 외부 클릭 닫기만 가진다.
        if (metrics.bottomSheetVisible) {
          expect(metrics.bottomSheetPanelBg).not.toBeNull();
          expect(metrics.bottomSheetPanelBg).not.toBe(TRANSPARENT);
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
        //
        // settleRoute가 붙기 전에는 이 단언이 **경로 경쟁을 잡는 그물** 노릇을 했다
        // (셤을 찍으면 2742바이트). 이제는 원래 목적인 "빈 화면 감지"만 한다.
        expect(screenshot.byteLength).toBeGreaterThan(8_000);
      });
    }
  }

  test.afterAll(() => {
    // 일부만 돌린 실행(-g 필터)에서는 판단할 근거가 없다.
    // ⚠️ 워커가 여럿이면(fullyParallel 또는 샤딩) 이 카운터도 워커마다 갈라져 이 가드가
    // 조용히 건너뛰어진다. 현재 config는 fullyParallel:false·단일 프로젝트라 성립한다.
    if (auditedTargetIds.size < designHarmonizationTargets.length) return;
    const rotted = [...selectorHits].filter(([, hits]) => hits === 0).map(([selector]) => selector);
    if (rotted.length > 0) {
      throw new Error(
        `감사 셀렉터가 어느 화면에서도 매치되지 않았다: ${rotted.join(", ")}\n` +
          "클래스 이름이 바뀌었거나 사라졌다. 셀렉터를 현행으로 갱신하거나, " +
          "대응물이 없어졌다면 관련 단언과 함께 지울 것 — 죽은 셀렉터는 커버리지처럼 보인다.",
      );
    }
  });
});
