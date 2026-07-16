#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const themeCssPath = fileURLToPath(
  new URL("../src/styles/color-themes.css", import.meta.url),
);
const themeCss = readFileSync(themeCssPath, "utf8");

const expectedThemes = [
  "paper",
  "github-light",
  "solarized-light",
  "catppuccin-latte",
  "tokyo-night-day",
  "obsidian",
  "github-dark",
  "solarized-dark",
  "catppuccin-mocha",
  "tokyo-night",
];

const requiredTokens = [
  "--v2-bg",
  "--v2-paper",
  "--v2-paper-2",
  "--v2-paper-3",
  "--v2-paper-4",
  "--v2-ink",
  "--v2-ink-2",
  "--v2-ink-3",
  "--v2-ink-4",
  "--v2-ink-on-accent",
  "--v2-accent",
  "--v2-accent-2",
  "--v2-accent-weak",
  "--v2-accent-ink",
  "--v2-c-weight",
  "--v2-c-reps",
  "--v2-c-volume",
  "--v2-c-onerm",
  "--v2-c-progress",
  "--v2-c-pr",
  "--v2-c-danger",
  "--v2-c-success",
  "--v2-c-info",
  "--v2-c-warning",
];

const paperTextTokens = [
  "--v2-ink",
  "--v2-ink-2",
  "--v2-ink-3",
  "--v2-accent-ink",
  "--v2-c-weight",
  "--v2-c-reps",
  "--v2-c-volume",
  "--v2-c-onerm",
  "--v2-c-progress",
  "--v2-c-pr",
  "--v2-c-danger",
  "--v2-c-success",
  "--v2-c-info",
  "--v2-c-warning",
];

function parseThemes(css) {
  const themes = new Map();
  const blockPattern = /:root\[data-color-theme="([^"]+)"\]\s*\{([\s\S]*?)\}/g;
  for (const match of css.matchAll(blockPattern)) {
    const tokens = {};
    const tokenPattern = /(--v2-[\w-]+)\s*:\s*([^;]+);/g;
    for (const tokenMatch of match[2].matchAll(tokenPattern)) {
      tokens[tokenMatch[1]] = tokenMatch[2].trim();
    }
    themes.set(match[1], tokens);
  }
  return themes;
}

function hexToRgb(hex) {
  if (!/^#[\da-f]{6}$/i.test(hex)) {
    throw new Error(`Expected a 6-digit hex color, received ${hex}`);
  }
  const parsed = Number.parseInt(hex.slice(1), 16);
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

function relativeChannel(value) {
  const normalized = value / 255;
  if (normalized <= 0.03928) return normalized / 12.92;
  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * relativeChannel(r) +
    0.7152 * relativeChannel(g) +
    0.0722 * relativeChannel(b)
  );
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

const themes = parseThemes(themeCss);
const failures = [];

for (const themeName of expectedThemes) {
  const tokens = themes.get(themeName);
  if (!tokens) {
    failures.push(`${themeName}: theme selector is missing`);
    continue;
  }

  for (const token of requiredTokens) {
    if (!tokens[token]) failures.push(`${themeName}: ${token} is missing`);
  }
  if (requiredTokens.some((token) => !tokens[token])) continue;

  for (const token of paperTextTokens) {
    const ratio = contrastRatio(tokens[token], tokens["--v2-paper"]);
    if (ratio < 4.5) {
      failures.push(
        `${themeName}: ${token} on --v2-paper is ${ratio.toFixed(2)}:1`,
      );
    }
  }

  const onAccentRatio = contrastRatio(
    tokens["--v2-ink-on-accent"],
    tokens["--v2-accent"],
  );
  if (onAccentRatio < 4.5) {
    failures.push(
      `${themeName}: --v2-ink-on-accent on --v2-accent is ${onAccentRatio.toFixed(2)}:1`,
    );
  }
}

for (const unexpectedTheme of themes.keys()) {
  if (!expectedThemes.includes(unexpectedTheme)) {
    failures.push(`${unexpectedTheme}: selector is not registered in the checker`);
  }
}

if (failures.length > 0) {
  console.error("Theme contrast checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `All ${expectedThemes.length} color themes include the required tokens and pass WCAG AA text contrast.`,
);
