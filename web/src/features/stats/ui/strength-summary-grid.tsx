"use client";
import { errorMessage } from "@/lib/error-message";

import { memo, useCallback, useEffect, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { ErrorStateRows, EmptyStateRows } from "@/components/ui/settings-state";
import { V2Chip } from "@/components/v2/primitives";
import { apiGet } from "@/lib/api";

type StrengthSummaryItem = {
  exerciseId: string | null;
  exerciseName: string;
  current: {
    e1rm: number;
    date: string;
    weightKg: number;
    reps: number;
  };
  best: {
    e1rm: number;
    date: string;
  };
  recentSeries: number[];
  improvement: number;
};

type StrengthSummaryResponse = {
  items: StrengthSummaryItem[];
};

export const StrengthSummaryGrid = memo(function StrengthSummaryGrid({
  onExerciseSelect,
}: {
  onExerciseSelect?: (id: string, name: string) => void;
}) {
  const { locale } = useLocale();
  const [data, setData] = useState<StrengthSummaryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiGet<StrengthSummaryResponse>(
        "/api/stats/strength-summary?days=60&limit=4",
      );
      setData(response.items);
    } catch (e) {
      setError(
        errorMessage(e) ??
          (locale === "ko"
            ? "데이터를 불러오지 못했습니다."
            : "Could not load the data."),
      );
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) return null;
  if (error) return <ErrorStateRows message={error} onRetry={loadData} />;
  if (!data || data.length === 0) {
    return (
      <EmptyStateRows
        when={true}
        label={
          locale === "ko" ? "기록된 운동이 없습니다." : "No recorded exercises."
        }
        description={
          locale === "ko"
            ? "무거운 중량으로 운동을 기록하면 여기에 나타납니다."
            : "Heavy logged lifts will appear here."
        }
      />
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "var(--v2-s-4)",
      }}
    >
      {data.map((item) => (
        <StrengthCard
          key={item.exerciseName}
          item={item}
          locale={locale}
          onClick={() =>
            item.exerciseId &&
            onExerciseSelect?.(item.exerciseId, item.exerciseName)
          }
        />
      ))}
    </div>
  );
});

function StrengthCard({
  item,
  locale,
  onClick,
}: {
  item: StrengthSummaryItem;
  locale: "ko" | "en";
  onClick?: () => void;
}) {
  const isPr = item.current.e1rm >= item.best.e1rm;
  const trendColor =
    item.improvement > 0
      ? "var(--v2-c-success)"
      : item.improvement < 0
        ? "var(--v2-c-danger)"
        : "var(--v2-ink-3)";

  return (
    <div
      onClick={onClick}
      className={onClick ? "v2-pressable" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--v2-s-1)",
        cursor: onClick ? "pointer" : "default",
        minHeight: "var(--v2-s-9)",
        padding: "var(--v2-s-4)",
        background: "var(--v2-paper)",
        borderRadius: "var(--v2-r-4)",
        boxShadow: "var(--v2-elev-1)",
        color: "var(--v2-c-onerm)",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <p
          className="v2-small"
          style={{
            color: "var(--v2-ink-2)",
            fontWeight: 500,
            fontSize: "var(--v2-t-12)",
          }}
        >
          {item.exerciseName}
        </p>
        {isPr ? (
          <V2Chip tone="pr">PR</V2Chip>
        ) : (
          <V2Chip tone="neutral">e1RM</V2Chip>
        )}
      </header>

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <p
          className="v2-num-md"
          style={{
            color: "var(--v2-c-onerm)",
            marginBottom: 2,
          }}
        >
          {item.current.e1rm.toFixed(1)}
          <span
            style={{
              fontSize: "var(--v2-t-14)",
              marginLeft: 2,
              color: "var(--v2-ink-3)",
              fontWeight: 400,
            }}
          >
            kg
          </span>
        </p>
      </div>

      <footer style={{ marginTop: "auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--v2-s-1)",
          }}
        >
          <span
            className="v2-mono-label"
            style={{ color: "var(--v2-ink-3)", fontSize: "var(--v2-t-label)" }}
          >
            {locale === "ko" ? "최고" : "Best"}: {item.best.e1rm.toFixed(1)}kg
          </span>
          {item.improvement !== 0 ? (
            <span
              className="v2-mono-label"
              style={{
                color: trendColor,
                fontSize: "var(--v2-t-label)",
              }}
            >
              {item.improvement > 0 ? "+" : ""}
              {item.improvement.toFixed(1)}%
            </span>
          ) : null}
        </div>
        <div style={{ height: 16, width: "100%", opacity: 0.8 }}>
          <MiniSparkline points={item.recentSeries} />
        </div>
      </footer>
    </div>
  );
}

function MiniSparkline({ points }: { points: number[] }) {
  if (points.length < 2) {
    return (
      <div
        style={{
          height: 1,
          background: "var(--v2-hairline)",
          width: "100%",
        }}
      />
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 100;
  const height = 16;

  const pts = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="sparkline-chart"
      preserveAspectRatio="none"
      style={{ width: "100%", height: "100%" }}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}
