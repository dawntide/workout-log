import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import {
  createEarlyThemeBootstrapScript,
  resolveColorTheme,
} from "./workout-preferences";

test("mode and light/dark color selections resolve independently", () => {
  const selections = {
    theme: "SYSTEM" as const,
    lightColorTheme: "GITHUB_LIGHT" as const,
    darkColorTheme: "TOKYO_NIGHT" as const,
  };

  assert.deepEqual(resolveColorTheme(selections, false), {
    tone: "light",
    colorTheme: "GITHUB_LIGHT",
  });
  assert.deepEqual(resolveColorTheme(selections, true), {
    tone: "dark",
    colorTheme: "TOKYO_NIGHT",
  });
  assert.deepEqual(
    resolveColorTheme({ ...selections, theme: "LIGHT" }, true),
    { tone: "light", colorTheme: "GITHUB_LIGHT" },
  );
  assert.deepEqual(
    resolveColorTheme({ ...selections, theme: "DARK" }, false),
    { tone: "dark", colorTheme: "TOKYO_NIGHT" },
  );
});

test("early bootstrap applies cached selections before body exists", () => {
  const attributes = new Map<string, string>();
  const style: Record<string, string> = {};
  const cache = new Map([
    ["workout-log.setting.v1.prefs.theme.mode", '{"value":"DARK"}'],
    [
      "workout-log.setting.v1.prefs.theme.light",
      '{"value":"GITHUB_LIGHT"}',
    ],
    [
      "workout-log.setting.v1.prefs.theme.dark",
      '{"value":"TOKYO_NIGHT"}',
    ],
  ]);

  runInNewContext(createEarlyThemeBootstrapScript(), {
    window: {
      localStorage: { getItem: (key: string) => cache.get(key) ?? null },
      matchMedia: () => ({ matches: false }),
    },
    document: {
      documentElement: {
        setAttribute: (key: string, value: string) => {
          attributes.set(key, value);
        },
        removeAttribute: (key: string) => {
          attributes.delete(key);
        },
        style,
      },
      body: null,
    },
  });

  assert.equal(attributes.get("data-theme-preference"), "dark");
  assert.equal(attributes.get("data-light-color-theme"), "GITHUB_LIGHT");
  assert.equal(attributes.get("data-dark-color-theme"), "TOKYO_NIGHT");
  assert.equal(attributes.get("data-theme-tone"), "dark");
  assert.equal(attributes.get("data-color-theme"), "tokyo-night");
  assert.equal(style.colorScheme, "dark");
  assert.equal(style.backgroundColor, "#16161e");
});
