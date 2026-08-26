import { expect, type Page } from "@playwright/test";

import {
  CARD_TONE_BG,
  MIN_SURFACE_DELTA_E,
  deltaE,
  flattenStack,
  sameColor,
} from "./surface-contrast";

/**
 * 화면에 보이는 카드 표면을 재는 공용 루틴.
 *
 * `design-harmonization`(경로만 열고 재는 감사)과 **여정 스펙**이 같이 쓴다. 여정이
 * 필요한 이유는 하나다 — 의미 톤 카드(accent·danger)의 실제 사용처가 전부
 * 상호작용·데이터 상태 뒤에 있어 감사가 닿지 못한다. 여정은 그 상태를 이미 만들며
 * 지나가므로, 지나가는 김에 표면을 재면 된다.
 *
 * **측정을 복제하지 않는 것이 요점이다.** 두 벌이 되면 한쪽만 고쳐지고 다른 쪽이
 * 조용히 낡는다 — 이 감사가 실제로 겪은 실패 방식이다.
 */

/** 카드 하나와 그 아래 색 스택(`stack[0]`이 카드, 불투명한 색을 만나면 멈춘다). */
export type SurfaceSample = { stack: string[]; label: string };

const CONTEXT_DESTROYED = /Execution context was destroyed/i;

/** 기대 상태가 될 때까지 다시 재는 예산(3초). 안정되면 즉시 빠져나온다. */
const SETTLE_POLL_MS = 150;
const SETTLE_ATTEMPTS = 20;

/**
 * 애니메이션·트랜지션을 멈춘다. 전환 중간 색을 재면 실패가 무작위로 난다.
 * 시트가 열리는 도중이 정확히 그 경우다.
 */
export async function freezeMotion(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.addStyleTag({
        content:
          "*,:before,:after{animation:none!important;transition:none!important;caret-color:transparent!important;}" +
          // content-visibility로 지연 렌더되는 카드도 재야 한다.
          ".program-list-card{content-visibility:visible!important;contain-intrinsic-size:auto!important;}",
      });
      return;
    } catch (error) {
      if (!CONTEXT_DESTROYED.test(String(error))) throw error;
      await page.waitForTimeout(220);
    }
  }
}

/** 보이는 `.v2-card` 표면과, 이 화면 테마로 계산한 톤별 색. */
export async function readCardSurfaces(page: Page) {
  return page.evaluate((toneBg: Record<string, string>) => {
    const NONE = "rgba(0, 0, 0, 0)";

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

    const opaque = (color: string) => {
      if (color === NONE) return false;
      const alpha = color.match(/[\d.]+\s*\)$/);
      if (!color.includes("rgba") && !color.includes("/")) return true;
      return alpha ? Number(alpha[0].slice(0, -1)) >= 0.999 : true;
    };

    const surfaces: { stack: string[]; label: string }[] = [];
    for (const card of Array.from(document.querySelectorAll<HTMLElement>(".v2-card"))) {
      if (!isVisible(card)) continue;
      const cardBg = window.getComputedStyle(card).backgroundColor;
      if (cardBg === NONE) continue; // 순수 레이아웃 래퍼 — 표면을 만들지 않는다
      // 배경 스택은 카드 자신의 불투명도와 **무관하게** 모은다.
      const stack = [cardBg];
      let node: HTMLElement | null = card.parentElement;
      while (node) {
        const bg = window.getComputedStyle(node).backgroundColor;
        if (bg !== NONE) {
          stack.push(bg);
          if (opaque(bg)) break;
        }
        node = node.parentElement;
      }
      if (stack.length < 2) continue;
      surfaces.push({
        stack,
        label: (card.innerText || "").trim().replace(/\s+/g, " ").slice(0, 40),
      });
    }

    // 톤 배경식을 이 화면의 테마로 계산한다 — 렌더된 카드가 그 톤인지 **색으로** 대조한다.
    const probe = document.createElement("div");
    probe.style.position = "fixed";
    probe.style.left = "-9999px";
    document.body.appendChild(probe);
    const toneColors: Record<string, string> = {};
    for (const [tone, expr] of Object.entries(toneBg)) {
      probe.style.backgroundColor = "";
      probe.style.backgroundColor = expr;
      toneColors[tone] = window.getComputedStyle(probe).backgroundColor;
    }
    probe.remove();

    return { surfaces, toneColors };
  }, CARD_TONE_BG);
}

/**
 * 지금 화면의 카드 표면이 전부 뒷배경과 구분되는지 단언한다.
 *
 * @param context 실패 메시지에 붙일 화면 이름(어느 여정의 어느 지점인지).
 * @param expectTones 이 화면이 반드시 렌더해야 하는 톤. **색으로** 대조한다 —
 *   라벨 텍스트로 찾으면 우연히 같은 단어로 시작하는 다른 카드가 매치돼 무력해진다.
 */
export async function expectSurfaceContrast(
  page: Page,
  {
    context,
    expectTones = [],
    // 카드가 하나도 없으면 실패시킬지. 기본은 "톤을 기대했다면 당연히 있어야 한다".
    // 화면 전수 감사는 카드가 없는 화면(예: /plans)도 돌므로 여기서 끈다.
    requireSurfaces = expectTones.length > 0,
  }: { context: string; expectTones?: readonly string[]; requireSurfaces?: boolean },
) {
  // **한 번만 샘플링하면 안 된다.** 시트가 열리는 동안(앞 시트가 닫히는 중이면 특히)
  // 카드가 아직 0높이거나 [inert] 안에 있어 측정에서 빠진다. Playwright 단언이
  // 자동 재시도하는 것과 같은 이유로 여기서도 **기대 상태가 될 때까지 다시 잰다.**
  // nightly에서 삭제 확인 시트가 이 이유로 간헐 실패했다(#720에서 교정).
  let surfaces: SurfaceSample[] = [];
  let toneColors: Record<string, string> = {};
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt += 1) {
    await freezeMotion(page);
    ({ surfaces, toneColors } = await readCardSurfaces(page));
    const tonesPresent = expectTones.every((tone) =>
      surfaces.some((surface) => sameColor(surface.stack[0], toneColors[tone])),
    );
    const enough = !requireSurfaces || surfaces.length > 0;
    if (tonesPresent && enough) break;
    await page.waitForTimeout(SETTLE_POLL_MS);
  }

  if (requireSurfaces) {
    expect(surfaces.length, `${context}: 잴 수 있는 카드 표면이 하나도 없다`).toBeGreaterThan(0);
  }

  for (const surface of surfaces) {
    const cardColor = flattenStack(surface.stack);
    const backdropColor = flattenStack(surface.stack.slice(1));
    const distance = cardColor && backdropColor ? deltaE(cardColor, backdropColor) : null;
    expect(
      distance,
      `${context}: 색 스택을 평탄화하지 못했다 — ${surface.stack.join(" over ")}`,
    ).not.toBeNull();
    if (distance === null) continue;
    expect(
      distance,
      `${context}: 카드가 뒷배경과 구분되지 않는다 (ΔE ${distance.toFixed(2)} < ${MIN_SURFACE_DELTA_E}): ` +
        `${cardColor} on ${backdropColor}` +
        (surface.label ? ` — "${surface.label}"` : "") +
        "\n중첩 카드라면 표면 사다리를 한 칸 내릴 것(paper → inset).",
    ).toBeGreaterThanOrEqual(MIN_SURFACE_DELTA_E);
  }

  for (const tone of expectTones) {
    const expected = toneColors[tone];
    expect(expected, `${context}: ${tone} 톤의 배경식을 계산하지 못했다`).toBeTruthy();
    expect(
      surfaces.some((surface) => sameColor(surface.stack[0], expected)),
      `${context}: ${tone} 톤(${expected}) 카드가 보이지 않는다 — ` +
        "이 지점이 더는 그 카드를 렌더하지 않는다면 호출부를 옮길 것",
    ).toBe(true);
  }

  return { surfaces, toneColors };
}
