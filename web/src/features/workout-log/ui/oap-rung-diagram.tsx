"use client";

import { useLocale } from "@/components/locale-provider";
import { V2Card } from "@/components/v2/primitives";

// 보조손 위치 정의(§7.5.2). 판정 비교성의 근거라 스펙 문구를 그대로 옮긴다 —
// 스펙을 고치면 여기도 함께 고칠 것.
const RUNG_DEFINITION: Record<number, { ko: string; en: string }> = {
  1: { ko: "손목 주름 바로 아래를 감쌈", en: "Wrap just below the wrist crease" },
  2: { ko: "전완 중간점(손목~팔꿈치 중점)", en: "Mid-forearm (wrist–elbow midpoint)" },
  3: { ko: "팔꿈치 접힘부 바로 아래", en: "Just below the elbow crease" },
  4: { ko: "상박 중간점", en: "Mid upper arm" },
  5: { ko: "삼각근 상부/쇄골 부근 — 안정만", en: "Top of delt / collarbone — stability only" },
  6: { ko: "보조손을 몸에서 뗌", en: "Assisting hand off the body" },
};

// 당기는 팔 위 각 단의 y 좌표(viewBox 기준). 손이 바, 어깨가 아래.
const RUNG_Y: Record<number, number> = { 1: 20, 2: 31, 3: 42, 4: 54, 5: 66 };
const ARM_X = 36;
const SHOULDER_Y = 66;
const ASSIST_SHOULDER_X = 68;

type Props = {
  rung: number;
  rungName: string;
  rungNameKo: string;
};

/**
 * OAP 사다리의 보조손 위치 그림. 데이터 시각화 성격의 SVG라 아이콘 규칙의 예외다
 * (design-guide §5 예외). 색은 토큰만 쓴다.
 */
export function OapRungDiagram({ rung, rungName, rungNameKo }: Props) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const markerY = RUNG_Y[rung];
  const definition = RUNG_DEFINITION[rung];
  const title = ko ? `${rung}단 ${rungNameKo}` : `Rung ${rung} · ${rungName}`;
  const caption = definition ? (ko ? definition.ko : definition.en) : "";

  return (
    <V2Card
      tone="inset"
      padding="var(--v2-s-2) var(--v2-s-3)"
      radius="var(--v2-r-2)"
      style={{ display: "flex", alignItems: "center", gap: "var(--v2-s-3)" }}
    >
      <svg
        viewBox="0 0 88 104"
        width={72}
        height={85}
        role="img"
        aria-label={`${ko ? "보조손 위치" : "Assist hand position"}: ${title}`}
        style={{ flexShrink: 0 }}
      >
        {/* 색 역할: 구조(바·몸통)는 낮은 대비 잉크, 당기는 팔은 한 단계 진하게,
            보조손만 accent. 모든 색이 테마 토큰이라 color-themes.css 전 테마를 따른다. */}
        {/* 바 */}
        <line x1={8} y1={8} x2={80} y2={8} stroke="var(--v2-ink-4)" strokeWidth={3} strokeLinecap="round" />
        {/* 어깨선·몸통. 머리는 그리지 않는다 — 보조팔 선이 머리를 가로질러 단 위치가 흐려진다 */}
        <line x1={ARM_X} y1={SHOULDER_Y} x2={ASSIST_SHOULDER_X} y2={SHOULDER_Y} stroke="var(--v2-ink-3)" strokeWidth={3} strokeLinecap="round" />
        <line x1={52} y1={SHOULDER_Y} x2={52} y2={98} stroke="var(--v2-ink-3)" strokeWidth={3} strokeLinecap="round" />
        {/* 당기는 팔: 바를 잡은 손 → 어깨. 프리(6단)면 이 팔이 주인공이라 accent */}
        <line
          x1={ARM_X}
          y1={10}
          x2={ARM_X}
          y2={SHOULDER_Y}
          stroke={markerY === undefined ? "var(--v2-accent)" : "var(--v2-ink-2)"}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <circle cx={ARM_X} cy={9} r={3.5} fill={markerY === undefined ? "var(--v2-accent)" : "var(--v2-ink-2)"} />
        {/* 단 눈금 1–5. 현재 단은 accent-weak 바탕 + accent-ink 글자 */}
        {Object.entries(RUNG_Y).map(([key, y]) => {
          const current = Number(key) === rung;
          return (
            <g key={key}>
              {current && <circle cx={22} cy={y} r={7.5} fill="var(--v2-accent-weak)" />}
              <text
                x={22}
                y={y + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={current ? 700 : 400}
                fill={current ? "var(--v2-accent-ink)" : "var(--v2-ink-3)"}
              >
                {key}
              </text>
            </g>
          );
        })}
        {/* 보조팔: 단 위치를 잡거나(1–5), 프리면 몸 옆으로 내림(6) */}
        {markerY !== undefined ? (
          <>
            <line
              x1={ASSIST_SHOULDER_X}
              y1={SHOULDER_Y}
              x2={ARM_X + 4}
              y2={markerY}
              stroke="var(--v2-accent)"
              strokeWidth={3}
              strokeLinecap="round"
            />
            <circle cx={ARM_X} cy={markerY} r={9} fill="var(--v2-accent-weak)" />
            {/* 바탕색 링으로 팔 선과 분리해 어느 테마에서도 점이 묻히지 않게 한다 */}
            <circle cx={ARM_X} cy={markerY} r={5} fill="var(--v2-accent)" stroke="var(--v2-paper-2)" strokeWidth={2} />
          </>
        ) : (
          <line
            x1={ASSIST_SHOULDER_X}
            y1={SHOULDER_Y}
            x2={72}
            y2={94}
            stroke="var(--v2-ink-4)"
            strokeWidth={3}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)", minWidth: 0 }}>
        <span className="v2-mono-label" style={{ color: "var(--v2-ink-3)" }}>
          {ko ? "보조손" : "Assist hand"}
        </span>
        <span style={{ color: "var(--v2-accent-ink)", fontWeight: 600 }}>{title}</span>
        {caption && (
          <span style={{ color: "var(--v2-ink-2)", fontSize: "var(--v2-t-12)" }}>{caption}</span>
        )}
      </div>
    </V2Card>
  );
}
