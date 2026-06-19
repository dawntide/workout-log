"use client";

// ironlog TermLog — 라이브 세션 "combat log"(로그라이크). 최신 라인 하단, 2~3줄,
// `‹time› ‹segments…›` 색분절. ephemeral(세션 한정, 비영속), 박스 아님이라 한글 허용.
// data-theme="terminal" 전용(--term-* 의존). redesign-target.md §6.

export type TermLogTone =
  | "dim"
  | "fg"
  | "info"
  | "success"
  | "danger"
  | "accent"
  | "gold";

const TONE_COLOR: Record<TermLogTone, string> = {
  dim: "var(--term-dim)",
  fg: "var(--term-fg)",
  info: "var(--term-cyan)",
  success: "var(--term-green)",
  danger: "var(--term-red)",
  accent: "var(--term-amber)",
  gold: "var(--term-gold)",
};

export type TermLogSegment = { text: string; tone?: TermLogTone };
export type TermLogEntry = { id: string; time?: string; segments: TermLogSegment[] };

export function TermLog({
  entries,
  max = 3,
}: {
  entries: TermLogEntry[];
  max?: number;
}) {
  if (entries.length === 0) return null;
  const shown = entries.slice(-max);
  return (
    <div
      className="v2-font-num"
      aria-live="polite"
      style={{
        display: "flex",
        flexDirection: "column",
        fontSize: "var(--v2-t-12)",
        lineHeight: 1.5,
      }}
    >
      {shown.map((e) => (
        <div
          key={e.id}
          style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {e.time ? (
            <span style={{ color: "var(--term-dim)" }}>{`‹${e.time}› `}</span>
          ) : null}
          {e.segments.map((s, i) => (
            <span key={i} style={{ color: TONE_COLOR[s.tone ?? "fg"] }}>
              {i > 0 ? " " : ""}
              {s.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
