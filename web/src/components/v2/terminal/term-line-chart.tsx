"use client";

// ironlog TermLineChart — 미세 1RM 라인 차트(inline SVG). braille 글리프는 모바일
// tofu/오정렬 리스크(R3)라 §5 그라운딩대로 fine 라인은 SVG로 그린다(데이터뷰, UI
// 아이콘 아님 → R1 무관). 색 --term-*만, 폰트=v2-font-num(mono, 인라인 fontFamily 없음).
// green 추세선 + gold ★ peak + dashed amber goal + dim min/max 라벨.

const VIEW_W = 300;
const VIEW_H = 100;
const PAD_X = 6;
const PAD_TOP = 12;
const PAD_BOTTOM = 10;

export function TermLineChart({
  values,
  goal,
  tone = "success",
}: {
  values: number[];
  goal?: number | null;
  tone?: "success" | "info";
}) {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length === 0) return null;

  const hasGoal = typeof goal === "number" && Number.isFinite(goal);
  const lo = Math.min(...pts, hasGoal ? (goal as number) : Infinity);
  const hi = Math.max(...pts, hasGoal ? (goal as number) : -Infinity);
  const range = hi - lo || 1;

  const plotW = VIEW_W - PAD_X * 2;
  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const xOf = (i: number) =>
    PAD_X + (pts.length === 1 ? plotW / 2 : (i / (pts.length - 1)) * plotW);
  const yOf = (v: number) => PAD_TOP + (1 - (v - lo) / range) * plotH;

  const line = pts.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`);
  const peakIdx = pts.lastIndexOf(Math.max(...pts));
  const lineColor =
    tone === "success" ? "var(--term-green)" : "var(--term-cyan)";

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width="100%"
      className="v2-font-num"
      role="img"
      style={{ display: "block", height: "auto" }}
    >
      {/* goal: dashed amber 가로선 */}
      {hasGoal ? (
        <line
          x1={PAD_X}
          x2={VIEW_W - PAD_X}
          y1={yOf(goal as number)}
          y2={yOf(goal as number)}
          stroke="var(--term-amber)"
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.7}
        />
      ) : null}

      {/* 추세선 */}
      {pts.length >= 2 ? (
        <polyline
          points={line.join(" ")}
          fill="none"
          stroke={lineColor}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}

      {/* 각 데이터 포인트 dot */}
      {pts.map((v, i) => (
        <circle
          key={i}
          cx={xOf(i)}
          cy={yOf(v)}
          r={i === peakIdx ? 2.6 : 1.6}
          fill={i === peakIdx ? "var(--term-gold)" : lineColor}
        />
      ))}

      {/* peak ★ 마커 */}
      <text
        x={xOf(peakIdx)}
        y={yOf(pts[peakIdx]!) - 4}
        fill="var(--term-gold)"
        textAnchor="middle"
        style={{ fontSize: "var(--v2-t-12)" }}
      >
        ★
      </text>

      {/* min/max 라벨 (dim) */}
      <text
        x={PAD_X}
        y={PAD_TOP - 3}
        fill="var(--term-dim)"
        style={{ fontSize: "var(--v2-t-12)" }}
      >
        {Math.round(hi)}
      </text>
      <text
        x={PAD_X}
        y={VIEW_H - 2}
        fill="var(--term-dim)"
        style={{ fontSize: "var(--v2-t-12)" }}
      >
        {Math.round(lo)}
      </text>
    </svg>
  );
}
