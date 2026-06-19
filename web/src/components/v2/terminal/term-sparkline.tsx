"use client";

// ironlog TermSparkline — block-eighths(▁▂▃▄▅▆▇█) 단일행 인라인 스파크라인.
// btop식 트렌드. block 글리프는 모바일 신뢰도 높음(braille은 R3 tofu 리스크라 미사용 —
// 미세 1RM 라인 차트는 별도 SVG, redesign-target §5). data-theme="terminal" 전용.
// markPeak=true면 최고값 글리프를 gold(★ PR 신호)로. 값 readout은 호출부 몫(aria 포함).

const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

export type TermSparklineTone = "info" | "success" | "accent";

const TONE_COLOR: Record<TermSparklineTone, string> = {
  info: "var(--term-cyan)",
  success: "var(--term-green)",
  accent: "var(--term-amber)",
};

// data가 width보다 길면 균등 다운샘플(첫·끝 포함해 트렌드 형태 보존).
function sample(data: number[], width: number): number[] {
  if (data.length <= width) return data;
  const out: number[] = [];
  for (let i = 0; i < width; i++) {
    const idx = Math.round((i * (data.length - 1)) / (width - 1));
    out.push(data[idx]!);
  }
  return out;
}

export function TermSparkline({
  data,
  width = 16,
  tone = "info",
  markPeak = false,
}: {
  data: number[];
  width?: number;
  tone?: TermSparklineTone;
  markPeak?: boolean;
}) {
  const points = data.filter((v) => Number.isFinite(v));
  if (points.length === 0) return null;

  const sampled = sample(points, Math.max(1, width));
  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const range = max - min;
  const peakIdx = markPeak ? sampled.lastIndexOf(max) : -1;

  return (
    <span
      className="v2-font-num"
      aria-hidden
      style={{
        whiteSpace: "nowrap",
        letterSpacing: 0,
        color: TONE_COLOR[tone],
      }}
    >
      {sampled.map((v, i) => {
        // range 0(전부 동일)이면 중간 레벨로 평탄하게.
        const level = range === 0 ? 3 : Math.round(((v - min) / range) * 7);
        const glyph = BLOCKS[Math.max(0, Math.min(7, level))];
        return (
          <span
            key={i}
            style={i === peakIdx ? { color: "var(--term-gold)" } : undefined}
          >
            {glyph}
          </span>
        );
      })}
    </span>
  );
}
