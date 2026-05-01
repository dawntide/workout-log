"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/components/locale-provider";

import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { EmptyStateRows, ErrorStateRows, LoadingStateRows } from "@/components/ui/settings-state";
import { SearchInput } from "@/components/ui/search-input";
import { apiDelete, apiGet } from "@/lib/api";
import { progressionTone, summarizeProgression, type ProgressionSummaryPayload } from "@/lib/progression/summary";
import { formatSessionKeyLabel } from "@/lib/session-key";
import { APP_ROUTES } from "@/lib/app-routes";

type Plan = {
  id: string;
  name: string;
  type: "SINGLE" | "COMPOSITE" | "MANUAL";
  rootProgramVersionId: string | null;
  params: any;
  createdAt: string;
  baseProgramName?: string | null;
  lastPerformedAt?: string | null;
};

type LogSet = {
  id: string;
  exerciseName: string;
  reps: number | null;
  weightKg: number | null;
  isExtra: boolean;
};

type LogItem = {
  id: string;
  planId: string | null;
  generatedSessionId: string | null;
  performedAt: string;
  durationMinutes: number | null;
  notes: string | null;
  sets: LogSet[];
  generatedSession: {
    id: string;
    sessionKey: string;
  } | null;
  progression?: ProgressionSummaryPayload | null;
};

type LogsResponse = {
  items: LogItem[];
  nextCursor: string | null;
};

const MONTH_ABBR_KO = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
const MONTH_ABBR_EN = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatTimeOnly(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatDuration(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function summarizeExercises(sets: LogSet[], locale: "ko" | "en") {
  const names: string[] = [];
  for (const set of sets) {
    const name = String(set.exerciseName ?? "").trim();
    if (!name || names.includes(name)) continue;
    names.push(name);
  }
  if (names.length === 0) return locale === "ko" ? "운동 정보 없음" : "No exercise info";
  if (names.length <= 3) return names.join(", ");
  return locale === "ko"
    ? `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}개`
    : `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
}

function countWorkSets(sets: LogSet[]) {
  return sets.filter((set) => !set.isExtra).length;
}

function estimateVolumeKg(sets: LogSet[]) {
  return sets.reduce((sum, set) => {
    if (set.isExtra) return sum;
    const reps = Number(set.reps ?? 0);
    const weightKg = Number(set.weightKg ?? 0);
    if (!Number.isFinite(reps) || !Number.isFinite(weightKg) || reps <= 0 || weightKg <= 0) return sum;
    return sum + reps * weightKg;
  }, 0);
}

function shortenText(value: string | null | undefined, limit = 140) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function progressionBadgeClass(tone: ReturnType<typeof progressionTone>) {
  switch (tone) {
    case "success":
      return "label progress-medium label-sm";
    case "warning":
      return "label progress-high label-sm";
    default:
      return "label progress-low label-sm";
  }
}

function daysSince(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function formatRelativeDays(days: number | null, locale: "ko" | "en") {
  if (days === null) return locale === "ko" ? "기록 없음" : "No record";
  if (days <= 0) return locale === "ko" ? "오늘" : "Today";
  if (days === 1) return locale === "ko" ? "어제" : "Yesterday";
  if (days < 7) return locale === "ko" ? `${days}일 전` : `${days}d ago`;
  if (days < 30) return locale === "ko" ? `${Math.floor(days / 7)}주 전` : `${Math.floor(days / 7)}w ago`;
  if (days < 365) return locale === "ko" ? `${Math.floor(days / 30)}개월 전` : `${Math.floor(days / 30)}mo ago`;
  return locale === "ko" ? `${Math.floor(days / 365)}년 전` : `${Math.floor(days / 365)}y ago`;
}

function formatVolumeShort(kg: number, locale: "ko" | "en") {
  if (kg <= 0) return "-";
  if (kg >= 1000) {
    const t = kg / 1000;
    return `${t % 1 === 0 ? t.toFixed(0) : t.toFixed(1)}t`;
  }
  return locale === "ko" ? `${Math.round(kg)}kg` : `${Math.round(kg)}kg`;
}

function groupLogsByMonth(logs: LogItem[]) {
  const groups: Array<{ key: string; year: number; month: number; logs: LogItem[] }> = [];
  let current: { key: string; year: number; month: number; logs: LogItem[] } | null = null;

  for (const log of logs) {
    const date = new Date(log.performedAt);
    if (Number.isNaN(date.getTime())) continue;
    const year = date.getFullYear();
    const month = date.getMonth();
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    if (!current || current.key !== key) {
      current = { key, year, month, logs: [] };
      groups.push(current);
    }
    current.logs.push(log);
  }

  return groups;
}

function PlanTabStrip({
  plans,
  selectedPlanId,
  onSelect,
  locale,
}: {
  plans: Plan[];
  selectedPlanId: string;
  onSelect: (planId: string) => void;
  locale: "ko" | "en";
}) {
  return (
    <div className="plan-tab-strip" role="tablist" aria-label={locale === "ko" ? "플랜 선택" : "Select plan"}>
      {plans.map((plan) => {
        const days = daysSince(plan.lastPerformedAt);
        const sub = formatRelativeDays(days, locale);
        const isActive = plan.id === selectedPlanId;
        return (
          <button
            key={plan.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-active={isActive ? "true" : "false"}
            className="plan-tab-strip__item"
            onClick={() => onSelect(plan.id)}
          >
            <span className="plan-tab-strip__name">{plan.name}</span>
            <span className="plan-tab-strip__sub">{sub}</span>
          </button>
        );
      })}
    </div>
  );
}

function HistorySummaryCard({
  plan,
  loadedLogCount,
  loadedSetCount,
  loadedVolumeKg,
  locale,
}: {
  plan: Plan;
  loadedLogCount: number;
  loadedSetCount: number;
  loadedVolumeKg: number;
  locale: "ko" | "en";
}) {
  const days = daysSince(plan.lastPerformedAt);
  const recentText = formatRelativeDays(days, locale);

  return (
    <div className="history-summary">
      <div className="history-summary__cell history-summary__primary">
        <div className="history-summary__label">
          {locale === "ko" ? "선택 플랜" : "Selected Plan"}
        </div>
        <div className="history-summary__value">{plan.name}</div>
        {plan.baseProgramName ? (
          <div className="history-summary__sub">{plan.baseProgramName}</div>
        ) : null}
      </div>
      <div className="history-summary__cell">
        <div className="history-summary__label">{locale === "ko" ? "최근 수행" : "Last"}</div>
        <div className="history-summary__value">{recentText}</div>
      </div>
      <div className="history-summary__cell">
        <div className="history-summary__label">{locale === "ko" ? "로드된 로그" : "Loaded"}</div>
        <div className="history-summary__value">
          {loadedLogCount}
          <span style={{ fontSize: "11px", marginLeft: 4, color: "var(--color-text-muted)", fontWeight: 600 }}>
            {locale === "ko" ? "건" : ""}
          </span>
        </div>
      </div>
      <div className="history-summary__cell">
        <div className="history-summary__label">{locale === "ko" ? "총 볼륨" : "Volume"}</div>
        <div className="history-summary__value">{formatVolumeShort(loadedVolumeKg, locale)}</div>
        <div className="history-summary__sub">
          {locale === "ko" ? `${loadedSetCount}세트` : `${loadedSetCount} sets`}
        </div>
      </div>
    </div>
  );
}

function HistoryExpandableLogCard({
  log,
  locale,
  copy,
  onDelete,
  isDeleting,
  isExpanded,
  onToggleExpand,
}: {
  log: LogItem;
  locale: "ko" | "en";
  copy: ReturnType<typeof useLocale>["copy"];
  onDelete: () => void;
  isDeleting: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const date = new Date(log.performedAt);
  const validDate = !Number.isNaN(date.getTime());
  const day = validDate ? date.getDate() : "-";
  const monthIdx = validDate ? date.getMonth() : 0;
  const monthLabel = locale === "ko" ? MONTH_ABBR_KO[monthIdx] : MONTH_ABBR_EN[monthIdx];
  const weekdayIdx = validDate ? date.getDay() : 0;
  const weekday = locale === "ko" ? WEEKDAY_KO[weekdayIdx] : WEEKDAY_EN[weekdayIdx];
  const time = formatTimeOnly(log.performedAt);

  const workSetCount = countWorkSets(log.sets ?? []);
  const exerciseSummary = summarizeExercises(log.sets ?? [], locale);
  const volumeKg = estimateVolumeKg(log.sets ?? []);
  const noteText = shortenText(log.notes);
  const progressionText = summarizeProgression(log.progression ?? null, locale);
  const progressionBadgeTone = progressionTone(log.progression ?? null);
  const sessionLabel = log.generatedSession?.sessionKey
    ? formatSessionKeyLabel(log.generatedSession.sessionKey)
    : null;
  const duration = formatDuration(log.durationMinutes);

  return (
    <article style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={isExpanded}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px",
          background: "var(--color-surface-container-low)", border: "none", borderRadius: "20px", cursor: "pointer", textAlign: "left", width: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--color-success-weak)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--color-success)", fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-headline-family)", fontSize: "14px", fontWeight: 700, color: "var(--color-text)", display: "flex", alignItems: "center", gap: "6px" }}>
              {exerciseSummary}
              {sessionLabel ? <span className="label label-program label-sm">{sessionLabel}</span> : null}
            </div>
            <div style={{ fontFamily: "var(--font-label-family)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-muted)", marginTop: "2px" }}>
              {validDate ? `${monthLabel} ${day} · ${weekday}${time ? ` · ${time}` : ""}` : "-"}
            </div>
          </div>
        </div>
        <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--color-text-subtle)", flexShrink: 0 }}>
          {isExpanded ? "expand_less" : "chevron_right"}
        </span>
      </button>

      {isExpanded ? (
        <div style={{ background: "var(--color-surface-container-low)", borderRadius: "24px", padding: "24px" }}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
            {progressionText ? <span className={progressionBadgeClass(progressionBadgeTone)}>{progressionText}</span> : null}
          </div>
          <div className="log-card-v2__stats">
            <div className="log-card-v2__stat" data-kind="sets"><span className="log-card-v2__stat-label">{copy.plansHistory.sets}</span><span className="log-card-v2__stat-value">{workSetCount}</span></div>
            <div className="log-card-v2__stat" data-kind="time"><span className="log-card-v2__stat-label">{copy.plansHistory.time}</span><span className="log-card-v2__stat-value">{duration === null ? "-" : locale === "ko" ? `${duration}분` : `${duration}m`}</span></div>
            <div className="log-card-v2__stat" data-kind="volume"><span className="log-card-v2__stat-label">{copy.plansHistory.volume}</span><span className="log-card-v2__stat-value">{formatVolumeShort(volumeKg, locale)}</span></div>
          </div>
          {noteText ? <div className="log-card-v2__note"><span className="material-symbols-outlined" aria-hidden="true">format_quote</span><span>{noteText}</span></div> : null}
          <div className="log-card-v2__actions">
            <Link className="log-card-v2__action log-card-v2__action--primary" href={`/workout/session/${encodeURIComponent(log.id)}`}><span className="material-symbols-outlined" aria-hidden="true">fitness_center</span>{copy.plansHistory.sessionDetail}</Link>
            <button type="button" className="log-card-v2__action log-card-v2__action--danger" disabled={isDeleting} onClick={onDelete}><span className="material-symbols-outlined" aria-hidden="true">delete</span>{isDeleting ? copy.plansHistory.deleting : copy.plansHistory.deleteHistory}</button>
          </div>
        </div>
      ) : null}
    </article>
  );

}

function PlanHistoryPageContent() {
  const { copy, locale } = useLocale();
  const { alert, confirm } = useAppDialog();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPlanId = searchParams.get("planId")?.trim() ?? "";

  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);

  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsLoadingMore, setLogsLoadingMore] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [refreshTick] = useState(0);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [logQuery, setLogQuery] = useState("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  const plansLoadedRef = useRef(false);

  const loadPlans = useCallback(async (options?: { isRefresh?: boolean }) => {
    try {
      if (!plansLoadedRef.current && !options?.isRefresh) setPlansLoading(true);
      setPlansError(null);
      const res = await apiGet<{ items: Plan[] }>("/api/plans", { cachePolicy: "network-only" });
      plansLoadedRef.current = true;
      setPlans(res.items ?? []);
    } catch (e: any) {
      setPlansError(e?.message ?? (locale === "ko" ? "플랜 목록을 불러오지 못했습니다." : "Could not load plans."));
    } finally {
      setPlansLoading(false);
    }
  }, [locale]);

  const loadLogs = useCallback(async (planId: string, cursor?: string | null, append = false, silent = false) => {
    if (!planId) {
      setLogs([]);
      setNextCursor(null);
      return;
    }

    try {
      if (!silent) {
        if (append) {
          setLogsLoadingMore(true);
        } else {
          setLogsLoading(true);
        }
      }
      setLogsError(null);

      const sp = new URLSearchParams();
      sp.set("planId", planId);
      sp.set("limit", "12");
      if (cursor) sp.set("cursor", cursor);

      const res = await apiGet<LogsResponse>(`/api/logs?${sp.toString()}`, {
        cachePolicy: "network-only",
      });

      setLogs((prev) => {
        if (!append) return res.items ?? [];
        const seen = new Set(prev.map((item) => item.id));
        const incoming = (res.items ?? []).filter((item) => !seen.has(item.id));
        return [...prev, ...incoming];
      });
      setNextCursor(res.nextCursor ?? null);
    } catch (e: any) {
      setLogsError(e?.message ?? (locale === "ko" ? "수행 로그를 불러오지 못했습니다." : "Could not load workout logs."));
      if (!append) {
        setLogs([]);
        setNextCursor(null);
      }
    } finally {
      setLogsLoading(false);
      setLogsLoadingMore(false);
    }
  }, [locale]);

  useEffect(() => {
    void loadPlans({ isRefresh: refreshTick > 0 });
  }, [loadPlans, refreshTick]);

  useEffect(() => {
    if (plans.length === 0) {
      setSelectedPlanId("");
      return;
    }

    if (requestedPlanId && plans.some((plan) => plan.id === requestedPlanId)) {
      setSelectedPlanId((prev) => (prev === requestedPlanId ? prev : requestedPlanId));
      return;
    }

    if (selectedPlanId && plans.some((plan) => plan.id === selectedPlanId)) {
      return;
    }

    setSelectedPlanId(plans[0]?.id ?? "");
  }, [plans, requestedPlanId, selectedPlanId]);

  useEffect(() => {
    const currentQueryPlanId = searchParams.get("planId")?.trim() ?? "";
    const nextHref = selectedPlanId
      ? `${APP_ROUTES.plansHistory}?planId=${encodeURIComponent(selectedPlanId)}`
      : APP_ROUTES.plansHistory;
    if (selectedPlanId !== currentQueryPlanId) {
      router.replace(nextHref, { scroll: false });
    }
  }, [router, searchParams, selectedPlanId]);

  useEffect(() => {
    if (!selectedPlanId) {
      setLogs([]);
      setNextCursor(null);
      return;
    }
    setLogs([]);
    setNextCursor(null);
    setExpandedLogId(null);
    void loadLogs(selectedPlanId, null, false);
  }, [loadLogs, selectedPlanId, refreshTick]);

  const loadedLogCount = logs.length;
  const loadedSetCount = useMemo(
    () => logs.reduce((sum, log) => sum + countWorkSets(log.sets ?? []), 0),
    [logs],
  );
  const loadedVolumeKg = useMemo(
    () => logs.reduce((sum, log) => sum + estimateVolumeKg(log.sets ?? []), 0),
    [logs],
  );
  const filteredLogs = useMemo(() => {
    const q = logQuery.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((log) => {
      const note = String(log.notes ?? "").toLowerCase();
      const ex = (log.sets ?? []).map((set) => String(set.exerciseName ?? "").toLowerCase()).join(" ");
      return `${note} ${ex}`.includes(q);
    });
  }, [logQuery, logs]);
  const groupedLogs = useMemo(() => groupLogsByMonth(filteredLogs), [filteredLogs]);

  async function deleteLog(log: LogItem) {
    const ok = await confirm({
      title: locale === "ko" ? "히스토리 삭제" : "Delete History",
      message:
        locale === "ko"
          ? `이 수행 로그를 삭제하시겠습니까?\n${formatDateTime(log.performedAt)}\n삭제 후 자동 진행 상태도 남은 로그 기준으로 다시 계산됩니다.`
          : `Delete this workout log?\n${formatDateTime(log.performedAt)}\nAuto progression will be recalculated from the remaining logs afterward.`,
      confirmText: locale === "ko" ? "삭제" : "Delete",
      cancelText: locale === "ko" ? "취소" : "Cancel",
      tone: "danger",
    });
    if (!ok) return;

    try {
      setDeletingLogId(log.id);
      setLogsError(null);

      setLogs((prev) => prev.filter((item) => item.id !== log.id));

      await apiDelete<{ deleted: boolean }>(`/api/logs/${encodeURIComponent(log.id)}`);
      await Promise.all([
        loadPlans({ isRefresh: true }),
        selectedPlanId ? loadLogs(selectedPlanId, null, false, true) : Promise.resolve(),
      ]);
      await alert({
        title: locale === "ko" ? "삭제 완료" : "Deleted",
        message: locale === "ko" ? "수행 로그가 삭제되었습니다." : "The workout log was deleted.",
        buttonText: locale === "ko" ? "확인" : "OK",
      });
    } catch (e: any) {
      if (selectedPlanId) void loadLogs(selectedPlanId, null, false, true);
      const message = e?.message ?? (locale === "ko" ? "수행 로그 삭제에 실패했습니다." : "Failed to delete the workout log.");
      setLogsError(message);
      await alert({
        title: locale === "ko" ? "삭제 실패" : "Delete Failed",
        message,
        buttonText: locale === "ko" ? "확인" : "OK",
        tone: "danger",
      });
    } finally {
      setDeletingLogId(null);
    }
  }

  return (
    <>
      <section>
        <div className="plans-hero" style={{ marginBottom: "var(--space-md)" }}>
          <div className="plans-hero__eyebrow">{copy.plansHistory.headerEyebrow}</div>
          <h1 className="plans-hero__title">{copy.plansHistory.title}</h1>
          <p className="plans-hero__description">{copy.plansHistory.description}</p>
        </div>

        <ErrorStateRows
          message={plansError}
          title={copy.plansHistory.plansLoadError}
          onRetry={() => {
            void loadPlans();
          }}
        />
        <EmptyStateRows
          when={!plansLoading && !plansError && plans.length === 0}
          label={copy.plansHistory.noPlans}
          description={copy.plansHistory.noPlansDescription}
        />
        <LoadingStateRows active={plansLoading && !plansLoadedRef.current} label={locale === "ko" ? "플랜 로딩 중" : "Loading plans"} />

        {plans.length > 0 ? (
          <PlanTabStrip
            plans={plans}
            selectedPlanId={selectedPlanId}
            onSelect={setSelectedPlanId}
            locale={locale}
          />
        ) : null}

        {selectedPlan ? (
          <HistorySummaryCard
            plan={selectedPlan}
            loadedLogCount={loadedLogCount}
            loadedSetCount={loadedSetCount}
            loadedVolumeKg={loadedVolumeKg}
            locale={locale}
          />
        ) : null}
      </section>

      <section style={{ marginTop: "var(--space-lg)" }}>
        <div style={{ marginBottom: "var(--space-md)" }}>
          <SearchInput
            value={logQuery}
            onChange={setLogQuery}
            placeholder={locale === "ko" ? "운동명/메모 검색" : "Search exercises/notes"}
            ariaLabel={locale === "ko" ? "히스토리 검색" : "Search history"}
          />
        </div>
        <ErrorStateRows
          message={logsError}
          title={copy.plansHistory.logsLoadError}
          onRetry={() => {
            if (!selectedPlanId) return;
            void loadLogs(selectedPlanId, null, false);
          }}
        />
        <LoadingStateRows active={logsLoading} label={locale === "ko" ? "로그 불러오는 중" : "Loading logs"} />
        <EmptyStateRows
          when={Boolean(selectedPlanId) && !logsLoading && !logsError && filteredLogs.length === 0}
          label={copy.plansHistory.noLogs}
          description={copy.plansHistory.noLogsDescription}
        />

        {groupedLogs.length > 0 ? (
          <div className="log-timeline">
            {groupedLogs.map((group) => {
              const monthLabel = locale === "ko"
                ? `${group.year} · ${MONTH_ABBR_KO[group.month]}`
                : `${MONTH_ABBR_EN[group.month]} ${group.year}`;
              return (
                <div key={group.key}>
                  <div className="log-timeline__group-label">{monthLabel}</div>
                  <div className="log-timeline__list">
                    {group.logs.map((log) => (
                      <HistoryExpandableLogCard
                        key={log.id}
                        log={log}
                        locale={locale}
                        copy={copy}
                        isDeleting={deletingLogId === log.id}
                        onDelete={() => {
                          void deleteLog(log);
                        }}
                        isExpanded={expandedLogId === log.id}
                        onToggleExpand={() => setExpandedLogId((prev) => (prev === log.id ? null : log.id))}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {nextCursor ? (
              <button
                type="button"
                className="btn btn-secondary btn-full"
                disabled={logsLoadingMore}
                onClick={() => {
                  if (!selectedPlanId || !nextCursor) return;
                  void loadLogs(selectedPlanId, nextCursor, true);
                }}
              >
                {logsLoadingMore ? copy.plansHistory.loadingMore : copy.plansHistory.loadMore}
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}

export default function PlanHistoryPage() {
  return (
    <Suspense fallback={null}>
      <PlanHistoryPageContent />
    </Suspense>
  );
}
