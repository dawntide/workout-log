"use client";

import { V2Card } from "@/components/v2/primitives";
import { useLocale } from "@/components/locale-provider";
import type { EnduranceResult } from "@/server/stats/endurance-service";
import type { MuscleVolumeResult } from "@/server/stats/muscle-volume-service";
import type { StrengthScoreResult } from "@/server/stats/strength-score-service";
import type { TrainingGoalKey } from "@/lib/settings/workout-preferences";
import type { HomeData } from "@/lib/home/home-data-source";

export type GoalSectionMetrics = {
  muscleVolume: MuscleVolumeResult | null;
  strengthScore: StrengthScoreResult | null;
  endurance: EnduranceResult | null;
};

const MUSCLE_GROUP_LABEL_KO: Record<string, string> = {
  Quad: "대퇴사두",
  Hamstring: "햄스트링",
  Glute: "둔근",
  Back: "등",
  Chest: "가슴",
  Shoulder: "어깨",
  Arm: "팔",
  Core: "코어",
  Other: "기타",
};

const MUSCLE_GROUP_LABEL_EN: Record<string, string> = {
  Quad: "Quads",
  Hamstring: "Hamstrings",
  Glute: "Glutes",
  Back: "Back",
  Chest: "Chest",
  Shoulder: "Shoulders",
  Arm: "Arms",
  Core: "Core",
  Other: "Other",
};

const WEEKDAY_LABEL_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
const WEEKDAY_LABEL_EN = ["S", "M", "T", "W", "T", "F", "S"] as const;

export function GoalSection({
  goal,
  metrics,
}: {
  goal: TrainingGoalKey;
  metrics: GoalSectionMetrics;
}) {
  if (goal === "general") return null;

  if (goal === "hypertrophy" && metrics.muscleVolume) {
    return <MuscleVolumeHeatmap result={metrics.muscleVolume} />;
  }
  if ((goal === "strength" || goal === "powerlifting") && metrics.strengthScore) {
    return <Big3TotalCard result={metrics.strengthScore} />;
  }
  if (goal === "endurance" && metrics.endurance) {
    return <EnduranceTimeCard result={metrics.endurance} />;
  }
  return null;
}

export function HomeGoalSection({ data }: { data: HomeData }) {
  return <GoalSection goal={data.goal} metrics={data.goalMetrics} />;
}

function GoalCardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: "0px 0px var(--v2-s-3)" }}>
      <p className="v2-label">{title}</p>
      {subtitle ? (
        <p
          className="v2-small"
          style={{ marginTop: "var(--v2-s-1)", color: "var(--v2-ink-3)" }}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function MuscleVolumeHeatmap({ result }: { result: MuscleVolumeResult }) {
  const { locale } = useLocale();
  const labels = locale === "ko" ? MUSCLE_GROUP_LABEL_KO : MUSCLE_GROUP_LABEL_EN;
  const totals = result.totals.filter((t) => t.tonnageKg > 0).slice(0, 8);
  const maxTonnage = totals.reduce((max, t) => Math.max(max, t.tonnageKg), 0) || 1;

  return (
    <div style={{ padding: "var(--v2-s-4) 0px 0px" }}>
      <V2Card>
        <GoalCardHeader
          title={locale === "ko" ? "근육군별 주간 볼륨" : "Volume by Muscle Group"}
          subtitle={
            locale === "ko" ? "최근 8주 누적 부하" : "Last 8 weeks total load"
          }
        />
        {totals.length === 0 ? (
          <p className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
            {locale === "ko"
              ? "기록된 볼륨이 없습니다."
              : "No logged volume yet."}
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--v2-s-2)",
            }}
          >
            {totals.map((row) => {
              const widthPct = Math.max(4, Math.round((row.tonnageKg / maxTonnage) * 100));
              return (
                <div key={row.muscleGroup}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "var(--v2-s-2)",
                      marginBottom: "var(--v2-s-1)",
                    }}
                  >
                    <span
                      className="v2-body"
                      style={{ fontWeight: 600 }}
                    >
                      {labels[row.muscleGroup] ?? row.muscleGroup}
                    </span>
                    <span
                      className="v2-mono-label"
                      style={{ color: "var(--v2-ink-3)" }}
                    >
                      {Math.round(row.tonnageKg).toLocaleString()} kg
                      {" · "}
                      {row.setCount}
                      {locale === "ko" ? " 세트" : " sets"}
                    </span>
                  </div>
                  <div
                    style={{
                      height: "var(--v2-s-2)",
                      background: "var(--v2-paper-3)",
                      borderRadius: "var(--v2-r-pill)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${widthPct}%`,
                        height: "100%",
                        background: "var(--v2-c-progress)",
                        borderRadius: "var(--v2-r-pill)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </V2Card>
    </div>
  );
}

function Big3TotalCard({ result }: { result: StrengthScoreResult }) {
  const { locale } = useLocale();
  const totalText =
    result.totalE1rmKg > 0
      ? `${Math.round(result.totalE1rmKg).toLocaleString()} kg`
      : "—";
  const ratioText =
    result.totalBodyweightRatio !== null
      ? `${result.totalBodyweightRatio.toFixed(2)}×`
      : null;

  return (
    <div style={{ padding: "var(--v2-s-4) 0px 0px" }}>
      <V2Card>
        <GoalCardHeader
          title={locale === "ko" ? "3대 토탈 (Big 3)" : "Big 3 Total"}
          subtitle={
            locale === "ko"
              ? "최근 8주 추정 1RM 합산"
              : "Estimated 1RM sum (last 8 weeks)"
          }
        />
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "var(--v2-s-2)",
          }}
        >
          <span className="v2-num-md" style={{ color: "var(--v2-c-pr)" }}>
            {totalText}
          </span>
          {ratioText ? (
            <span
              className="v2-mono-label"
              style={{ color: "var(--v2-ink-3)" }}
            >
              {locale === "ko" ? "체중 대비" : "BW ratio"} {ratioText}
            </span>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-2)",
            marginTop: "var(--v2-s-3)",
          }}
        >
          {result.big3.map((lift) => (
            <div
              key={lift.liftName}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "var(--v2-s-2)",
              }}
            >
              <span className="v2-body" style={{ fontWeight: 600 }}>
                {lift.liftName}
              </span>
              <span
                className="v2-mono-label"
                style={{ color: "var(--v2-ink-3)" }}
              >
                {lift.bestE1rmKg !== null
                  ? `${Math.round(lift.bestE1rmKg).toLocaleString()} kg`
                  : "—"}
                {lift.bodyweightRatio !== null
                  ? ` · ${lift.bodyweightRatio.toFixed(2)}×`
                  : ""}
              </span>
            </div>
          ))}
        </div>
      </V2Card>
    </div>
  );
}

function EnduranceTimeCard({ result }: { result: EnduranceResult }) {
  const { locale } = useLocale();
  const labels = locale === "ko" ? WEEKDAY_LABEL_KO : WEEKDAY_LABEL_EN;
  const maxWeekday = result.weekdayDistribution.reduce(
    (max, w) => Math.max(max, w.sessionCount),
    0,
  );
  const totalMinutes = result.totals.totalMinutes;
  const avg = result.totals.averageSessionMinutes;

  return (
    <div style={{ padding: "var(--v2-s-4) 0px 0px" }}>
      <V2Card>
        <GoalCardHeader
          title={locale === "ko" ? "주간 운동 시간" : "Weekly Training Time"}
          subtitle={
            locale === "ko"
              ? "최근 8주 누적 시간 · 평균 세션 시간"
              : "Total minutes · avg session (last 8 weeks)"
          }
        />
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "var(--v2-s-3)",
          }}
        >
          <span
            className="v2-num-md"
            style={{ color: "var(--v2-c-progress)" }}
          >
            {Math.round(totalMinutes).toLocaleString()}
          </span>
          <span className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
            {locale === "ko" ? "분" : "min"}
          </span>
          {avg !== null ? (
            <span
              className="v2-mono-label"
              style={{ color: "var(--v2-ink-3)" }}
            >
              {locale === "ko" ? "평균" : "avg"} {avg.toFixed(1)}{" "}
              {locale === "ko" ? "분" : "min"}
            </span>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "var(--v2-s-1)",
            marginTop: "var(--v2-s-4)",
          }}
        >
          {result.weekdayDistribution.map((w, i) => {
            const heightPct =
              maxWeekday > 0
                ? Math.max(8, Math.round((w.sessionCount / maxWeekday) * 100))
                : 8;
            return (
              <div
                key={w.weekday}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "var(--v2-s-1)",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "var(--v2-s-7)",
                    background: "var(--v2-paper-3)",
                    borderRadius: "var(--v2-r-1)",
                    display: "flex",
                    alignItems: "flex-end",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: `${heightPct}%`,
                      background:
                        w.sessionCount > 0
                          ? "var(--v2-c-progress)"
                          : "var(--v2-paper-3)",
                      borderRadius: "var(--v2-r-1)",
                    }}
                  />
                </div>
                <span
                  className="v2-mono-label"
                  style={{ color: "var(--v2-ink-3)" }}
                >
                  {labels[i]}
                </span>
              </div>
            );
          })}
        </div>
      </V2Card>
    </div>
  );
}
