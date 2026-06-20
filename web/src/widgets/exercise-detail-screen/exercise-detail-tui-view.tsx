"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { TermBadge, TermLineChart, TermSparkline } from "@/components/v2/terminal";
import type {
  ExerciseDetailBootstrap,
  ExerciseDetailPrPoint,
  ExerciseDetailSet,
} from "@/server/services/exercises/get-exercise-detail-bootstrap";

// terminal(ironlog) 운동 상세 — paper ExerciseDetailScreen의 terminal 대응. 동일 부트스트랩
// props 공유, 표현만 TUI. 메트릭 readout + e1RM 추세(SVG fine 라인 §5) + PR 진행 + 최근
// 세트(날짜 그룹). TermShell ViewPane 안 렌더라 외곽 패딩 없음.

type LoadedBootstrap = Extract<ExerciseDetailBootstrap, { exercise: object }>;

function formatKg(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}t`;
  return `${Math.round(value)}kg`;
}

export function ExerciseDetailTuiView({
  exercise,
  bestE1rm,
  e1rmSeries,
  recentSets,
  prHistory,
  sessions90d,
  totalVolume90d,
  avgRpe90d,
}: LoadedBootstrap) {
  const { locale } = useLocale();
  const router = useRouter();
  const ko = locale === "ko";

  const e1rmValues = e1rmSeries.map((p) => p.e1rm);
  const hasChart = e1rmValues.length > 0;

  return (
    <section
      aria-label={ko ? "운동 상세" : "Exercise detail"}
      style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-4)" }}
    >
      {/* 헤더 */}
      <div
        className="v2-mono-label"
        style={{ display: "flex", alignItems: "center", gap: "var(--v2-s-2)" }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            minHeight: "var(--v2-touch)",
            minWidth: "var(--v2-touch)",
            background: "transparent",
            border: "none",
            color: "var(--term-cyan)",
            cursor: "pointer",
          }}
        >
          ‹
        </button>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--term-fg)",
          }}
        >
          {exercise.name}
        </span>
        {exercise.category ? (
          <TermBadge tone="dim">{exercise.category}</TermBadge>
        ) : null}
      </div>

      {/* 메트릭 readout (90일) */}
      <div
        className="v2-mono-label"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--v2-s-1) var(--v2-s-3)",
        }}
      >
        <Stat
          label={ko ? "최고 e1RM" : "best e1RM"}
          value={bestE1rm ? `${bestE1rm.e1rm.toFixed(1)}kg` : "—"}
          tone="gold"
        />
        <Stat label={ko ? "90일 세션" : "90d sess"} value={String(sessions90d)} />
        <Stat label={ko ? "90일 볼륨" : "90d vol"} value={formatKg(totalVolume90d)} />
        <Stat
          label={ko ? "평균 RPE" : "avg RPE"}
          value={avgRpe90d == null ? "—" : avgRpe90d.toFixed(1)}
        />
      </div>

      {/* e1RM 추세 패널 */}
      {hasChart ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-2)",
            padding: "var(--v2-s-3)",
            background: "var(--term-panel)",
            boxShadow: "inset 0 0 0 1px var(--term-line-box)",
            borderRadius: "var(--v2-r-2)",
          }}
        >
          <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
            {ko ? "e1RM 추세 · 90일" : "e1RM trend · 90d"}
          </span>
          <TermLineChart values={e1rmValues} />
          <div
            className="v2-mono-label"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--v2-s-2)",
              flexWrap: "wrap",
            }}
          >
            <TermSparkline data={e1rmValues} width={20} markPeak />
            {bestE1rm ? (
              <span style={{ color: "var(--term-gold)", marginLeft: "auto" }}>
                ★ {bestE1rm.e1rm.toFixed(1)}kg
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <span className="v2-mono-label" style={{ color: "var(--term-ghost)" }}>
          {ko ? "차트 데이터 없음" : "no chart data"}
        </span>
      )}

      {/* PR 진행 */}
      <PrList items={prHistory} ko={ko} />

      {/* 최근 세트 (날짜 그룹) */}
      <RecentSets items={recentSets} ko={ko} />
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "gold";
}) {
  return (
    <span style={{ display: "flex", justifyContent: "space-between", gap: "var(--v2-s-2)" }}>
      <span style={{ color: "var(--term-dim)" }}>{label}</span>
      <span style={{ color: tone === "gold" ? "var(--term-gold)" : "var(--term-cyan)" }}>
        {value}
      </span>
    </span>
  );
}

function PrList({ items, ko }: { items: ExerciseDetailPrPoint[]; ko: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
      <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
        {ko ? "PR 진행 · 90일" : "PR progression · 90d"}
      </span>
      {items.length === 0 ? (
        <span className="v2-mono-label" style={{ color: "var(--term-ghost)" }}>
          {ko ? "PR 기록 없음" : "no PRs"}
        </span>
      ) : (
        items.map((row) => (
          <div
            key={`${row.date}-${row.e1rm}`}
            className="v2-mono-label"
            style={{ display: "flex", alignItems: "center", gap: "var(--v2-s-2)" }}
          >
            <span style={{ color: "var(--term-gold)", whiteSpace: "nowrap" }}>
              ★ {row.e1rm.toFixed(1)}kg
            </span>
            <span style={{ flex: 1, minWidth: 0, color: "var(--term-dim)", whiteSpace: "nowrap" }}>
              {row.weightKg}×{row.reps} · {row.date.slice(0, 10)}
            </span>
            <TermBadge tone="pr">PR</TermBadge>
          </div>
        ))
      )}
    </div>
  );
}

function RecentSets({ items, ko }: { items: ExerciseDetailSet[]; ko: boolean }) {
  const grouped = useMemo(() => {
    const map = new Map<string, ExerciseDetailSet[]>();
    for (const set of items) {
      const dayKey = set.performedAt.slice(0, 10);
      const list = map.get(dayKey) ?? [];
      list.push(set);
      map.set(dayKey, list);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [items]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}>
      <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
        {ko ? "최근 세트" : "recent sets"}
      </span>
      {grouped.length === 0 ? (
        <span className="v2-mono-label" style={{ color: "var(--term-ghost)" }}>
          {ko ? "세트 기록 없음" : "no sets"}
        </span>
      ) : (
        grouped.map(([day, sets]) => (
          <div
            key={day}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--v2-s-1)",
              padding: "var(--v2-s-2) var(--v2-s-3)",
              background: "var(--term-inset)",
              borderRadius: "var(--v2-r-2)",
            }}
          >
            <div
              className="v2-mono-label"
              style={{ display: "flex", justifyContent: "space-between" }}
            >
              <span style={{ color: "var(--term-fg)" }}>{day}</span>
              <span style={{ color: "var(--term-dim)" }}>
                {sets.length}
                {ko ? " 세트" : " sets"}
              </span>
            </div>
            {sets.map((set, idx) => (
              <div
                key={`${set.logId}-${idx}`}
                className="v2-mono-label"
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "var(--v2-s-2)",
                }}
              >
                <span style={{ color: "var(--term-ghost)", minWidth: "var(--v2-s-5)" }}>
                  #{idx + 1}
                </span>
                <span style={{ flex: 1, color: "var(--term-fg)" }}>
                  {set.weightKg}
                  <span style={{ color: "var(--term-dim)" }}> × </span>
                  {set.reps}
                </span>
                <span style={{ color: "var(--term-dim)" }}>
                  {set.rpe == null ? "RPE —" : `RPE ${set.rpe}`}
                </span>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
