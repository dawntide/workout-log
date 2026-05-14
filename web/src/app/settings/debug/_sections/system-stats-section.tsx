"use client";

import React, { useEffect, useState } from "react";

import { apiGet, isAbortError } from "@/lib/api";

import { useLocale } from "@/components/locale-provider";

type UxFunnelResp = {
  from: string;
  to: string;
  rangeDays: number;
  planId: string | null;
  totals: {
    generatedSessions: number;
    savedLogs: number;
    savedLogsWithGeneratedSession: number;
    savedLogsWithExtraExercise: number;
    totalSets: number;
    extraSets: number;
    avgSetsPerLog: number;
  };
  steps: Array<{
    id: "generated_sessions" | "saved_logs" | "saved_logs_with_extra";
    label: string;
    count: number;
    conversionFromPrevious: number | null;
  }>;
  rates: {
    saveFromGenerate: number;
    extraFromSaved: number;
    generatedPerDay: number;
    savedPerDay: number;
  };
  dropoff: {
    fromStepId: string;
    toStepId: string;
    dropCount: number;
    dropRate: number;
  };
  previous?: {
    totals: {
      generatedSessions: number;
      savedLogs: number;
      savedLogsWithGeneratedSession: number;
      savedLogsWithExtraExercise: number;
      totalSets: number;
      extraSets: number;
      avgSetsPerLog: number;
    };
    rates: {
      saveFromGenerate: number;
      extraFromSaved: number;
      generatedPerDay: number;
      savedPerDay: number;
    };
  };
  trend?: {
    generatedSessionsDelta: number;
    savedLogsDelta: number;
    saveFromGenerateDelta: number;
    extraFromSavedDelta: number;
  };
};

type UxEventsSummaryResp = {
  from: string;
  to: string;
  rangeDays: number;
  totalEvents: number;
  summary: {
    opens: number;
    modeChanges: number;
    generateClicks: number;
    generateSuccesses: number;
    addSheetOpens: number;
    addExerciseAdds: number;
    saveClicks: number;
    saveSuccesses: number;
    saveFailures: number;
    repeatClicks: number;
    repeatSuccesses: number;
  };
  rates: {
    saveSuccessFromClicks: number;
    generateSuccessFromClicks: number;
    addAfterSheetOpen: number;
    repeatSuccessFromClicks: number;
    saveSuccessFromOpens: number;
  };
  previous?: {
    totalEvents: number;
    summary: {
      opens: number;
      modeChanges: number;
      generateClicks: number;
      generateSuccesses: number;
      addSheetOpens: number;
      addExerciseAdds: number;
      saveClicks: number;
      saveSuccesses: number;
      saveFailures: number;
      repeatClicks: number;
      repeatSuccesses: number;
    };
    rates: {
      saveSuccessFromClicks: number;
      generateSuccessFromClicks: number;
      addAfterSheetOpen: number;
      repeatSuccessFromClicks: number;
      saveSuccessFromOpens: number;
    };
  };
  trend?: {
    totalEventsDelta: number;
    opensDelta: number;
    modeChangesDelta: number;
    generateSuccessesDelta: number;
    saveSuccessesDelta: number;
    addExerciseAddsDelta: number;
    saveSuccessFromClicksDelta: number;
    saveSuccessFromOpensDelta: number;
  };
};

type UxSummaryWindow = {
  days: 1 | 7 | 14;
  payload: UxEventsSummaryResp;
};

type UxSnapshotResp = {
  exportedAt: string;
  funnel: UxFunnelResp;
  windows: UxSummaryWindow[];
  thresholds: Array<{
    id: string;
    label: string;
    value: number;
    target: number;
    status: "ok" | "warn";
    hint: string;
  }>;
};

type MigrationTelemetryResp = {
  ts: string;
  status: "ok" | "warn" | "critical";
  reasons: string[];
  checks: {
    migrations: {
      localCount: number;
      appliedCount: number;
      pending: number;
      latestAppliedAt: string | null;
      latestAppliedHash: string | null;
    };
    telemetry: {
      lookbackMinutes: number;
      alerts: {
        lockTimeoutCount: number;
        failedCount: number;
        skippedCount: number;
        latestFailureAt: string | null;
        avgLockWaitMs: number;
        maxLockWaitMs: number;
      };
      recentRuns: Array<{
        runId: string;
        runner: string;
        status: string;
        errorCode: string | null;
        message: string | null;
        startedAt: string;
        lockWaitMs: number;
      }>;
    };
  };
};

const MIGRATION_LOOKBACK_PRESETS = [120, 720, 1440, 4320] as const;

function formatIntegerByLocale(value: number, locale: "ko" | "en") {
  return Math.round(value).toLocaleString(locale === "ko" ? "ko-KR" : "en-US");
}

function formatDateTimeLocal(value: string | null, locale: "ko" | "en") {
  if (!value) return "—";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false
  });
}

export function SystemStatsSection() {
  const { locale } = useLocale();
  const [uxSnapshot, setUxSnapshot] = useState<UxSnapshotResp | null>(null);
  const [migrationTelemetry, setMigrationTelemetry] = useState<MigrationTelemetryResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [lookback, setLookback] = useState<number>(720);



  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [uxRes, migRes] = await Promise.all([
          apiGet<UxSnapshotResp>(`/api/stats/ux-snapshot?windows=1,7,14&comparePrev=1`, { signal: controller.signal }),
          apiGet<MigrationTelemetryResp>(`/api/stats/migration-telemetry?lookbackMinutes=${lookback}&limit=20`, { signal: controller.signal })
        ]);
        if (cancelled) return;
        setUxSnapshot(uxRes);
        setMigrationTelemetry(migRes);
      } catch (e) {
        if (!cancelled && !isAbortError(e)) console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [refreshTick, lookback]);

  return (
    <>
      <div>
        <div style={{ marginBottom: "var(--v2-s-7)", paddingBottom: "var(--v2-s-4)" }}>
          <div className="v2-font-display" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--v2-accent)", marginBottom: "4px" }}>
            {locale === "ko" ? "관리 도구" : "Admin Tools"}
          </div>
          <h1 className="v2-font-display" style={{ fontSize: "28px", fontWeight: 800, letterSpacing: "-0.5px", color: "var(--v2-ink)", margin: "0 0 var(--v2-s-2)" }}>
            {locale === "ko" ? "시스템 통계" : "System Stats"}
          </h1>
          <p style={{ fontSize: "13px", color: "var(--v2-ink-2)", margin: 0, lineHeight: 1.5 }}>
            {locale === "ko" ? "앱 운영 상태와 UX 퍼널 지표를 모니터링합니다." : "Monitor app health and UX funnel signals."}
          </p>
        </div>

        {loading ? (
          <div style={{ background: "var(--v2-paper)", borderRadius: "var(--v2-r-4)", padding: "var(--v2-s-4)", marginBottom: "var(--v2-s-5)" }}>
            <div style={{ fontSize: "13px", color: "var(--v2-ink-2)" }}>
              {locale === "ko" ? "시스템 통계를 불러오는 중..." : "Loading system stats..."}
            </div>
          </div>
        ) : null}

        <section style={{ marginBottom: "var(--v2-s-5)" }}>
          <div style={{ marginBottom: "var(--v2-s-2)" }}>
            <h2 className="v2-font-display" style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--v2-ink-2)", margin: 0 }}>
              {locale === "ko" ? "마이그레이션" : "Migrations"}
            </h2>
          </div>
          <div style={{ background: "var(--v2-paper)", borderRadius: "var(--v2-r-4)", padding: "var(--v2-s-4)", boxShadow: "0 1px 3px var(--shadow-color-soft)" }}>
            <div style={{ display: "flex", gap: "var(--v2-s-2)", marginBottom: "var(--v2-s-4)" }}>
              {MIGRATION_LOOKBACK_PRESETS.map(p => (
                <button key={p} onClick={() => setLookback(p)} className={`label ${lookback === p ? "label-primary" : "label-neutral"}`}>
                  {p >= 1440 ? `${p/1440}${locale === "ko" ? "일" : "d"}` : p >= 60 ? `${p/60}${locale === "ko" ? "시간" : "h"}` : `${p}${locale === "ko" ? "분" : "m"}`}
                </button>
              ))}
            </div>
            {migrationTelemetry && (
              <div style={{ fontSize: "14px", display: "grid", gap: "var(--v2-s-1)" }}>
                <div>{locale === "ko" ? "상태" : "Status"}: <span className={`label ${migrationTelemetry.status === "ok" ? "label-complete" : "label-danger"}`}>{migrationTelemetry.status.toUpperCase()}</span></div>
                <div>{locale === "ko" ? "적용" : "Applied"}: {formatIntegerByLocale(migrationTelemetry.checks.migrations.appliedCount, locale)} / {formatIntegerByLocale(migrationTelemetry.checks.migrations.localCount, locale)} ({locale === "ko" ? "대기" : "Pending"}: {formatIntegerByLocale(migrationTelemetry.checks.migrations.pending, locale)})</div>
                <div>{locale === "ko" ? "최근 실패" : "Latest failure"}: {formatDateTimeLocal(migrationTelemetry.checks.telemetry.alerts.latestFailureAt, locale)}</div>
              </div>
            )}
            {!migrationTelemetry && !loading ? (
              <div style={{ fontSize: "13px", color: "var(--v2-ink-2)" }}>
                {locale === "ko" ? "마이그레이션 텔레메트리가 아직 없습니다." : "No migration telemetry is available yet."}
              </div>
            ) : null}
          </div>
        </section>

        <section style={{ marginBottom: "var(--v2-s-5)" }}>
          <div style={{ marginBottom: "var(--v2-s-2)" }}>
            <h2 className="v2-font-display" style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--v2-ink-2)", margin: 0 }}>
              {locale === "ko" ? "UX 퍼널 분석" : "UX Funnel"}
            </h2>
          </div>
          {uxSnapshot?.funnel && (
            <div style={{ display: "grid", gap: "var(--v2-s-4)" }}>
              {uxSnapshot.funnel.steps.map(step => (
                <div key={step.id} style={{ background: "var(--v2-paper)", borderRadius: "var(--v2-r-3)", padding: "var(--v2-s-4)", boxShadow: "0 1px 3px var(--shadow-color-soft)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{step.label}</span>
                    <span className="metric-value">{formatIntegerByLocale(step.count, locale)}</span>
                  </div>
                  {step.conversionFromPrevious !== null && (
                    <div style={{ fontSize: "12px", color: "var(--v2-ink-2)" }}>
                      {locale === "ko" ? "전 단계 대비" : "From previous step"} {Math.round(step.conversionFromPrevious * 100)}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {!uxSnapshot?.funnel && !loading ? (
            <div style={{ background: "var(--v2-paper)", borderRadius: "var(--v2-r-3)", padding: "var(--v2-s-4)" }}>
              <div style={{ fontSize: "13px", color: "var(--v2-ink-2)" }}>
                {locale === "ko" ? "UX 퍼널 데이터가 아직 없습니다." : "No UX funnel data is available yet."}
              </div>
            </div>
          ) : null}
        </section>

        <section>
          <div style={{ marginBottom: "var(--v2-s-2)" }}>
            <h2 className="v2-font-display" style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--v2-ink-2)", margin: 0 }}>
              {locale === "ko" ? "주요 지표 기준치" : "Metric Thresholds"}
            </h2>
          </div>
          <div style={{ display: "grid", gap: "var(--v2-s-2)" }}>
            {uxSnapshot?.thresholds.map(t => (
              <div key={t.id} style={{ background: "var(--v2-paper)", borderRadius: "var(--v2-r-3)", padding: "var(--v2-s-2) var(--v2-s-4)", boxShadow: "0 1px 3px var(--shadow-color-soft)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "14px" }}>{t.label}</span>
                  <span className={`label ${t.status === "ok" ? "label-complete" : "label-warning"}`}>
                    {Math.round(t.value * 100)}% / {locale === "ko" ? "목표" : "Target"} {Math.round(t.target * 100)}%
                  </span>
                </div>
              </div>
            ))}
            {!uxSnapshot?.thresholds?.length && !loading ? (
              <div style={{ background: "var(--v2-paper)", borderRadius: "var(--v2-r-3)", padding: "var(--v2-s-4)" }}>
                <div style={{ fontSize: "13px", color: "var(--v2-ink-2)" }}>
                  {locale === "ko" ? "기준치 데이터가 아직 없습니다." : "No threshold data is available yet."}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </>
  );
}
