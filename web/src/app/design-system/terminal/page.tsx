"use client";

import { useEffect } from "react";
import { TermShell } from "@/components/v2/terminal";

// R3 글리프 테스트 + TermShell 미리보기 (P0-d).
// 실기기(iOS Safari / Android WebView)에서 이 페이지를 열어 box-drawing·block·
// braille이 □(tofu)로 깨지지 않는지 확인 → 깨지면 Nerd Font 번들 필요(후속).
// 이 페이지는 자체적으로 data-theme="terminal"을 강제(설정과 무관하게 항상 터미널).

const GLYPH_GROUPS: ReadonlyArray<{ label: string; glyphs: string }> = [
  { label: "box-drawing", glyphs: "┌ ┐ └ ┘ ─ │ ├ ┤ ┬ ┴ ┼ ╭ ╮ ╰ ╯ ═ ║" },
  { label: "block", glyphs: "▁ ▂ ▃ ▄ ▅ ▆ ▇ █ ▏ ▎ ▍ ▌ ▋ ▊ ▉" },
  { label: "shade", glyphs: "░ ▒ ▓" },
  { label: "braille", glyphs: "⠁ ⠃ ⠇ ⡇ ⣇ ⣧ ⣷ ⣿ ⠿ ⢸ ⣉ ⠶" },
  { label: "status", glyphs: "✓ ✗ ▶ ★ ● ◆ · ▮ ▯ ⏎ ⌫" },
];

const SAMPLE_PANEL = `┌─ squat ───────────── 100kg ─┐
│ set  load      reps  status │
│ 01   100kg ×   5     ✓ done │
│ 02   100kg ×   5     ✓ done │
│ 03   100kg ×   5     ▮ log  │
└─────────────────────────────┘`;

export default function TerminalLabPage() {
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.getAttribute("data-theme");
    el.setAttribute("data-theme", "terminal");
    return () => {
      if (prev) el.setAttribute("data-theme", prev);
      else el.removeAttribute("data-theme");
    };
  }, []);

  return (
    <TermShell
      appName="ironlog"
      path="~/design-system/terminal"
      clock="R3"
      tabs={[
        { key: "glyphs", label: "glyphs" },
        { key: "shell", label: "shell" },
      ]}
      activeTab="glyphs"
      mode="-- GLYPH TEST --"
      statusRight="실기기에서 □(tofu) 확인"
      keyHints={[
        { key: "⏎", label: "log" },
        { key: "r", label: "rest" },
        { key: "?", label: "help" },
      ]}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-4)" }}>
        {/* 글리프 커버리지 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-3)" }}>
          {GLYPH_GROUPS.map((g) => (
            <div key={g.label}>
              <div style={{ color: "var(--term-dim)", fontSize: "var(--v2-t-12)" }}>{g.label}</div>
              <div style={{ color: "var(--term-fg)", fontSize: "var(--v2-t-h3)", letterSpacing: "0.06em" }}>
                {g.glyphs}
              </div>
            </div>
          ))}
        </div>

        {/* box-drawn 패널 — 정렬 + 한글 혼용 그리드 확인 */}
        <pre style={{ margin: 0, color: "var(--term-fg)", fontSize: "var(--v2-t-small)", whiteSpace: "pre", overflowX: "auto" }}>
          {SAMPLE_PANEL}
        </pre>

        {/* 스파크라인 · 진행바 · 한글+숫자 라인 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)", fontSize: "var(--v2-t-small)" }}>
          <div>
            <span style={{ color: "var(--term-dim)" }}>1rm&nbsp;&nbsp;</span>
            <span style={{ color: "var(--term-green)" }}>▁▂▃▄▅▆▇█</span>{" "}
            <span style={{ color: "var(--term-cyan)" }}>117.5kg</span>{" "}
            <span style={{ color: "var(--term-gold)" }}>★ PR</span>
          </div>
          <div>
            <span style={{ color: "var(--term-dim)" }}>rest&nbsp;</span>
            <span style={{ color: "var(--term-amber)" }}>[██████████░░░░░░]</span>{" "}
            <span style={{ color: "var(--term-fg)" }}>01:12</span>
          </div>
          <div>
            <span style={{ color: "var(--term-fg)" }}>벤치프레스</span>{" "}
            <span style={{ color: "var(--term-cyan)" }}>100kg × 5</span>{" "}
            <span style={{ color: "var(--term-green)" }}>✓ done</span>
          </div>
        </div>
      </div>
    </TermShell>
  );
}
