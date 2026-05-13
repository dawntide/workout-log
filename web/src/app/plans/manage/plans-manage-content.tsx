"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/locale-provider";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { AppTextInput } from "@/components/ui/form-controls";
import { NumberPickerField } from "@/components/ui/number-picker-sheet";
import { V2PrimaryBtn, V2SecondaryBtn } from "@/components/v2/primitives";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyStateRows, ErrorStateRows, LoadingStateRows } from "@/components/ui/settings-state";
import { apiDelete, apiGet, apiPatch } from "@/lib/api";
import { useQuerySettled } from "@/lib/ui/use-query-settled";
import { APP_ROUTES } from "@/lib/app-routes";
import type { PlanForManage } from "@/server/services/plans/get-plans-for-manage";

// PERF: SSR로 주입된 initialPlans로 첫 화면 즉시 렌더 (스피너 없음).

type Plan = PlanForManage;
type StrengthBaselineDraft = Record<string, { oneRepMaxKg: number; trainingMaxKg: number }>;

const TARGET_LABELS: Record<string, string> = {
  SQUAT: "Squat",
  BENCH: "Bench",
  DEADLIFT: "Deadlift",
  OHP: "OHP",
  PULL: "Pull",
};

const TARGET_PRIORITY = ["SQUAT", "BENCH", "DEADLIFT", "OHP", "PULL"];
const RECENT_THRESHOLD_DAYS = 7;

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readPositiveNumberMap(value: unknown) {
  const source = toRecord(value);
  const next: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = rawKey.trim().toUpperCase();
    const parsed = Number(rawValue);
    if (!key || !Number.isFinite(parsed) || parsed <= 0) continue;
    next[key] = Math.round(parsed * 100) / 100;
  }
  return next;
}

function createStrengthBaselineDraft(params: unknown): StrengthBaselineDraft {
  const source = toRecord(params);
  const oneRepMaxKg = readPositiveNumberMap(source.oneRepMaxKg);
  const trainingMaxKg = readPositiveNumberMap(source.trainingMaxKg);
  const keys = Array.from(new Set([...Object.keys(oneRepMaxKg), ...Object.keys(trainingMaxKg)])).sort();

  const next: StrengthBaselineDraft = {};
  for (const key of keys) {
    next[key] = {
      oneRepMaxKg: oneRepMaxKg[key] ?? 0,
      trainingMaxKg: trainingMaxKg[key] ?? 0,
    };
  }
  return next;
}

function targetLabelFromKey(key: string) {
  if (TARGET_LABELS[key]) return TARGET_LABELS[key];
  if (key.startsWith("EX_")) {
    return key
      .slice(3)
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(" ");
  }
  return key;
}

function shortTargetLabel(key: string) {
  if (key === "DEADLIFT") return "DL";
  if (TARGET_LABELS[key]) return TARGET_LABELS[key];
  return targetLabelFromKey(key);
}

function formatKg(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function planWithPatchedFields(prevPlan: Plan, updatedPlan: Plan): Plan {
  return {
    ...prevPlan,
    ...updatedPlan,
    baseProgramName: updatedPlan.baseProgramName ?? prevPlan.baseProgramName,
    lastPerformedAt: updatedPlan.lastPerformedAt ?? prevPlan.lastPerformedAt,
  };
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function daysSince(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function formatRelativeDays(days: number | null, locale: "ko" | "en") {
  if (days === null) return null;
  if (days <= 0) return locale === "ko" ? "오늘" : "Today";
  if (days === 1) return locale === "ko" ? "어제" : "Yesterday";
  if (days < 7) return locale === "ko" ? `${days}일 전` : `${days}d ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return locale === "ko" ? `${w}주 전` : `${w}w ago`;
  }
  if (days < 365) {
    const m = Math.floor(days / 30);
    return locale === "ko" ? `${m}개월 전` : `${m}mo ago`;
  }
  const y = Math.floor(days / 365);
  return locale === "ko" ? `${y}년 전` : `${y}y ago`;
}

function normalizeSearchText(...values: Array<string | null | undefined>) {
  return values
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function readTrainingMaxPreview(params: unknown) {
  const source = toRecord(params);
  const tm = readPositiveNumberMap(source.trainingMaxKg);
  const orm = readPositiveNumberMap(source.oneRepMaxKg);
  const keys = Object.keys({ ...tm, ...orm });
  if (keys.length === 0) return [] as Array<{ key: string; label: string; valueKg: number; kind: "TM" | "1RM" }>;

  const sorted = keys.sort((a, b) => {
    const ai = TARGET_PRIORITY.indexOf(a);
    const bi = TARGET_PRIORITY.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return sorted
    .map((key) => {
      const valueKg = tm[key] ?? orm[key] ?? 0;
      if (valueKg <= 0) return null;
      return {
        key,
        label: shortTargetLabel(key),
        valueKg,
        kind: tm[key] ? ("TM" as const) : ("1RM" as const),
      };
    })
    .filter((v): v is { key: string; label: string; valueKg: number; kind: "TM" | "1RM" } => v !== null);
}

function planTypeTone(type: Plan["type"]): "program" | "composite" | "manual" {
  if (type === "COMPOSITE") return "composite";
  if (type === "MANUAL") return "manual";
  return "program";
}

function planTypeLabel(type: Plan["type"], locale: "ko" | "en") {
  if (type === "COMPOSITE") return locale === "ko" ? "복합" : "Composite";
  if (type === "MANUAL") return locale === "ko" ? "수동" : "Manual";
  return locale === "ko" ? "프로그램" : "Program";
}

function PlanCardV2({
  plan,
  onManage,
  copy,
  locale,
}: {
  plan: Plan;
  onManage: () => void;
  copy: ReturnType<typeof useLocale>["copy"];
  locale: "ko" | "en";
}) {
  const days = daysSince(plan.lastPerformedAt);
  const relText = formatRelativeDays(days, locale);
  const isFresh = typeof days === "number" && days <= RECENT_THRESHOLD_DAYS;
  const tmPreview = readTrainingMaxPreview(plan.params).slice(0, 4);
  const tone = planTypeTone(plan.type);
  const typeText = planTypeLabel(plan.type, locale);

  return (
    <article className="plan-card-v2">
      <div className="plan-card-v2__head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="plan-card-v2__chips">
            <span className="plan-card-v2__type-pill" data-tone={tone}>
              {typeText}
            </span>
            {isFresh ? (
              <span className="plan-card-v2__type-pill" data-tone="composite">
                {locale === "ko" ? "최근 수행" : "Recent"}
              </span>
            ) : null}
          </div>
          <h3 className="plan-card-v2__name">{plan.name}</h3>
          {plan.baseProgramName ? (
            <div className="plan-card-v2__subhead">{plan.baseProgramName}</div>
          ) : null}
          <div className={`plan-card-v2__meta${isFresh ? " plan-card-v2__meta--fresh" : ""}`}>
            <span className="plan-card-v2__meta-dot" aria-hidden="true" />
            {relText
              ? `${copy.plansManage.recentPerformedPrefix} · ${relText}`
              : copy.plansManage.noPerformedHistory}
          </div>
        </div>
      </div>

      {tmPreview.length > 0 ? (
        <div className="plan-card-v2__tm-grid">
          {tmPreview.map((row) => (
            <div key={row.key} className="plan-card-v2__tm-cell">
              <span className="plan-card-v2__tm-label">
                {row.label} · {row.kind}
              </span>
              <span className="plan-card-v2__tm-value">{formatKg(row.valueKg)}kg</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="plan-card-v2__tm-empty">
          {locale === "ko" ? "1RM/TM 미설정 — 관리에서 입력하세요." : "1RM/TM not set — open Manage to enter."}
        </div>
      )}

      <div className="plan-card-v2__actions">
        <button
          type="button"
          className="plan-card-v2__action plan-card-v2__action--manage"
          onClick={onManage}
          aria-label={`${plan.name} ${copy.plansManage.manage}`}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            tune
          </span>
          {copy.plansManage.manage}
        </button>
      </div>
    </article>
  );
}

export function PlansManageContent({ initialPlans }: { initialPlans: Plan[] }) {
  const { copy, locale } = useLocale();
  const { alert, confirm } = useAppDialog();
  const [plans, setPlans] = useState<Plan[]>(initialPlans);
  const [loading, setLoading] = useState(false);
  const [loadKey, setLoadKey] = useState("plans-manage:load:init");
  const [error, setError] = useState<string | null>(null);
  const [refreshTick] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState<"ALL" | "RECENT" | "IDLE">("ALL");
  const storeHasLoadedRef = useRef(initialPlans.length > 0);

  const [managePlanId, setManagePlanId] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [strengthDraft, setStrengthDraft] = useState<StrengthBaselineDraft>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const managedPlan = useMemo(
    () => plans.find((item) => item.id === managePlanId) ?? null,
    [managePlanId, plans],
  );
  const strengthRows = useMemo(
    () =>
      Object.entries(strengthDraft).map(([key, value]) => ({
        key,
        label: targetLabelFromKey(key),
        oneRepMaxKg: value.oneRepMaxKg,
        trainingMaxKg: value.trainingMaxKg,
      })),
    [strengthDraft],
  );
  const isSettled = useQuerySettled(loadKey, loading);
  const filteredPlans = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return plans.filter((plan) => {
      const days = daysSince(plan.lastPerformedAt);
      const activityMatched = activityFilter === "ALL"
        || (activityFilter === "RECENT" && typeof days === "number" && days <= RECENT_THRESHOLD_DAYS)
        || (activityFilter === "IDLE" && days === null);
      if (!activityMatched) return false;
      if (!normalizedQuery) return true;
      return normalizeSearchText(plan.name, plan.baseProgramName, plan.type).includes(normalizedQuery);
    });
  }, [activityFilter, plans, searchQuery]);

  const heroMetrics = useMemo(() => {
    const total = plans.length;
    let recent = 0;
    let untouched = 0;
    for (const plan of plans) {
      const days = daysSince(plan.lastPerformedAt);
      if (days === null) {
        untouched += 1;
      } else if (days <= RECENT_THRESHOLD_DAYS) {
        recent += 1;
      }
    }
    return { total, recent, untouched };
  }, [plans]);

  const loadPlans = useCallback(async (options?: { isRefresh?: boolean }) => {
    try {
      if (!storeHasLoadedRef.current && !options?.isRefresh) setLoading(true);
      setLoadKey(`plans-manage:load:${Date.now()}`);
      setError(null);
      const res = await apiGet<{ items: Plan[] }>("/api/plans");
      storeHasLoadedRef.current = true;
      setPlans(res.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "플랜 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (refreshTick > 0) {
      void loadPlans({ isRefresh: true });
    }
  }, [loadPlans, refreshTick]);

  useEffect(() => {
    if (!managePlanId) return;
    if (plans.some((item) => item.id === managePlanId)) return;
    setManagePlanId("");
    setSaving(false);
    setDeleting(false);
  }, [managePlanId, plans]);

  function openManageSheet(plan: Plan) {
    setError(null);
    setNameDraft(plan.name);
    setStrengthDraft(createStrengthBaselineDraft(plan.params));
    setManagePlanId(plan.id);
  }

  async function savePlanChanges() {
    if (!managedPlan) return;
    const nextName = nameDraft.trim();
    if (!nextName) {
      await alert({
        title: "입력 확인 필요",
        message: "플랜 이름은 비워둘 수 없습니다.",
        buttonText: "확인",
        tone: "danger",
      });
      return;
    }

    const oneRepMaxKg: Record<string, number> = {};
    const trainingMaxKg: Record<string, number> = {};
    for (const row of strengthRows) {
      if (row.oneRepMaxKg <= 0 && row.trainingMaxKg <= 0) {
        await alert({
          title: "입력 확인 필요",
          message: `${row.label}의 1RM 또는 TM을 kg 기준으로 입력하세요.`,
          buttonText: "확인",
          tone: "danger",
        });
        return;
      }
      if (row.oneRepMaxKg > 0) oneRepMaxKg[row.key] = row.oneRepMaxKg;
      if (row.trainingMaxKg > 0) trainingMaxKg[row.key] = row.trainingMaxKg;
    }

    const prevPlan = managedPlan;
    const nextParams = {
      ...toRecord(managedPlan.params),
      oneRepMaxKg,
      trainingMaxKg,
    };

    try {
      setSaving(true);
      setError(null);

      setPlans((prev) =>
        prev.map((item) =>
          item.id === managedPlan.id ? { ...item, name: nextName, params: nextParams } : item,
        ),
      );

      const res = await apiPatch<{ plan: Plan }>(`/api/plans/${encodeURIComponent(managedPlan.id)}`, {
        name: nextName,
        params: nextParams,
      });
      setPlans((prev) =>
        prev.map((item) =>
          item.id === managedPlan.id ? planWithPatchedFields(item, res.plan) : item,
        ),
      );
      setManagePlanId("");
      await alert({
        title: "수정 완료",
        message: `플랜 정보가 변경되었습니다.\n${res.plan.name}`,
        buttonText: "확인",
      });
    } catch (e: any) {
      if (managedPlan) {
        setPlans((prev) => prev.map((item) => (item.id === managedPlan.id ? prevPlan : item)));
      }
      const message = e?.message ?? "플랜 정보 수정에 실패했습니다.";
      setError(message);
      await alert({
        title: "수정 실패",
        message,
        buttonText: "확인",
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deletePlan() {
    if (!managedPlan) return;
    const ok = await confirm({
      title: "플랜 삭제",
      message: `'${managedPlan.name}' 플랜을 삭제하시겠습니까?\n생성된 세션/진행 상태가 함께 정리됩니다.`,
      confirmText: "삭제",
      cancelText: "취소",
      tone: "danger",
    });
    if (!ok) return;

    try {
      setDeleting(true);
      setError(null);

      const targetId = managedPlan.id;
      setManagePlanId("");
      setPlans((prev) => prev.filter((item) => item.id !== targetId));

      await apiDelete<{ deleted: boolean; planId: string }>(
        `/api/plans/${encodeURIComponent(targetId)}`,
      );
      await alert({
        title: "삭제 완료",
        message: `플랜이 삭제되었습니다.\n${managedPlan.name}`,
        buttonText: "확인",
      });
    } catch (e: any) {
      void loadPlans({ isRefresh: true });
      const message = e?.message ?? "플랜 삭제에 실패했습니다.";
      setError(message);
      await alert({
        title: "삭제 실패",
        message,
        buttonText: "확인",
        tone: "danger",
      });
    } finally {
      setDeleting(false);
    }
  }

  const heroDescription = locale === "ko"
    ? "활성 플랜을 한눈에 보고, 1RM/TM·이름·삭제를 빠르게 정리하세요."
    : "Browse active plans and quickly tune 1RM/TM, names, or remove obsolete ones.";
  const totalLabel = locale === "ko" ? "총 플랜" : "Total Plans";
  const recentLabel = locale === "ko" ? "최근 7일 수행" : "Active 7d";
  const idleLabel = locale === "ko" ? "미수행" : "Unused";
  const browseStoreLabel = locale === "ko" ? "프로그램 스토어 둘러보기" : "Browse Program Store";

  return (
    <>
      <section>
        <div className="plans-hero">
          <div className="plans-hero__eyebrow">{copy.plansManage.headerEyebrow}</div>
          <h1 className="plans-hero__title">{copy.plansManage.title}</h1>
          <p className="plans-hero__description">{heroDescription}</p>

          <div className="plans-hero__metrics" role="list">
            <div className="plans-hero__metric" role="listitem">
              <div className="plans-hero__metric-label">{totalLabel}</div>
              <div className="plans-hero__metric-value">
                {heroMetrics.total}
                <span className="plans-hero__metric-suffix">
                  {locale === "ko" ? "개" : ""}
                </span>
              </div>
            </div>
            <div className="plans-hero__metric" role="listitem">
              <div className="plans-hero__metric-label">{recentLabel}</div>
              <div className="plans-hero__metric-value">
                {heroMetrics.recent}
                <span className="plans-hero__metric-suffix">
                  {locale === "ko" ? "개" : ""}
                </span>
              </div>
            </div>
            <div className="plans-hero__metric" role="listitem">
              <div className="plans-hero__metric-label">{idleLabel}</div>
              <div className="plans-hero__metric-value">
                {heroMetrics.untouched}
                <span className="plans-hero__metric-suffix">
                  {locale === "ko" ? "개" : ""}
                </span>
              </div>
            </div>
          </div>

          <Link href={APP_ROUTES.programStore} className="plans-hero__cta">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">
              add
            </span>
            {browseStoreLabel}
          </Link>
        </div>
      </section>

      <section>
        {plans.length > 0 || searchQuery.trim().length > 0 ? (
          <>
            <div className="plans-filter-tabs" role="tablist" aria-label={locale === "ko" ? "플랜 필터" : "Plan filter"}>
            {[
              { key: "ALL", label: locale === "ko" ? "전체" : "All", count: heroMetrics.total },
              { key: "RECENT", label: locale === "ko" ? "최근 수행" : "Recent", count: heroMetrics.recent },
              { key: "IDLE", label: locale === "ko" ? "미수행" : "Idle", count: heroMetrics.untouched },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={activityFilter === item.key}
                className="plans-filter-tab"
                data-active={activityFilter === item.key ? "true" : "false"}
                onClick={() => setActivityFilter(item.key as "ALL" | "RECENT" | "IDLE")}
              >
                <span>{item.label}</span><strong>{item.count}</strong>
              </button>
            ))}
          </div>

            <div style={{ marginBottom: "var(--v2-s-4)" }}>
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={copy.plansManage.searchPlaceholder}
              ariaLabel={copy.plansManage.searchAriaLabel}
            />
            </div>
          </>
        ) : null}

        <LoadingStateRows active={loading} label={locale === "ko" ? "플랜 목록 로딩 중" : "Loading plans"} />
        <ErrorStateRows
          message={error}
          title={copy.plansManage.loadError}
          onRetry={() => {
            void loadPlans();
          }}
        />
        <EmptyStateRows
          when={isSettled && !error && plans.length === 0}
          label={copy.plansManage.noPlans}
          description={copy.plansManage.noPlansDescription}
        />
        <EmptyStateRows
          when={isSettled && !error && plans.length > 0 && filteredPlans.length === 0}
          label={copy.plansManage.noResults}
          description={copy.plansManage.noResultsDescription}
        />

        {filteredPlans.length > 0 ? (
          <div className="plan-manage-sheet__stack">
            {filteredPlans.map((plan) => (
              <PlanCardV2
                key={plan.id}
                plan={plan}
                copy={copy}
                locale={locale}
                onManage={() => openManageSheet(plan)}
              />
            ))}
          </div>
        ) : null}
      </section>

      <BottomSheet
        open={Boolean(managePlanId)}
        onClose={() => {
          if (saving || deleting) return;
          setManagePlanId("");
        }}
        title={copy.plansManage.detailTitle}
        description={copy.plansManage.detailDescription}
        closeLabel={copy.plansManage.close}
      >
        {managedPlan ? (
          <div className="plan-manage-sheet">
            <div className="stat-tile-grid">
              <div className="stat-tile">
                <div className="stat-tile__label">
                  {locale === "ko" ? "타입" : "Type"}
                </div>
                <div className="stat-tile__value">
                  {planTypeLabel(managedPlan.type, locale)}
                </div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile__label">{copy.plansManage.baseProgram}</div>
                <div className="stat-tile__value">{managedPlan.baseProgramName ?? "-"}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile__label">{copy.plansManage.createdAt}</div>
                <div className="stat-tile__value">{formatDateTime(managedPlan.createdAt)}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile__label">{copy.plansManage.lastPerformedAt}</div>
                <div className="stat-tile__value">
                  {managedPlan.lastPerformedAt
                    ? formatDateTime(managedPlan.lastPerformedAt)
                    : copy.plansManage.noRecord}
                </div>
              </div>
            </div>

            <label className="plan-manage-sheet__field">
              <span className="plan-manage-sheet__label">
                {copy.plansManage.planName}
              </span>
              <AppTextInput
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder={copy.plansManage.planNamePlaceholder}
              />
            </label>

            <div className="plan-manage-sheet__field">
              <span className="plan-manage-sheet__label">
                {copy.plansManage.strengthBaselines}
              </span>
              {strengthRows.length > 0 ? (
                <div className="plan-manage-sheet__stack">
                  {strengthRows.map((row) => (
                    <div key={row.key} className="tm-edit-row">
                      <strong className="tm-edit-row__label">{row.label}</strong>
                      <div className="tm-edit-row__field">
                        <span className="tm-edit-row__field-label">{copy.plansManage.oneRepMax}</span>
                        <NumberPickerField
                          label={`${row.label} ${copy.plansManage.oneRepMax}`}
                          value={row.oneRepMaxKg}
                          min={0}
                          max={500}
                          step={0.5}
                          unit="kg"
                          formatValue={formatKg}
                          onChange={(value) => {
                            setStrengthDraft((prev) => ({
                              ...prev,
                              [row.key]: {
                                ...(prev[row.key] ?? { oneRepMaxKg: 0, trainingMaxKg: 0 }),
                                oneRepMaxKg: value,
                              },
                            }));
                          }}
                        />
                      </div>
                      <div className="tm-edit-row__field">
                        <span className="tm-edit-row__field-label">{copy.plansManage.trainingMax}</span>
                        <NumberPickerField
                          label={`${row.label} ${copy.plansManage.trainingMax}`}
                          value={row.trainingMaxKg}
                          min={0}
                          max={500}
                          step={0.5}
                          unit="kg"
                          formatValue={formatKg}
                          onChange={(value) => {
                            setStrengthDraft((prev) => ({
                              ...prev,
                              [row.key]: {
                                ...(prev[row.key] ?? { oneRepMaxKg: 0, trainingMaxKg: 0 }),
                                trainingMaxKg: value,
                              },
                            }));
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="plan-manage-sheet__empty">
                  {copy.plansManage.noStrengthBaselines}
                </div>
              )}
            </div>

            <div className="plan-manage-sheet__stack">
              <V2PrimaryBtn
                full
                disabled={saving || deleting}
                onClick={() => {
                  void savePlanChanges();
                }}
              >
                {saving
                  ? copy.plansManage.saveInProgress
                  : copy.plansManage.saveChanges}
              </V2PrimaryBtn>
              <V2SecondaryBtn
                full
                tone="danger"
                icon="delete"
                disabled={saving || deleting}
                onClick={() => {
                  void deletePlan();
                }}
              >
                {deleting
                  ? copy.plansManage.deleteInProgress
                  : copy.plansManage.deletePlan}
              </V2SecondaryBtn>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: "var(--v2-paper)",
              borderRadius: "12px",
              padding: "var(--v2-s-4)",
              color: "var(--v2-ink-2)",
              fontSize: "14px",
            }}
          >
            {copy.plansManage.notFound}
          </div>
        )}
      </BottomSheet>
    </>
  );
}
