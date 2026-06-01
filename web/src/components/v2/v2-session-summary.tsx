"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import type { ProgressionSummaryPayload } from "@/lib/progression/summary";
import type { TrainingGoalKey } from "@/lib/settings/workout-preferences";
import {
  resolveLoggedTotalLoadKg,
  resolveLoggedLoadDisplay,
} from "@/lib/bodyweight-load";
import {
  V2Card,
  V2Chip,
  V2PrimaryBtn,
  V2CountUp,
} from "./primitives";

/* ─── types (loose to fit /api/logs/[id] response) ─── */

export type V2SummarySet = {
  id?: string;
  exerciseName: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  rpe?: number | null;
  isExtra: boolean;
  meta?: Record<string, unknown> | null;
};

export type V2SummaryLog = {
  id: string;
  performedAt: string;
  durationMinutes: number | null;
  notes: string | null;
  sets: V2SummarySet[];
  generatedSession?: {
    sessionKey?: string | null;
  } | null;
  progression?: ProgressionSummaryPayload | null;
  /** 서버 계산된 PR (best e1RM 비교 기반). detectPersonalRecords 결과. */
  personalRecords?: V2PersonalRecord[] | null;
  /** 사용자의 1순위 운동 목적. BigStat / hero 카피 차별화에 사용. */
  goal?: TrainingGoalKey | null;
};

export type V2PersonalRecord = {
  exerciseName: string;
  topWeightKg: number;
  topReps: number;
  estOneRm: number;
  previousBestE1rm: number | null;
  deltaE1rm: number;
};

type PrCard = {
  target: string;
  afterWorkKg: number;
  beforeWorkKg: number | null;
  deltaKg: number;
  /** PR 카드 표시할 운동명 — exercise name과 비교 매칭에 사용 */
  matchKey: string;
  /** PR 종류: progression 이벤트 기반 / 절대 best e1RM 기반 */
  source: "progression" | "personal";
  /** personal 종류일 때만 — EST 1RM */
  estOneRm?: number;
};

/* ─── helpers ─── */

function formatVolumeShort(kg: number): string {
  if (kg <= 0) return "0";
  if (kg >= 1000) {
    const t = kg / 1000;
    return t % 1 === 0 ? `${t.toFixed(0)}k` : `${t.toFixed(1)}k`;
  }
  return Math.round(kg).toLocaleString();
}

function formatDurationLong(minutes: number | null): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const mm = Math.floor(minutes);
  const ss = Math.round((minutes - mm) * 60);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function formatPerformedAt(iso: string, locale: "ko" | "en"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale === "ko" ? "ko-KR" : "en-US", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type ExerciseSummary = {
  name: string;
  setCount: number;
  topWeightKg: number;
  /** 맨몸 운동 총무게 뒤 추가중량 병기 (`(+20)`/`(체중)`). */
  topWeightSuffix: string | null;
  totalReps: number;
  volumeKg: number;
};

function buildPrCards(
  progression: ProgressionSummaryPayload | null | undefined,
  personalRecords: V2PersonalRecord[] | null | undefined,
): PrCard[] {
  const out: PrCard[] = [];
  const seenKeys = new Set<string>();

  // 1) Personal records (절대 best e1RM 갱신) — 우선 표시
  for (const p of personalRecords ?? []) {
    const matchKey = p.exerciseName.trim().toLowerCase();
    if (!matchKey || seenKeys.has(matchKey)) continue;
    seenKeys.add(matchKey);
    out.push({
      target: p.exerciseName,
      afterWorkKg: p.topWeightKg,
      beforeWorkKg: null,
      deltaKg: p.deltaE1rm,
      matchKey,
      source: "personal",
      estOneRm: p.estOneRm,
    });
  }

  // 2) Progression event (프로그램 자동 진행)
  if (progression?.event) {
    for (const d of progression.event.targetDecisions) {
      if (d.eventType !== "INCREASE" || d.outcome !== "SUCCESS") continue;
      const after = d.afterWorkKg;
      const delta = d.deltaWorkKg;
      if (after == null || delta == null || delta <= 0) continue;
      const matchKey = d.target.trim().toLowerCase();
      if (seenKeys.has(matchKey)) continue;
      seenKeys.add(matchKey);
      out.push({
        target: d.target,
        afterWorkKg: after,
        beforeWorkKg: d.beforeWorkKg,
        deltaKg: delta,
        matchKey,
        source: "progression",
      });
    }
  }
  return out;
}

function epleyEstimate(weightKg: number, reps: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  const r = Math.max(1, Number.isFinite(reps) ? reps : 1);
  return weightKg * (1 + r / 30);
}

function buildExerciseSummaries(sets: V2SummarySet[]): ExerciseSummary[] {
  const map = new Map<string, ExerciseSummary>();
  for (const s of sets) {
    const name = String(s.exerciseName ?? "").trim();
    if (!name) continue;
    const cur = map.get(name) ?? {
      name,
      setCount: 0,
      topWeightKg: 0,
      topWeightSuffix: null,
      totalReps: 0,
      volumeKg: 0,
    };
    cur.setCount += 1;
    // 맨몸 운동은 총부하(체중+추가)로 top weight·볼륨을 집계한다.
    const w = Number(
      resolveLoggedTotalLoadKg({
        exerciseName: name,
        weightKg: s.weightKg,
        meta: s.meta,
      }) ?? 0,
    );
    const r = Number(s.reps ?? 0);
    if (Number.isFinite(w) && w > cur.topWeightKg) {
      cur.topWeightKg = w;
      cur.topWeightSuffix = resolveLoggedLoadDisplay({
        exerciseName: name,
        weightKg: s.weightKg,
        meta: s.meta,
      }).suffix;
    }
    if (Number.isFinite(r)) cur.totalReps += r;
    if (Number.isFinite(w) && Number.isFinite(r) && w > 0 && r > 0) {
      cur.volumeKg += w * r;
    }
    map.set(name, cur);
  }
  return Array.from(map.values());
}

/** 세션 전체에서 EST 1RM 기준 최고 세트(epley) — 스트렝스/파워리프팅 BigStat에 사용. */
function findTopEstOneRm(sets: V2SummarySet[]): {
  exerciseName: string;
  weightKg: number;
  reps: number;
  estOneRm: number;
} | null {
  let best: {
    exerciseName: string;
    weightKg: number;
    reps: number;
    estOneRm: number;
  } | null = null;
  for (const s of sets) {
    if (s.isExtra) continue;
    const name = String(s.exerciseName ?? "").trim();
    // 맨몸 운동은 총부하(체중+추가)로 e1RM을 추정한다.
    const w = Number(
      resolveLoggedTotalLoadKg({
        exerciseName: name,
        weightKg: s.weightKg,
        meta: s.meta,
      }) ?? 0,
    );
    const r = Number(s.reps ?? 0);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(r) || r <= 0)
      continue;
    const e = epleyEstimate(w, r);
    if (!best || e > best.estOneRm) {
      best = {
        exerciseName: name,
        weightKg: w,
        reps: r,
        estOneRm: e,
      };
    }
  }
  return best;
}

type ResolvedGoal = "strength" | "hypertrophy" | "endurance" | "general";

function resolveGoal(goal: TrainingGoalKey | null | undefined): ResolvedGoal {
  if (goal === "strength" || goal === "powerlifting") return "strength";
  if (goal === "hypertrophy") return "hypertrophy";
  if (goal === "endurance") return "endurance";
  return "general";
}

function getHeroCopy(
  resolved: ResolvedGoal,
  locale: "ko" | "en",
  freshComplete: boolean,
): { title: string; eyebrow: string } {
  if (!freshComplete) {
    return {
      title: locale === "ko" ? "세션 요약" : "Session Summary",
      eyebrow: locale === "ko" ? "수행 기록" : "PERFORMED",
    };
  }
  const eyebrow = locale === "ko" ? "세션 완료" : "SESSION COMPLETE";
  const titleMap: Record<ResolvedGoal, { ko: string; en: string }> = {
    strength: { ko: "강해졌어요.", en: "Stronger." },
    hypertrophy: { ko: "한 걸음 더.", en: "One step closer." },
    endurance: { ko: "꾸준함이 무기.", en: "Consistency pays." },
    general: { ko: "잘했어요.", en: "Well done." },
  };
  const t = titleMap[resolved];
  return { title: locale === "ko" ? t.ko : t.en, eyebrow };
}

/* ─── BigStat ─── */

function BigStat({
  label,
  value,
  unit,
  color,
  delta,
  sub,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  color?: string;
  delta?: string;
  sub?: string;
}) {
  return (
    <V2Card padding="var(--v2-s-5)">
      <div className="v2-label" style={{ fontSize: "var(--v2-t-eyebrow)" }}>
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "var(--v2-s-1)",
          marginTop: 8,
        }}
      >
        <span
          className="v2-num-md"
          style={{ fontSize: "var(--v2-t-h1)", color: color ?? "var(--v2-ink)" }}
        >
          {value}
        </span>
        {unit && (
          <span
            className="v2-mono-label"
            style={{ color: "var(--v2-ink-3)" }}
          >
            {unit}
          </span>
        )}
      </div>
      {(delta || sub) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--v2-s-1)",
            marginTop: 6,
          }}
        >
          {delta && (
            <span
              className="v2-mono-label"
              style={{ color: "var(--v2-c-success)" }}
            >
              {delta}
            </span>
          )}
          {sub && (
            <span
              className="v2-mono-label"
              style={{ color: "var(--v2-ink-3)" }}
            >
              {sub}
            </span>
          )}
        </div>
      )}
    </V2Card>
  );
}

/* ─── Confetti (단순 SVG) ─── */

function Confetti() {
  const bits = Array.from({ length: 14 });
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        animation: "v2-fade-out 2.4s ease-out 1.6s forwards",
        overflow: "hidden",
      }}
    >
      {bits.map((_, i) => {
        const x = ((i * 37) % 100) + ((i % 5) * 3);
        const delay = (i * 53) % 400;
        const dur = 1400 + ((i * 91) % 800);
        const rot = (i * 37) % 360;
        const colors = [
          "var(--v2-c-pr)",
          "var(--v2-accent)",
          "var(--v2-c-success)",
          "var(--v2-c-volume)",
        ];
        const col = colors[i % colors.length];
        const style: CSSProperties = {
          position: "absolute",
          left: `${x % 100}%`,
          top: 0,
          width: 8,
          height: 14,
          background: col,
          borderRadius: 2,
          animation: `v2-confetti ${dur}ms ${delay}ms cubic-bezier(0.2, 0.8, 0.4, 1) forwards`,
          transform: `rotate(${rot}deg)`,
          opacity: 0,
        };
        return <span key={i} style={style} />;
      })}
    </div>
  );
}

/* ─── 메인 ─── */

export function V2SessionSummary({
  log,
  freshComplete = false,
}: {
  log: V2SummaryLog | null;
  /** true면 "방금 완료한 세션" 모드 (콘페티 + 큰 헤로 + 셀러브레이션 카피) */
  freshComplete?: boolean;
}) {
  const { locale } = useLocale();

  const summary = useMemo(() => {
    if (!log) return null;
    const exerciseSummaries = buildExerciseSummaries(log.sets);
    const totalVolume = exerciseSummaries.reduce((s, e) => s + e.volumeKg, 0);
    const totalSets = exerciseSummaries.reduce((s, e) => s + e.setCount, 0);
    const totalReps = exerciseSummaries.reduce((s, e) => s + e.totalReps, 0);
    const topEstOneRm = findTopEstOneRm(log.sets);
    const prCards = buildPrCards(log.progression, log.personalRecords);

    // 운동명별 top set 매칭 — progression 카드의 EST 1RM 보강에 사용
    const exerciseTopSet = new Map<
      string,
      { weightKg: number; reps: number }
    >();
    for (const s of log.sets) {
      const w = Number(s.weightKg ?? 0);
      const r = Number(s.reps ?? 0);
      if (!Number.isFinite(w) || w <= 0) continue;
      const key = String(s.exerciseName ?? "").trim().toLowerCase();
      if (!key) continue;
      const cur = exerciseTopSet.get(key);
      if (!cur || w > cur.weightKg) {
        exerciseTopSet.set(key, { weightKg: w, reps: r });
      }
    }

    // PR 카드에 EST 1RM 보강 (progression 종류만; personal은 이미 서버에서 계산됨)
    const enrichedPrs = prCards.map((p) => {
      if (p.source === "personal") return p;
      const top = exerciseTopSet.get(p.matchKey);
      const reps = top?.reps ?? 1;
      return {
        ...p,
        estOneRm: epleyEstimate(p.afterWorkKg, reps),
      };
    });

    // 운동명 set: PR 배지 표시 여부 결정
    const prKeys = new Set(enrichedPrs.map((p) => p.matchKey));

    return {
      exerciseSummaries,
      totalVolume,
      totalSets,
      totalReps,
      topEstOneRm,
      prCards: enrichedPrs,
      prKeys,
    };
  }, [log]);

  if (!log || !summary) return null;

  const durationLabel = formatDurationLong(log.durationMinutes);
  const performedAtLabel = formatPerformedAt(log.performedAt, locale);
  const resolvedGoal = resolveGoal(log.goal);
  const { title: heroTitle, eyebrow: heroEyebrow } = getHeroCopy(
    resolvedGoal,
    locale,
    freshComplete,
  );

  // PR이 있을 때는 EST 1RM에 강조 표시를 위해 매칭 키 비교
  const topPrMatch =
    summary.topEstOneRm &&
    summary.prKeys.has(summary.topEstOneRm.exerciseName.trim().toLowerCase());

  return (
    <div
      style={{
        padding: "var(--v2-s-2) 0px var(--v2-s-4)",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* ── 히어로 ── */}
      <div
        style={{
          padding: "var(--v2-s-5) var(--v2-s-6) var(--v2-s-6)",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {freshComplete && <Confetti />}
        <p
          className="v2-eyebrow"
          style={{
            color: freshComplete
              ? "var(--v2-c-pr)"
              : "var(--v2-ink-3)",
            position: "relative",
          }}
        >
          {heroEyebrow}
        </p>
        <h1
          className={freshComplete ? "v2-display" : "v2-h1"}
          style={{
            fontSize: freshComplete ? 56 : 30,
            marginTop: 14,
            position: "relative",
            animation: freshComplete
              ? "v2-rise 600ms cubic-bezier(0.34, 1.6, 0.64, 1) both"
              : undefined,
          }}
        >
          {heroTitle}
        </h1>
        <p
          className="v2-body"
          style={{
            marginTop: 10,
            color: "var(--v2-ink-2)",
            position: "relative",
          }}
        >
          {performedAtLabel}
          {durationLabel && (
            <>
              {" · "}
              <strong style={{ color: "var(--v2-ink)" }}>
                {durationLabel}
              </strong>
            </>
          )}
        </p>
      </div>

      {/* ── BigStats (goal별 차별화) ── */}
      <div
        style={{
          padding: "0px var(--v2-s-4)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--v2-s-2)",
        }}
      >
        {resolvedGoal === "strength" ? (
          <BigStat
            label={locale === "ko" ? "최고 EST 1RM" : "Top EST 1RM"}
            value={
              summary.topEstOneRm
                ? freshComplete
                  ? (
                      <V2CountUp
                        to={summary.topEstOneRm.estOneRm}
                        format={(v) => v.toFixed(1)}
                      />
                    )
                  : summary.topEstOneRm.estOneRm.toFixed(1)
                : "—"
            }
            unit={summary.topEstOneRm ? "kg" : undefined}
            color="var(--v2-c-onerm)"
            sub={
              summary.topEstOneRm
                ? topPrMatch
                  ? `${summary.topEstOneRm.exerciseName} · ${locale === "ko" ? "PR" : "PR"}`
                  : `${summary.topEstOneRm.exerciseName} · ${summary.topEstOneRm.weightKg}kg × ${summary.topEstOneRm.reps}`
                : locale === "ko"
                  ? "기록된 세트 없음"
                  : "No logged sets"
            }
          />
        ) : resolvedGoal === "endurance" ? (
          <BigStat
            label={locale === "ko" ? "시간" : "Duration"}
            value={durationLabel ?? "—"}
            color="var(--v2-c-progress)"
            sub={
              locale === "ko"
                ? `${summary.exerciseSummaries.length}개 운동`
                : `${summary.exerciseSummaries.length} exercises`
            }
          />
        ) : (
          <BigStat
            label={locale === "ko" ? "총 볼륨" : "Volume"}
            value={
              freshComplete ? (
                <V2CountUp
                  to={summary.totalVolume}
                  format={(v) => Math.round(v).toLocaleString()}
                />
              ) : (
                Math.round(summary.totalVolume).toLocaleString()
              )
            }
            unit="kg"
            color="var(--v2-c-volume)"
            sub={
              locale === "ko"
                ? `${summary.totalSets}세트`
                : `${summary.totalSets} sets`
            }
          />
        )}

        {resolvedGoal === "endurance" ? (
          <BigStat
            label={locale === "ko" ? "총 세트" : "Total sets"}
            value={
              freshComplete ? (
                <V2CountUp
                  to={summary.totalSets}
                  format={(v) => Math.round(v).toLocaleString()}
                />
              ) : (
                summary.totalSets.toLocaleString()
              )
            }
            color="var(--v2-c-reps)"
            sub={
              locale === "ko"
                ? `${summary.totalReps.toLocaleString()} reps`
                : `${summary.totalReps.toLocaleString()} reps`
            }
          />
        ) : (
          <BigStat
            label={locale === "ko" ? "시간" : "Duration"}
            value={durationLabel ?? "—"}
            color="var(--v2-ink)"
            sub={
              locale === "ko"
                ? `${summary.exerciseSummaries.length}개 운동`
                : `${summary.exerciseSummaries.length} exercises`
            }
          />
        )}
      </div>

      {/* ── PR 카드 ── */}
      {summary.prCards.length > 0 && (
        <div
          style={{
            padding: "var(--v2-s-3) var(--v2-s-4) 0px",
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-2)",
          }}
        >
          {summary.prCards.map((p) => {
            const isPersonal = p.source === "personal";
            const eyebrow = isPersonal
              ? locale === "ko"
                ? "새 PR"
                : "NEW PR"
              : locale === "ko"
                ? "증량 성공"
                : "PROGRESSED";
            return (
              <V2Card
                key={`${p.source}:${p.target}`}
                padding="var(--v2-s-5)"
                style={{
                  background:
                    "color-mix(in srgb, var(--v2-c-pr) 12%, var(--v2-paper))",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--v2-s-3)",
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: "var(--v2-t-h1)",
                      color: "var(--v2-c-pr)",
                      fontVariationSettings: "'FILL' 1, 'wght' 600",
                    }}
                    aria-hidden
                  >
                    workspace_premium
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      className="v2-label"
                      style={{ color: "var(--v2-c-pr)", fontSize: "var(--v2-t-eyebrow)" }}
                    >
                      {eyebrow}
                    </div>
                    <div
                      className="v2-h2"
                      style={{
                        fontSize: "var(--v2-t-20)",
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {p.target} ·{" "}
                      <span style={{ color: "var(--v2-c-pr)" }}>
                        {p.afterWorkKg.toFixed(1)} kg
                      </span>
                    </div>
                    <div
                      className="v2-mono-label"
                      style={{ color: "var(--v2-ink-3)", marginTop: 4 }}
                    >
                      {isPersonal ? (
                        <>
                          EST 1RM{" "}
                          {(p.estOneRm ?? 0).toFixed(1)}
                          {p.deltaKg > 0
                            ? ` · +${p.deltaKg.toFixed(1)} ${locale === "ko" ? "kg 갱신" : "kg over best"}`
                            : ""}
                        </>
                      ) : p.beforeWorkKg != null ? (
                        `${p.beforeWorkKg.toFixed(1)} → ${p.afterWorkKg.toFixed(1)} (+${p.deltaKg.toFixed(1)})${
                          (p.estOneRm ?? 0) > 0
                            ? ` · EST 1RM ${(p.estOneRm ?? 0).toFixed(1)}`
                            : ""
                        }`
                      ) : (
                        `+${p.deltaKg.toFixed(1)}kg${
                          (p.estOneRm ?? 0) > 0
                            ? ` · EST 1RM ${(p.estOneRm ?? 0).toFixed(1)}`
                            : ""
                        }`
                      )}
                    </div>
                  </div>
                </div>
              </V2Card>
            );
          })}
        </div>
      )}

      {/* ── 운동별 요약 ── */}
      {summary.exerciseSummaries.length > 0 && (
        <>
          <div style={{ padding: "var(--v2-s-6) var(--v2-s-6) var(--v2-s-2)" }}>
            <div className="v2-label">
              {locale === "ko" ? "운동별" : "By exercise"}
            </div>
          </div>
          <div style={{ padding: "0px var(--v2-s-4)" }}>
            {summary.exerciseSummaries.map((ex, i) => {
              const isPr = summary.prKeys.has(
                ex.name.trim().toLowerCase(),
              );
              return (
                <V2Card
                  key={`${ex.name}-${i}`}
                  tone="paper"
                  style={{ marginBottom: 6, padding: "var(--v2-s-4) var(--v2-s-4)" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--v2-s-3)",
                    }}
                  >
                    <div
                      className="v2-font-num"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "var(--v2-r-1)",
                        background: isPr
                          ? "color-mix(in srgb, var(--v2-c-pr) 16%, var(--v2-paper))"
                          : "var(--v2-paper-2)",
                        color: isPr
                          ? "var(--v2-c-pr)"
                          : "var(--v2-ink-3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "var(--v2-t-12)",
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--v2-s-1)",
                        }}
                      >
                        <span
                          className="v2-h3"
                          style={{
                            fontSize: "var(--v2-t-14)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          {ex.name}
                        </span>
                        {isPr && <V2Chip tone="pr">PR</V2Chip>}
                      </div>
                      <div
                        className="v2-mono-label"
                        style={{
                          color: "var(--v2-ink-3)",
                          marginTop: 2,
                        }}
                      >
                        {resolvedGoal === "strength" ? (
                          <>
                            {ex.setCount}
                            {locale === "ko" ? "세트" : " sets"}
                            {ex.volumeKg > 0
                              ? ` · ${formatVolumeShort(ex.volumeKg)}kg`
                              : ""}
                          </>
                        ) : resolvedGoal === "endurance" ? (
                          <>
                            {ex.setCount}
                            {locale === "ko" ? "세트" : " sets"}
                            {ex.topWeightKg > 0
                              ? ` · ${ex.topWeightKg.toLocaleString()}kg${ex.topWeightSuffix ? ` ${ex.topWeightSuffix}` : ""}`
                              : ""}
                          </>
                        ) : (
                          <>
                            {ex.setCount}
                            {locale === "ko" ? "세트" : " sets"}
                            {ex.topWeightKg > 0
                              ? ` · top ${ex.topWeightKg.toLocaleString()}kg${ex.topWeightSuffix ? ` ${ex.topWeightSuffix}` : ""}`
                              : ""}
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {resolvedGoal === "strength" ? (
                        <>
                          <div
                            className="v2-num-sm"
                            style={{ color: "var(--v2-c-weight)" }}
                          >
                            {ex.topWeightKg > 0
                              ? ex.topWeightKg.toLocaleString()
                              : "—"}
                          </div>
                          <div
                            className="v2-mono-label"
                            style={{
                              fontSize: "var(--v2-t-eyebrow)",
                              color: "var(--v2-ink-3)",
                              marginTop: 2,
                            }}
                          >
                            {locale === "ko" ? "top kg" : "top kg"}
                          </div>
                        </>
                      ) : resolvedGoal === "endurance" ? (
                        <>
                          <div
                            className="v2-num-sm"
                            style={{ color: "var(--v2-c-reps)" }}
                          >
                            {ex.totalReps.toLocaleString()}
                          </div>
                          <div
                            className="v2-mono-label"
                            style={{
                              fontSize: "var(--v2-t-eyebrow)",
                              color: "var(--v2-ink-3)",
                              marginTop: 2,
                            }}
                          >
                            reps
                          </div>
                        </>
                      ) : (
                        <>
                          <div
                            className="v2-num-sm"
                            style={{ color: "var(--v2-c-volume)" }}
                          >
                            {formatVolumeShort(ex.volumeKg)}
                          </div>
                          <div
                            className="v2-mono-label"
                            style={{
                              fontSize: "var(--v2-t-eyebrow)",
                              color: "var(--v2-ink-3)",
                              marginTop: 2,
                            }}
                          >
                            kg
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </V2Card>
              );
            })}
          </div>
        </>
      )}

      {/* ── 노트 ── */}
      {log.notes && log.notes.trim().length > 0 && (
        <div style={{ padding: "var(--v2-s-4) var(--v2-s-4) 0px" }}>
          <V2Card>
            <div className="v2-label">
              {locale === "ko" ? "노트" : "Notes"}
            </div>
            <p
              className="v2-body"
              style={{ marginTop: 10, whiteSpace: "pre-wrap" }}
            >
              {log.notes}
            </p>
          </V2Card>
        </div>
      )}

      {/* ── 액션 ── */}
      <div
        style={{
          padding: "var(--v2-s-5) var(--v2-s-4) var(--v2-s-2)",
          display: "flex",
          gap: "var(--v2-s-2)",
        }}
      >
        <Link
          href="/"
          style={{ flex: 2, textDecoration: "none" }}
        >
          <V2PrimaryBtn full icon="check">
            {locale === "ko" ? "홈으로" : "Home"}
          </V2PrimaryBtn>
        </Link>
      </div>
    </div>
  );
}

/* PR Card 노출용 (선택적 사용) */
export function V2PRCard({
  exerciseName,
  topWeightKg,
  estOneRm,
  previousBestKg,
}: {
  exerciseName: string;
  topWeightKg: number;
  estOneRm: number;
  previousBestKg?: number | null;
}) {
  const { locale } = useLocale();
  const delta = previousBestKg ? topWeightKg - previousBestKg : null;

  return (
    <div style={{ padding: "var(--v2-s-2) var(--v2-s-4) 0px" }}>
      <V2Card
        padding="var(--v2-s-5)"
        style={{
          background:
            "color-mix(in srgb, var(--v2-c-pr) 12%, var(--v2-paper))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--v2-s-3)" }}>
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: "var(--v2-t-h1)",
              color: "var(--v2-c-pr)",
              fontVariationSettings: "'FILL' 1, 'wght' 600",
            }}
            aria-hidden
          >
            workspace_premium
          </span>
          <div style={{ flex: 1 }}>
            <div
              className="v2-label"
              style={{ color: "var(--v2-c-pr)", fontSize: "var(--v2-t-eyebrow)" }}
            >
              {locale === "ko" ? "새 PR" : "NEW PR"}
            </div>
            <div className="v2-h2" style={{ fontSize: "var(--v2-t-20)", marginTop: 2 }}>
              {exerciseName} ·{" "}
              <span style={{ color: "var(--v2-c-pr)" }}>
                {topWeightKg.toFixed(1)} kg
              </span>
            </div>
            <div
              className="v2-mono-label"
              style={{ color: "var(--v2-ink-3)", marginTop: 4 }}
            >
              EST. 1RM {estOneRm.toFixed(1)}kg
              {delta != null
                ? ` · ${delta > 0 ? "+" : ""}${delta.toFixed(1)}`
                : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--v2-s-1)", marginTop: 12 }}>
          <V2Chip tone="pr" icon="trending_up">
            {locale === "ko" ? "기록" : "Record"}
          </V2Chip>
        </div>
      </V2Card>
    </div>
  );
}
