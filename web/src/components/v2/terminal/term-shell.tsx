"use client";

import type { CSSProperties, ReactNode } from "react";
import type {
  TermKeyHintItem,
  TermModeTone,
} from "./term-keyhint-context";

// ironlog terminal 셸 chrome (P0-d 골격) — redesign-target.md §6 TermShell.
// data-theme="terminal" 컨텍스트에서만 사용(--term-* 토큰 의존).
// 디자인 규칙: CSS border 금지(box-drawing 문자/배경톤/boxShadow inset로 계층),
// 치수는 var(--v2-*) 토큰만 → design-lint 위반 0.

export type TermTab = { key: string; label: string; href?: string };

const TRAFFIC: ReadonlyArray<string> = ["#ff5f56", "#ffbd2e", "#27c93f"];

// mode-accent (lualine 트릭): status 좌측 pill 색이 상태로 recolor (§6).
const MODE_BG: Record<TermModeTone, string> = {
  normal: "var(--term-dim)",
  logging: "var(--term-amber)",
  rest: "var(--term-cyan)",
  saving: "var(--term-amber)",
  pr: "var(--term-gold)",
  fail: "var(--term-red)",
};

export function TermShell({
  appName = "ironlog",
  path = "~/workout/log",
  clock,
  tabs = [],
  activeTab,
  mode = "-- NORMAL --",
  modeTone = "normal",
  statusRight,
  keyHints = [],
  children,
}: {
  appName?: string;
  path?: string;
  clock?: string;
  tabs?: TermTab[];
  activeTab?: string;
  mode?: string;
  modeTone?: TermModeTone;
  statusRight?: string;
  keyHints?: TermKeyHintItem[];
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--term-bg)",
        color: "var(--term-fg)",
        minHeight: "100dvh",
        // PWA standalone: 하단 홈 인디케이터(safe-area) 여백 — paper(layout.css)와 정합.
        // border-box(base.css)라 100dvh 안에서 처리되어 하단 chrome이 인디케이터에 안 붙음.
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        display: "flex",
        flexDirection: "column",
        fontSize: "var(--v2-t-small)",
        lineHeight: 1.5,
      }}
    >
      {/* TitleBar */}
      <div style={chrome("inset 0 -1px 0 var(--term-line)")}>
        <span style={{ display: "flex", gap: "var(--v2-s-1)" }} aria-hidden>
          {TRAFFIC.map((c) => (
            <span
              key={c}
              style={{
                width: "var(--v2-s-2)",
                height: "var(--v2-s-2)",
                borderRadius: "var(--v2-r-pill)",
                background: c,
                display: "inline-block",
              }}
            />
          ))}
        </span>
        <span style={{ color: "var(--term-amber)", marginLeft: "var(--v2-s-1)" }}>{appName}</span>
        <span style={{ color: "var(--term-dim)" }}>{path}</span>
        {clock ? (
          <span style={{ marginLeft: "auto", color: "var(--term-dim)" }}>{clock}</span>
        ) : null}
      </div>

      {/* TabStrip (tmux window-list) */}
      {tabs.length > 0 ? (
        <div
          style={{
            display: "flex",
            gap: "var(--v2-s-1)",
            padding: "var(--v2-s-1) var(--v2-s-2) 0",
            background: "var(--term-panel)",
            overflowX: "auto",
          }}
        >
          {tabs.map((t, i) => {
            const active = t.key === activeTab;
            const tabStyle: CSSProperties = {
              padding: "var(--v2-s-1) var(--v2-s-2)",
              whiteSpace: "nowrap",
              textDecoration: "none",
              color: active ? "var(--term-amber)" : "var(--term-dim)",
              background: active ? "var(--term-bg)" : "transparent",
            };
            const inner = (
              <>
                {i + 1}:{t.label}
                {active ? "*" : ""}
              </>
            );
            return t.href ? (
              <a key={t.key} href={t.href} style={tabStyle}>
                {inner}
              </a>
            ) : (
              <span key={t.key} style={tabStyle}>
                {inner}
              </span>
            );
          })}
        </div>
      ) : null}

      {/* ViewPane (swappable) — .term-viewpane: PTR이 이 내부 스크롤 컨테이너를 추적/transform */}
      <div className="term-viewpane" style={{ flex: 1, padding: "var(--v2-s-3)", overflow: "auto" }}>
        {children}
      </div>

      {/* StatusBar (mode · path · rolling stat) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--v2-s-2)",
          padding: "var(--v2-s-1) var(--v2-s-3)",
          background: "var(--term-chrome)",
          boxShadow: "inset 0 1px 0 var(--term-line)",
          fontSize: "var(--v2-t-12)",
        }}
      >
        <span
          style={{
            background: MODE_BG[modeTone],
            color: "var(--term-bg)",
            padding: "0 var(--v2-s-2)",
            whiteSpace: "nowrap",
            transition: "background 120ms ease",
          }}
        >
          {mode}
        </span>
        {statusRight ? (
          <span style={{ color: "var(--term-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {statusRight}
          </span>
        ) : null}
      </div>

      {/* KeyHint — 각 힌트가 44px 탭 버튼 (R6 터치 대응) */}
      {keyHints.length > 0 ? (
        <div
          style={{
            display: "flex",
            gap: "var(--v2-s-1)",
            padding: "0 var(--v2-s-1)",
            background: "var(--term-chrome)",
            flexWrap: "wrap",
          }}
        >
          {keyHints.map((h) => (
            <button
              key={h.key}
              type="button"
              onClick={h.onPress}
              style={{
                minHeight: "var(--v2-touch)",
                background: "transparent",
                border: "none",
                color: "var(--term-dim)",
                padding: "0 var(--v2-s-2)",
                fontSize: "var(--v2-t-12)",
                cursor: "pointer",
              }}
            >
              <span style={{ color: "var(--term-cyan)" }}>[{h.key}]</span> {h.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function chrome(hairline: string): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "var(--v2-s-2)",
    padding: "var(--v2-s-2) var(--v2-s-3)",
    background: "var(--term-chrome)",
    boxShadow: hairline,
  };
}
