import { expect, test, type Page } from "@playwright/test";
import {
  DARK_COLOR_THEMES,
  LIGHT_COLOR_THEMES,
} from "@workout/core/settings/workout-preferences";

import {
  MIN_SURFACE_DELTA_E,
  SURFACE_LADDER_PAIRS,
  SURFACE_LADDER_TOKENS,
  deltaE,
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

async function installThemePreferences(
  page: Page,
  preferences: { mode: "SYSTEM" | "LIGHT" | "DARK"; light: string; dark: string },
) {
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
        await page.waitForLoadState("load");

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
          const distance = deltaE(resolved[upper], resolved[lower]);
          expect(distance, `${theme}: ${upper}(${resolved[upper]}) 또는 ${lower}(${resolved[lower]})를 파싱하지 못했다`).not.toBeNull();
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
