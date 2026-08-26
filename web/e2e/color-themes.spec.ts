import { expect, test, type Page } from "@playwright/test";
import {
  DARK_COLOR_THEMES,
  LIGHT_COLOR_THEMES,
} from "@workout/core/settings/workout-preferences";

import {
  MIN_SEMANTIC_TINT_DELTA_E,
  MIN_SURFACE_DELTA_E,
  SEMANTIC_TONE_BG,
  SURFACE_LADDER_PAIRS,
  SURFACE_LADDER_TOKENS,
  deltaE,
  flattenStack,
} from "./surface-contrast";

type ThemeCase = {
  preference: string;
  dataValue: string;
  background: string;
};

const LIGHT_THEMES: ThemeCase[] = [
  { preference: "PAPER", dataValue: "paper", background: "#f6f1e8" },
  {
    preference: "GITHUB_LIGHT",
    dataValue: "github-light",
    background: "#f6f8fa",
  },
  {
    preference: "SOLARIZED_LIGHT",
    dataValue: "solarized-light",
    background: "#eee8d5",
  },
  {
    preference: "CATPPUCCIN_LATTE",
    dataValue: "catppuccin-latte",
    background: "#e6e9ef",
  },
  {
    preference: "TOKYO_NIGHT_DAY",
    dataValue: "tokyo-night-day",
    background: "#d0d5e3",
  },
  {
    preference: "GRUVBOX_LIGHT",
    dataValue: "gruvbox-light",
    background: "#ebdbb2",
  },
  {
    preference: "KANAGAWA_LOTUS",
    dataValue: "kanagawa-lotus",
    background: "#e5ddb0",
  },
];

const DARK_THEMES: ThemeCase[] = [
  { preference: "OBSIDIAN", dataValue: "obsidian", background: "#0e0d12" },
  {
    preference: "GITHUB_DARK",
    dataValue: "github-dark",
    background: "#0d1117",
  },
  {
    preference: "SOLARIZED_DARK",
    dataValue: "solarized-dark",
    background: "#002b36",
  },
  {
    preference: "CATPPUCCIN_MOCHA",
    dataValue: "catppuccin-mocha",
    background: "#11111b",
  },
  {
    preference: "TOKYO_NIGHT",
    dataValue: "tokyo-night",
    background: "#16161e",
  },
  {
    preference: "GRUVBOX_DARK",
    dataValue: "gruvbox-dark",
    background: "#1d2021",
  },
  {
    preference: "KANAGAWA_WAVE",
    dataValue: "kanagawa-wave",
    background: "#16161d",
  },
];

/**
 * 테마 설정을 로컬 캐시와 **서버 응답 양쪽에** 심는다.
 *
 * localStorage만 심으면 안 된다 — `ThemePreferenceSync`가 마운트 후 `/api/settings`를
 * 받아 **로컬 값을 덮어쓴다**(서버가 설정의 소스라는 제품 결정). 그래서 시드한 테마가
 * 잠깐 적용됐다가 계정에 저장된 기본값(PAPER/OBSIDIAN)으로 되돌아가고, 그 타이밍에
 * 걸린 단언이 간헐 실패한다. 실측 11회 중 1회 실패했고 깨지는 테스트가 매번 달랐다.
 *
 * 응답을 가로채 서버와 로컬을 일치시키면 경쟁 자체가 사라진다.
 */
async function installThemePreferences(
  page: Page,
  preferences: { mode: "SYSTEM" | "LIGHT" | "DARK"; light: string; dark: string },
) {
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        // 스냅샷은 `Record<key, SettingValue>` — **원시 값**이다. `{ value }`로
        // 감싸면 normalize가 못 읽고 기본값으로 떨어져 덮어쓰기가 그대로 재현된다.
        settings: {
          "prefs.theme.mode": preferences.mode,
          "prefs.theme.light": preferences.light,
          "prefs.theme.dark": preferences.dark,
        },
      }),
    });
  });
  await page.addInitScript((values) => {
    const prefix = "workout-log.setting.v1.";
    window.localStorage.setItem(
      `${prefix}prefs.theme.mode`,
      JSON.stringify({ value: values.mode }),
    );
    window.localStorage.setItem(
      `${prefix}prefs.theme.light`,
      JSON.stringify({ value: values.light }),
    );
    window.localStorage.setItem(
      `${prefix}prefs.theme.dark`,
      JSON.stringify({ value: values.dark }),
    );
  }, preferences);
}

async function expectAppliedTheme(
  page: Page,
  expected: { mode: string; tone: "light" | "dark"; theme: ThemeCase },
) {
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-theme-preference", expected.mode);
  await expect(root).toHaveAttribute("data-theme-tone", expected.tone);
  await expect(root).toHaveAttribute("data-color-theme", expected.theme.dataValue);
  await expect
    .poll(() =>
      root.evaluate((element) =>
        window.getComputedStyle(element).getPropertyValue("--v2-bg").trim(),
      ),
    )
    .toBe(expected.theme.background);
}

test.describe("named color themes", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const theme of LIGHT_THEMES) {
    test(`applies light theme ${theme.dataValue} before hydration`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await installThemePreferences(page, {
        mode: "LIGHT",
        light: theme.preference,
        dark: "OBSIDIAN",
      });

      const response = await page.goto("/login", { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      await expectAppliedTheme(page, { mode: "light", tone: "light", theme });
      await page.waitForTimeout(100);
      expect(pageErrors).toEqual([]);
    });
  }

  for (const theme of DARK_THEMES) {
    test(`applies dark theme ${theme.dataValue} before hydration`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await installThemePreferences(page, {
        mode: "DARK",
        light: "PAPER",
        dark: theme.preference,
      });

      const response = await page.goto("/login", { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      await expectAppliedTheme(page, { mode: "dark", tone: "dark", theme });
      await page.waitForTimeout(100);
      expect(pageErrors).toEqual([]);
    });
  }

  test("system mode follows runtime color-scheme changes", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.emulateMedia({ colorScheme: "light" });
    await installThemePreferences(page, {
      mode: "SYSTEM",
      light: "GITHUB_LIGHT",
      dark: "TOKYO_NIGHT",
    });

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expectAppliedTheme(page, {
      mode: "system",
      tone: "light",
      theme: LIGHT_THEMES[1],
    });

    await page.emulateMedia({ colorScheme: "dark" });
    await expectAppliedTheme(page, {
      mode: "system",
      tone: "dark",
      theme: DARK_THEMES[4],
    });
    await page.waitForTimeout(100);
    expect(pageErrors).toEqual([]);
  });
});

/**
 * 표면 사다리 — **전 테마**의 인접 표면 쌍이 서로 구분되는지.
 *
 * 위의 테스트들은 테마가 *적용되는지*만 본다(data 속성 + `--v2-bg` hex). 정작 #653에서
 * 무너진 건 그다음이다 — 원본 팔레트의 배경색을 `--v2-bg`와 `--v2-paper-2` 양쪽에
 * 매핑한 테마 3개가 ΔE=0이 되어, paper-2를 쓰는 100+ 요소(검색창·보조버튼·칩·아이콘
 * 버튼·스켈레톤)의 배경이 통째로 사라졌다. **그 회귀를 잡는 테스트가 없었다.**
 *
 * 화면별 감사(`design-harmonization.spec.ts`)는 이 구멍을 못 메운다 — 그쪽은 기본
 * 테마의 light/dark만 돈다. 여기서는 화면을 돌지 않고 **토큰만** 재므로 14테마 ×
 * 인접쌍 5개를 20초대에 끝낸다.
 *
 * 테마 목록은 하드코딩하지 않고 core의 단일 소스에서 가져온다 — 새 테마가 자동으로
 * 이 게이트에 들어온다.
 */
test.describe("surface ladder", () => {
  for (const [mode, themes] of [
    ["LIGHT", LIGHT_COLOR_THEMES],
    ["DARK", DARK_COLOR_THEMES],
  ] as const) {
    for (const theme of themes) {
      test(`${theme} keeps adjacent surfaces distinguishable`, async ({ page }) => {
        await installThemePreferences(page, { mode, light: theme, dark: theme });
        await page.emulateMedia({ colorScheme: mode === "DARK" ? "dark" : "light" });
        await page.goto("/settings", { waitUntil: "domcontentloaded" });

        // ⚠️ **측정 전에 테마가 실제로 걸렸는지 단언한다.** 서버에 저장된 설정이
        // 하이드레이션 뒤 localStorage 값을 덮어써서 기본 테마로 되돌아간다 — 그러면
        // 이 테스트가 14번 전부 같은 테마를 재면서 초록이 된다(실측: 측정을 1.5초
        // 늦추자 12/14가 paper·obsidian으로 뒤집혔는데도 전부 통과했다).
        // 그래서 load까지 기다리지 않고 하이드레이션 전에 잰다.
        await expect(page.locator("html")).toHaveAttribute(
          "data-color-theme",
          theme.toLowerCase().replaceAll("_", "-"),
        );

        // 토큰 문자열을 그대로 읽으면 color-mix()·중첩 var()가 안 풀린다.
        // 실제 요소에 칠해 브라우저가 계산한 값을 받는다.
        const resolved = await page.evaluate((tokens) => {
          const probe = document.createElement("div");
          probe.style.position = "fixed";
          probe.style.left = "-9999px";
          document.body.appendChild(probe);
          const out: Record<string, string> = {};
          for (const token of tokens) {
            probe.style.backgroundColor = "";
            probe.style.backgroundColor = `var(${token})`;
            out[token] = window.getComputedStyle(probe).backgroundColor;
          }
          probe.remove();
          return out;
        }, [...SURFACE_LADDER_TOKENS]);

        for (const [upper, lower] of SURFACE_LADDER_PAIRS) {
          // 다크 테마 7개는 `--v2-accent-weak`이 알파를 갖는다(0.14~0.17). 아래 색과
          // 합성하지 않고 비교하면 obsidian에서 ΔE 80이 나오는데 실제 값은 13.5다 —
          // 알파가 0.01로 줄어 표면이 사라져도 여전히 80을 찍는다.
          const top = flattenStack([resolved[upper], resolved[lower]]);
          const bottom = flattenStack([resolved[lower]]);
          const distance = top && bottom ? deltaE(top, bottom) : null;
          expect(distance, `${theme}: ${upper}(${resolved[upper]}) 또는 ${lower}(${resolved[lower]})를 평탄화하지 못했다`).not.toBeNull();
          if (distance === null) continue;
          expect(
            distance,
            `${theme}: ${upper}와 ${lower}가 구분되지 않는다 ` +
              `(ΔE ${distance.toFixed(2)} < ${MIN_SURFACE_DELTA_E}) — ` +
              `${resolved[upper]} vs ${resolved[lower]}\n` +
              "원본 팔레트 배경색을 두 토큰에 재사용했는지 확인할 것(#653). " +
              "중간 톤이 없으면 이웃 값 사이를 보간해 만든다.",
          ).toBeGreaterThanOrEqual(MIN_SURFACE_DELTA_E);
        }
      });
    }
  }
});

/**
 * 의미 톤(accent·danger·success)이 각 배경 위에서 구분되는지.
 *
 * **paper 배경만 기준이 다르다.** 나머지 배경에서는 "표면이 보이는가"만 물으면 되지만
 * (`MIN_SURFACE_DELTA_E`), paper 위에서는 **"평범한 카드와 구분되는가"**를 묻는 것이
 * 되고 그건 더 높은 기준을 요구한다(`MIN_SEMANTIC_TINT_DELTA_E`) — 이 톤들이 존재하는
 * 이유가 의미 전달이라, 겨우 보이는 정도로는 danger가 danger로 읽히지 않는다.
 * 두 값은 같은 측정에 다른 문턱을 건 것이지 다른 측정이 아니다.
 *
 * 화면별 감사가 못 메우는 구멍이다 — 51곳에서 쓰이지만 감사 대상 35화면 중 어디에도
 * 렌더되지 않는다(전부 상호작용·상태 뒤에 있다). 여기서 토큰으로 재면 화면을 안 돌고도
 * 전 테마가 덮인다.
 */
test.describe("semantic tone surfaces", () => {
  const BACKDROPS: Record<string, string> = {
    bg: "var(--v2-bg)",
    paper: "var(--v2-paper)",
    "paper-2": "var(--v2-paper-2)",
  };

  for (const [mode, themes] of [
    ["LIGHT", LIGHT_COLOR_THEMES],
    ["DARK", DARK_COLOR_THEMES],
  ] as const) {
    for (const theme of themes) {
      test(`${theme} keeps semantic tones readable`, async ({ page }) => {
        await installThemePreferences(page, { mode, light: theme, dark: theme });
        await page.emulateMedia({ colorScheme: mode === "DARK" ? "dark" : "light" });
        // load까지 기다리지 않는다 — 서버에 저장된 설정이 하이드레이션 뒤 테마를
        // 되돌려 놓는다(실측: 파일 전체 실행에서 마지막 테마가 그렇게 깨졌다).
        // 테마는 하이드레이션 전 인라인 스크립트가 이미 적용해 두므로 지금 재면 된다.
        await page.goto("/settings", { waitUntil: "domcontentloaded" });
        await expect(page.locator("html")).toHaveAttribute(
          "data-color-theme",
          theme.toLowerCase().replaceAll("_", "-"),
        );

        const resolved = await page.evaluate((exprs: Record<string, string>) => {
          const probe = document.createElement("div");
          probe.style.position = "fixed";
          probe.style.left = "-9999px";
          document.body.appendChild(probe);
          const out: Record<string, string> = {};
          for (const [key, expr] of Object.entries(exprs)) {
            probe.style.backgroundColor = "";
            probe.style.backgroundColor = expr;
            out[key] = window.getComputedStyle(probe).backgroundColor;
          }
          probe.remove();
          return out;
        }, { ...SEMANTIC_TONE_BG, ...BACKDROPS });

        for (const tone of Object.keys(SEMANTIC_TONE_BG)) {
          for (const backdropName of Object.keys(BACKDROPS)) {
            const backdrop = resolved[backdropName];
            const top = flattenStack([resolved[tone], backdrop]);
            const bottom = flattenStack([backdrop]);
            const distance = top && bottom ? deltaE(top, bottom) : null;
            expect(
              distance,
              `${theme}/${tone}: ${resolved[tone]} 를 ${backdropName} 위에서 평탄화하지 못했다`,
            ).not.toBeNull();
            if (distance === null) continue;

            const isTint = backdropName === "paper";
            const floor = isTint ? MIN_SEMANTIC_TINT_DELTA_E : MIN_SURFACE_DELTA_E;
            expect(
              distance,
              isTint
                ? `${theme}: ${tone} 톤이 평범한 paper 카드와 구분되지 않는다 ` +
                    `(ΔE ${distance.toFixed(2)} < ${floor}) — 표면은 보여도 의미가 전달되지 않는다.`
                : `${theme}: ${tone} 카드가 ${backdropName} 배경과 구분되지 않는다 ` +
                    `(ΔE ${distance.toFixed(2)} < ${floor})`,
            ).toBeGreaterThanOrEqual(floor);
          }
        }
      });
    }
  }
});
