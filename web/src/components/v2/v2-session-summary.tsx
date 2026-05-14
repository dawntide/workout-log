"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import type { ProgressionSummaryPayload } from "@/lib/progression/summary";
import {
  V2Card,
  V2Chip,
  V2PrimaryBtn,
  V2SecondaryBtn,
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
      totalReps: 0,
      volumeKg: 0,
    };
    cur.setCount += 1;
    const w = Number(s.weightKg ?? 0);
    const r = Number(s.reps ?? 0);
    if (Number.isFinite(w) && w > cur.topWeightKg) cur.topWeightKg = w;
    if (Number.isFinite(r)) cur.totalReps += r;
    if (Number.isFinite(w) && Number.isFinite(r) && w > 0 && r > 0) {
      cur.volumeKg += w * r;
    }
    map.set(name, cur);
  }
  return Array.from(map.values());
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
    <V2Card padding="18px">
      <div className="v2-label" style={{ fontSize: 9 }}>
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 4,
          marginTop: 8,
        }}
      >
        <span
          className="v2-num-md"
          style={{ fontSize: 30, color: color ?? "var(--v2-ink)" }}
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
            gap: 6,
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
      prCards: enrichedPrs,
      prKeys,
    };
  }, [log]);

  if (!log || !summary) return null;

  const durationLabel = formatDurationLong(log.durationMinutes);
  const performedAtLabel = formatPerformedAt(log.performedAt, locale);

  const heroTitle = freshComplete
    ? locale === "ko"
      ? "잘했어요."
      : "Well done."
    : locale === "ko"
      ? "세션 요약"
      : "Session Summary";

  const heroEyebrow = freshComplete
    ? locale === "ko"
      ? "세션 완료"
      : "SESSION COMPLETE"
    : locale === "ko"
      ? "수행 기록"
      : "PERFORMED";

  return (
    <div
      style={{
        padding: "8px 0 16px",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* ── 히어로 ── */}
      <div
        style={{
          padding: "20px 24px 24px",
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

      {/* ── BigStats ── */}
      <div
        style={{
          padding: "0 16px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
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
      </div>

      {/* ── PR 카드 ── */}
      {summary.prCards.length > 0 && (
        <div
          style={{
            padding: "12px 16px 0",
            display: "flex",
            flexDirection: "column",
            gap: 8,
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
                padding="20px"
                style={{
                  background:
                    "color-mix(in srgb, var(--v2-c-pr) 12%, var(--v2-paper))",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: 32,
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
                      style={{ color: "var(--v2-c-pr)", fontSize: 9 }}
                    >
                      {eyebrow}
                    </div>
                    <div
                      className="v2-h2"
                      style={{
                        fontSize: 20,
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
          <div style={{ padding: "24px 24px 8px" }}>
            <div className="v2-label">
              {locale === "ko" ? "운동별" : "By exercise"}
            </div>
          </div>
          <div style={{ padding: "0 16px" }}>
            {summary.exerciseSummaries.map((ex, i) => {
              const isPr = summary.prKeys.has(
                ex.name.trim().toLowerCase(),
              );
              return (
                <V2Card
                  key={`${ex.name}-${i}`}
                  tone="paper"
                  style={{ marginBottom: 6, padding: "14px 16px" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
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
                        fontSize: 12,
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
                          gap: 6,
                        }}
                      >
                        <span
                          className="v2-h3"
                          style={{
                            fontSize: 14,
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
                        {ex.setCount}
                        {locale === "ko" ? "세트" : " sets"}
                        {ex.topWeightKg > 0
                          ? ` · top ${ex.topWeightKg.toLocaleString()}kg`
                          : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        className="v2-num-sm"
                        style={{ color: "var(--v2-c-volume)" }}
                      >
                        {formatVolumeShort(ex.volumeKg)}
                      </div>
                      <div
                        className="v2-mono-label"
                        style={{
                          fontSize: 9,
                          color: "var(--v2-ink-3)",
                          marginTop: 2,
                        }}
                      >
                        kg
                      </div>
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
        <div style={{ padding: "16px 16px 0" }}>
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
          padding: "20px 16px 8px",
          display: "flex",
          gap: 8,
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
    <div style={{ padding: "8px 16px 0" }}>
      <V2Card
        padding="20px"
        style={{
          background:
            "color-mix(in srgb, var(--v2-c-pr) 12%, var(--v2-paper))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 32,
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
              style={{ color: "var(--v2-c-pr)", fontSize: 9 }}
            >
              {locale === "ko" ? "새 PR" : "NEW PR"}
            </div>
            <div className="v2-h2" style={{ fontSize: 20, marginTop: 2 }}>
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
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <V2Chip tone="pr" icon="trending_up">
            {locale === "ko" ? "기록" : "Record"}
          </V2Chip>
        </div>
      </V2Card>
    </div>
  );
}
