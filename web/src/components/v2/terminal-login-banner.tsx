"use client";

import { useThemeSkin } from "@/components/use-theme-skin";

// 터미널 로그인 "부팅 연출"(ironlog P5). 스킨=terminal일 때만 인증 폼 위에 모노 부팅
// 배너를 얹는다. /login은 셸(TermShell) 밖이지만 data-theme=terminal cascade로 폼은
// 이미 다크/모노 리스킨됨 → 이 배너가 터미널 부팅 맥락을 더한다. paper에선 null(무영향).
// 정적(애니메이션 없음) — reduced-motion 안전, 공유 V2AuthForm 무수정.
const TRAFFIC: ReadonlyArray<string> = ["#ff5f56", "#ffbd2e", "#27c93f"];

export function TerminalLoginBanner() {
  const skin = useThemeSkin();
  if (skin !== "terminal") return null;
  return (
    <div
      className="v2-font-num"
      aria-hidden
      style={{
        maxWidth: "var(--v2-s-9)",
        margin: "0 auto var(--v2-s-4)",
        padding: "var(--v2-s-3)",
        background: "var(--term-panel)",
        boxShadow: "inset 0 0 0 1px var(--term-line-box)",
        borderRadius: "var(--v2-r-2)",
        fontSize: "var(--v2-t-12)",
        lineHeight: 1.6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--v2-s-2)" }}>
        <span style={{ display: "flex", gap: "var(--v2-s-1)" }}>
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
        <span style={{ color: "var(--term-amber)" }}>ironlog v1.0</span>
      </div>
      <div style={{ color: "var(--term-dim)", marginTop: "var(--v2-s-2)" }}>
        <span style={{ color: "var(--term-green)" }}>$</span> boot workout-log{" "}
        <span style={{ color: "var(--term-green)" }}>[OK]</span>
      </div>
      <div style={{ color: "var(--term-dim)" }}>
        <span style={{ color: "var(--term-cyan)" }}>auth</span> required ▸
      </div>
    </div>
  );
}
