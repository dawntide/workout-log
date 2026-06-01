"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/locale-provider";

import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { AppTextInput } from "@/components/ui/form-controls";
import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import {
  V2Card,
  V2Chip,
  V2EmptyState,
  V2Hairline,
  V2MetricCard,
  V2PrimaryBtn,
  V2SecondaryBtn,
  V2Segmented,
  V2Stack,
} from "@/components/v2/primitives";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyStateRows, ErrorStateRows, LoadingStateRows } from "@/components/ui/settings-state";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { useQuerySettled } from "@/lib/ui/use-query-settled";
import { APP_ROUTES } from "@/lib/app-routes";
import {
  familyFallbackKeyForBaselineKey,
  selectDisplayStrengthBaselineKeys,
} from "@/lib/program-store/model";
import { TargetWeightChip } from "@/features/progression/ui/target-weight-chip";
import type { PlanForManage } from "@/server/services/plans/get-plans-for-manage";

// PERF: SSR로 주입된 initialPlans로 첫 화면 즉시 렌더 (스피너 없음).

type Plan = PlanForManage;
type StrengthBaselineDraft = Record<string, { oneRepMaxKg: number; trainingMaxKg: number }>;

type IncrementDraftEntry = {
  increaseKg: number;
  decreaseKg: number;
  defaultIncreaseKg: number;
  defaultResetFactor: number;
  workKg: number;
};
type IncrementDraft = Record<string, IncrementDraftEntry>;

type TargetLastEvent = {
  lastDeltaKg: number | null;
  lastEventType: "INCREASE" | "HOLD" | "RESET" | null;
};

type ProgressionStateApiResponse = {
  program: string | null;
  state: {
    cycle: number;
    week: number;
    day: number;
    targets: Record<string, { workKg: number; progressionTarget?: string; failureStreak: number; successStreak: number }>;
  } | null;
  effectiveRules?: Record<
    string,
    {
      progressionTarget: string;
      increaseKg: number;
      decreaseKg: number | null;
      resetFactor: number;
      defaultIncreaseKg: number;
      defaultResetFactor: number;
    }
  >;
  targetsLastEvent?: Record<string, TargetLastEvent>;
};

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
  const allKeys = Array.from(new Set([...Object.keys(oneRepMaxKg), ...Object.keys(trainingMaxKg)]));
  // per-exercise(EX_) 키와 짝을 이루는 family canonical 키(예: EX_BENCH_PRESS ↔ BENCH)는
  // 같은 운동의 중복 행이므로 표시에서 접는다. baseline 값 자체는 저장 시 fallbackKey로 동기화해 보존.
  const keys = selectDisplayStrengthBaselineKeys(allKeys).sort();

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
  const allKeys = Object.keys({ ...tm, ...orm });
  if (allKeys.length === 0) return [] as Array<{ key: string; label: string; valueKg: number; kind: "TM" | "1RM" }>;
  // 상세(createStrengthBaselineDraft)와 동일하게 per-exercise(EX_) 키와 짝인 family canonical 키를 접어
  // 카드 미리보기에서 "Squat"와 "Back Squat"가 동시에 보이는 중복을 막는다.
  const keys = selectDisplayStrengthBaselineKeys(allKeys);

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

function planTypeChipTone(type: Plan["type"]) {
  if (type === "COMPOSITE") return "info" as const;
  if (type === "MANUAL") return "neutral" as const;
  return "accent" as const;
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
  const typeText = planTypeLabel(plan.type, locale);
  const typeTone = planTypeChipTone(plan.type);

  return (
    <V2Card tone="paper" padding="var(--v2-s-5)">
      <V2Stack gap={4}>
        <V2Stack gap={2}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--v2-s-1)",
            }}
          >
            <V2Chip tone={typeTone}>{typeText}</V2Chip>
            {isFresh ? (
              <V2Chip tone="success" icon="bolt">
                {locale === "ko" ? "최근 수행" : "Recent"}
              </V2Chip>
            ) : null}
          </div>
          <h3
            className="v2-h3"
            style={{ margin: 0, color: "var(--v2-ink)" }}
          >
            {plan.name}
          </h3>
          {plan.baseProgramName ? (
            <p
              className="v2-small"
              style={{ margin: 0, color: "var(--v2-ink-2)" }}
            >
              {plan.baseProgramName}
            </p>
          ) : null}
          <p
            className="v2-small"
            style={{
              margin: 0,
              color: isFresh ? "var(--v2-c-success)" : "var(--v2-ink-3)",
            }}
          >
            {relText
              ? `${copy.plansManage.recentPerformedPrefix} · ${relText}`
              : copy.plansManage.noPerformedHistory}
          </p>
        </V2Stack>

        {tmPreview.length > 0 ? (
          <V2Card tone="inset" padding="var(--v2-s-3)" radius="var(--v2-r-2)">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
                gap: "var(--v2-s-2)",
              }}
            >
              {tmPreview.map((row) => (
                <div
                  key={row.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--v2-s-1)",
                    padding: "var(--v2-s-2) var(--v2-s-3)",
                    background: "var(--v2-paper)",
                    borderRadius: "var(--v2-r-1)",
                    minWidth: 0,
                  }}
                >
                  <span
                    className="v2-eyebrow"
                    style={{ color: "var(--v2-ink-3)" }}
                  >
                    {row.label} · {row.kind}
                  </span>
                  <span
                    className="v2-num-sm"
                    style={{ color: "var(--v2-c-weight)" }}
                  >
                    {formatKg(row.valueKg)}
                    <span
                      className="v2-small"
                      style={{ color: "var(--v2-ink-3)", marginLeft: "var(--v2-s-1)" }}
                    >
                      kg
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </V2Card>
        ) : (
          <V2Card tone="inset" padding="var(--v2-s-3)" radius="var(--v2-r-2)">
            <p
              className="v2-small"
              style={{ margin: 0, color: "var(--v2-ink-3)" }}
            >
              {locale === "ko" ? "1RM/TM 미설정 — 관리에서 입력하세요." : "1RM/TM not set — open Manage to enter."}
            </p>
          </V2Card>
        )}

        <V2PrimaryBtn
          full
          icon="tune"
          onClick={onManage}
        >
          {copy.plansManage.manage}
        </V2PrimaryBtn>
      </V2Stack>
    </V2Card>
  );
}

function PlanDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <V2Card tone="inset" padding="var(--v2-s-3) var(--v2-s-4)" radius="var(--v2-r-2)">
      <p className="v2-eyebrow" style={{ margin: 0, color: "var(--v2-ink-3)" }}>
        {label}
      </p>
      <p
        className="v2-body"
        style={{
          margin: 0,
          marginTop: "var(--v2-s-1)",
          color: "var(--v2-ink)",
          wordBreak: "break-word",
        }}
      >
        {value}
      </p>
    </V2Card>
  );
}

function StrengthEditRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <V2Card tone="inset" padding="var(--v2-s-3) var(--v2-s-4)" radius="var(--v2-r-2)">
      <V2Stack gap={3}>
        <strong
          className="v2-body"
          style={{ color: "var(--v2-ink)", fontWeight: 700 }}
        >
          {label}
        </strong>
        {children}
      </V2Stack>
    </V2Card>
  );
}

function StrengthEditField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <V2Stack gap={1}>
      <span
        className="v2-eyebrow"
        style={{ color: "var(--v2-ink-3)" }}
      >
        {label}
      </span>
      {children}
    </V2Stack>
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
  const [incrementDraft, setIncrementDraft] = useState<IncrementDraft>({});
  const [incrementLoading, setIncrementLoading] = useState(false);
  const [progressPosition, setProgressPosition] = useState<{
    cycle: number;
    week: number;
    day: number;
  } | null>(null);
  const [lastEvents, setLastEvents] = useState<Record<string, TargetLastEvent>>({});
  const [showStartingBaseline, setShowStartingBaseline] = useState(false);
  const [showIncrementSettings, setShowIncrementSettings] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustDraft, setAdjustDraft] = useState<Record<string, number>>({});
  const [adjusting, setAdjusting] = useState(false);
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
        fallbackKey: familyFallbackKeyForBaselineKey(key),
        label: targetLabelFromKey(key),
        oneRepMaxKg: value.oneRepMaxKg,
        trainingMaxKg: value.trainingMaxKg,
      })),
    [strengthDraft],
  );
  const isAutoProgression = useMemo(
    () => toRecord(managedPlan?.params).autoProgression === true,
    [managedPlan],
  );
  const currentProgressRows = useMemo(() => {
    const rows = Object.entries(incrementDraft).map(([key, entry]) => ({
      key,
      label: shortTargetLabel(key),
      weightKg: entry.workKg > 0 ? entry.workKg : null,
      lastDeltaKg: lastEvents[key]?.lastDeltaKg ?? null,
      lastEventType: lastEvents[key]?.lastEventType ?? null,
    }));
    rows.sort((a, b) => {
      const ai = TARGET_PRIORITY.indexOf(a.key);
      const bi = TARGET_PRIORITY.indexOf(b.key);
      if (ai === -1 && bi === -1) return a.key.localeCompare(b.key);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return rows;
  }, [incrementDraft, lastEvents]);
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
    setIncrementDraft({});
    setProgressPosition(null);
    setLastEvents({});
    setShowStartingBaseline(false);
    setShowIncrementSettings(false);
    setAdjustOpen(false);
    setAdjustDraft({});
    setManagePlanId(plan.id);

    const planParams = toRecord(plan.params);
    if (planParams.autoProgression === true) {
      void loadIncrementDraft(plan.id);
    }
  }

  async function loadIncrementDraft(planId: string) {
    try {
      setIncrementLoading(true);
      const res = await apiGet<ProgressionStateApiResponse>(
        `/api/plans/${encodeURIComponent(planId)}/progression-state`,
      );
      if (!res.program || !res.effectiveRules) {
        setIncrementDraft({});
        return;
      }
      const draft: IncrementDraft = {};
      for (const [key, rule] of Object.entries(res.effectiveRules)) {
        const workKg = res.state?.targets?.[key]?.workKg ?? 0;
        draft[key] = {
          increaseKg: rule.increaseKg,
          decreaseKg: rule.decreaseKg ?? 0,
          defaultIncreaseKg: rule.defaultIncreaseKg,
          defaultResetFactor: rule.defaultResetFactor,
          workKg,
        };
      }
      setIncrementDraft(draft);
      if (res.state) {
        setProgressPosition({
          cycle: res.state.cycle,
          week: res.state.week,
          day: res.state.day,
        });
      }
      setLastEvents(res.targetsLastEvent ?? {});
    } catch {
      setIncrementDraft({});
    } finally {
      setIncrementLoading(false);
    }
  }

  function openAdjustment() {
    const draft: Record<string, number> = {};
    for (const row of currentProgressRows) {
      draft[row.key] = row.weightKg ?? 0;
    }
    setAdjustDraft(draft);
    setAdjustOpen(true);
  }

  async function saveAdjustment() {
    if (!managedPlan) return;
    const adjustments: Record<string, { workKg: number }> = {};
    for (const row of currentProgressRows) {
      const next = adjustDraft[row.key];
      if (typeof next !== "number" || !Number.isFinite(next) || next <= 0) continue;
      if (next === (row.weightKg ?? 0)) continue;
      adjustments[row.key] = { workKg: next };
    }
    if (Object.keys(adjustments).length === 0) {
      setAdjustOpen(false);
      return;
    }
    try {
      setAdjusting(true);
      const res = await apiPost<{
        ok: boolean;
        state: ProgressionStateApiResponse["state"];
        targetsLastEvent?: Record<string, TargetLastEvent>;
      }>(
        `/api/plans/${encodeURIComponent(managedPlan.id)}/runtime-targets`,
        { adjustments },
        { invalidateCachePrefixes: ["/api/plans"] },
      );
      const targets = res.state?.targets ?? {};
      setIncrementDraft((prev) => {
        const nextDraft = { ...prev };
        for (const [key, target] of Object.entries(targets)) {
          if (nextDraft[key]) {
            nextDraft[key] = {
              ...nextDraft[key],
              workKg: target.workKg ?? nextDraft[key].workKg,
            };
          }
        }
        return nextDraft;
      });
      if (res.state) {
        setProgressPosition({
          cycle: res.state.cycle,
          week: res.state.week,
          day: res.state.day,
        });
      }
      if (res.targetsLastEvent) setLastEvents(res.targetsLastEvent);
      setAdjustOpen(false);
      await alert({
        title: "조정 완료",
        message: "현재 TM이 조정되었습니다.",
        buttonText: "확인",
      });
    } catch (e: any) {
      await alert({
        title: "조정 실패",
        message: e?.message ?? "현재 TM 조정에 실패했습니다.",
        buttonText: "확인",
        tone: "danger",
      });
    } finally {
      setAdjusting(false);
    }
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

      // per-exercise(EX_) 행은 family canonical 키에도 같은 값을 기록한다. 표시 단계에서 접은
      // family 그림자 행을 여기서 되살려, 자동 진행이 참조하는 family baseline이 사라지지 않게 한다.
      // (프로그램 시작 시 submitStartProgram이 펼치는 fallbackKey 동기화와 동일한 패턴.)
      const { fallbackKey } = row;
      if (fallbackKey) {
        if (row.oneRepMaxKg > 0 && oneRepMaxKg[fallbackKey] === undefined) {
          oneRepMaxKg[fallbackKey] = row.oneRepMaxKg;
        }
        if (row.trainingMaxKg > 0 && trainingMaxKg[fallbackKey] === undefined) {
          trainingMaxKg[fallbackKey] = row.trainingMaxKg;
        }
      }
    }

    const prevPlan = managedPlan;
    const currentParams = toRecord(managedPlan.params);
    const nextParams: Record<string, unknown> = {
      ...currentParams,
      oneRepMaxKg,
      trainingMaxKg,
    };

    const overrideEntries = Object.entries(incrementDraft);
    if (overrideEntries.length > 0) {
      const increaseKgMap: Record<string, number> = {};
      const decreaseKgMap: Record<string, number> = {};
      for (const [key, row] of overrideEntries) {
        if (row.increaseKg !== row.defaultIncreaseKg) {
          increaseKgMap[key] = row.increaseKg;
        }
        if (row.decreaseKg > 0) {
          decreaseKgMap[key] = row.decreaseKg;
        }
      }
      const hasOverrides =
        Object.keys(increaseKgMap).length > 0 || Object.keys(decreaseKgMap).length > 0;
      if (hasOverrides) {
        const incrementOverrides: Record<string, Record<string, number>> = {};
        if (Object.keys(increaseKgMap).length > 0) incrementOverrides.increaseKg = increaseKgMap;
        if (Object.keys(decreaseKgMap).length > 0) incrementOverrides.decreaseKg = decreaseKgMap;
        nextParams.incrementOverrides = incrementOverrides;
      } else {
        delete nextParams.incrementOverrides;
      }
    }

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
  const totalLabel = locale === "ko" ? "총 플랜" : "Total";
  const recentLabel = locale === "ko" ? "최근 7일" : "Active 7d";
  const idleLabel = locale === "ko" ? "미수행" : "Unused";
  const browseStoreLabel = locale === "ko" ? "프로그램 스토어 둘러보기" : "Browse Program Store";

  const filterOptions = useMemo(
    () => [
      {
        value: "ALL" as const,
        label: `${locale === "ko" ? "전체" : "All"} · ${heroMetrics.total}`,
      },
      {
        value: "RECENT" as const,
        label: `${locale === "ko" ? "최근" : "Recent"} · ${heroMetrics.recent}`,
      },
      {
        value: "IDLE" as const,
        label: `${locale === "ko" ? "미수행" : "Idle"} · ${heroMetrics.untouched}`,
      },
    ],
    [heroMetrics, locale],
  );

  return (
    <>
      <V2Stack gap={5}>
        {/* ── HERO ── */}
        <V2Card tone="paper" padding="var(--v2-s-5)" radius="var(--v2-r-3)">
          <V2Stack gap={4}>
            <V2Stack gap={1}>
              <p
                className="v2-eyebrow"
                style={{ margin: 0, color: "var(--v2-accent-ink)" }}
              >
                {copy.plansManage.headerEyebrow}
              </p>
              <h1 className="v2-h1" style={{ margin: 0 }}>
                {copy.plansManage.title}
              </h1>
              <p
                className="v2-small"
                style={{ margin: 0, color: "var(--v2-ink-2)" }}
              >
                {heroDescription}
              </p>
            </V2Stack>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "var(--v2-s-2)",
              }}
            >
              <V2MetricCard
                label={totalLabel}
                value={heroMetrics.total}
                size="sm"
              />
              <V2MetricCard
                label={recentLabel}
                value={heroMetrics.recent}
                tone="success"
                size="sm"
              />
              <V2MetricCard
                label={idleLabel}
                value={heroMetrics.untouched}
                size="sm"
              />
            </div>

            <V2PrimaryBtn
              as="a"
              href={APP_ROUTES.programStore}
              icon="add"
              full
            >
              {browseStoreLabel}
            </V2PrimaryBtn>
          </V2Stack>
        </V2Card>

        {/* ── FILTER + SEARCH ── */}
        {plans.length > 0 || searchQuery.trim().length > 0 ? (
          <V2Stack gap={3}>
            <V2Segmented
              ariaLabel={locale === "ko" ? "플랜 필터" : "Plan filter"}
              options={filterOptions}
              value={activityFilter}
              onChange={(value) => setActivityFilter(value)}
              size="sm"
            />
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={copy.plansManage.searchPlaceholder}
              ariaLabel={copy.plansManage.searchAriaLabel}
            />
          </V2Stack>
        ) : null}

        {/* ── STATES + LIST ── */}
        <div>
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
            <V2Stack gap={3}>
              {filteredPlans.map((plan) => (
                <PlanCardV2
                  key={plan.id}
                  plan={plan}
                  copy={copy}
                  locale={locale}
                  onManage={() => openManageSheet(plan)}
                />
              ))}
            </V2Stack>
          ) : null}
        </div>
      </V2Stack>

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
          <V2Stack gap={5}>
            {/* ── Plan info ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "var(--v2-s-2)",
              }}
            >
              <PlanDetailRow
                label={locale === "ko" ? "타입" : "Type"}
                value={planTypeLabel(managedPlan.type, locale)}
              />
              <PlanDetailRow
                label={copy.plansManage.baseProgram}
                value={managedPlan.baseProgramName ?? "-"}
              />
              <PlanDetailRow
                label={copy.plansManage.createdAt}
                value={formatDateTime(managedPlan.createdAt)}
              />
              <PlanDetailRow
                label={copy.plansManage.lastPerformedAt}
                value={
                  managedPlan.lastPerformedAt
                    ? formatDateTime(managedPlan.lastPerformedAt)
                    : copy.plansManage.noRecord
                }
              />
            </div>

            <V2Hairline />

            {/* ── Plan name ── */}
            <V2Stack gap={2} as="div">
              <span
                className="v2-eyebrow"
                style={{ color: "var(--v2-ink-3)" }}
              >
                {copy.plansManage.planName}
              </span>
              <AppTextInput
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder={copy.plansManage.planNamePlaceholder}
              />
            </V2Stack>

            {/* ── Current progression ── */}
            {isAutoProgression && currentProgressRows.length > 0 ? (
              <V2Stack gap={2}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: "var(--v2-s-2)",
                  }}
                >
                  <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
                    {copy.plansManage.currentProgress}
                  </span>
                  {progressPosition ? (
                    <span
                      className="v2-mono-label"
                      style={{ color: "var(--v2-ink-3)", fontSize: "var(--v2-t-eyebrow)" }}
                    >
                      {`C${progressPosition.cycle}W${progressPosition.week}D${progressPosition.day}`}
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "var(--v2-s-2)",
                  }}
                >
                  {currentProgressRows.map((row) => (
                    <TargetWeightChip
                      key={row.key}
                      label={row.label}
                      weightKg={row.weightKg}
                      lastDeltaKg={row.lastDeltaKg}
                      lastEventType={row.lastEventType}
                    />
                  ))}
                </div>
                {adjustOpen ? (
                  <V2Stack gap={2}>
                    <p
                      className="v2-small"
                      style={{ margin: 0, color: "var(--v2-ink-2)" }}
                    >
                      {copy.plansManage.adjustHint}
                    </p>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: "var(--v2-s-3)",
                      }}
                    >
                      {currentProgressRows.map((row) => (
                        <StrengthEditField key={row.key} label={row.label}>
                          <NumberKeypadField
                            ariaLabel={`${row.label} TM`}
                            value={adjustDraft[row.key] ?? 0}
                            min={0}
                            max={500}
                            allowDecimal
                            onChange={(value) =>
                              setAdjustDraft((prev) => ({ ...prev, [row.key]: value }))
                            }
                          />
                        </StrengthEditField>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: "var(--v2-s-2)" }}>
                      <V2PrimaryBtn
                        full
                        disabled={adjusting}
                        onClick={() => {
                          void saveAdjustment();
                        }}
                      >
                        {adjusting ? copy.plansManage.saveInProgress : copy.plansManage.adjustSave}
                      </V2PrimaryBtn>
                      <V2SecondaryBtn
                        full
                        disabled={adjusting}
                        onClick={() => setAdjustOpen(false)}
                      >
                        {copy.plansManage.adjustCancel}
                      </V2SecondaryBtn>
                    </div>
                  </V2Stack>
                ) : (
                  <V2SecondaryBtn full icon="tune" onClick={openAdjustment}>
                    {copy.plansManage.adjustCurrentTm}
                  </V2SecondaryBtn>
                )}
              </V2Stack>
            ) : null}

            {/* ── Strength baselines ── */}
            <V2Stack gap={2}>
              <span
                className="v2-eyebrow"
                style={{ color: "var(--v2-ink-3)" }}
              >
                {copy.plansManage.strengthBaselines}
              </span>
              {isAutoProgression ? (
                <p
                  className="v2-small"
                  style={{ margin: 0, color: "var(--v2-ink-2)" }}
                >
                  {copy.plansManage.startingBaselineHint}
                </p>
              ) : null}
              {isAutoProgression ? (
                <V2SecondaryBtn
                  full
                  icon={showStartingBaseline ? "expand_less" : "expand_more"}
                  onClick={() => setShowStartingBaseline((prev) => !prev)}
                >
                  {showStartingBaseline
                    ? copy.plansManage.hideStartingBaseline
                    : copy.plansManage.showStartingBaseline}
                </V2SecondaryBtn>
              ) : null}
              {!isAutoProgression || showStartingBaseline ? (
                strengthRows.length > 0 ? (
                <V2Stack gap={2}>
                  {strengthRows.map((row) => (
                    <StrengthEditRow key={row.key} label={row.label}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                          gap: "var(--v2-s-3)",
                        }}
                      >
                        <StrengthEditField label={copy.plansManage.oneRepMax}>
                          {isAutoProgression ? (
                            <span className="v2-body" style={{ color: "var(--v2-ink)" }}>
                              {row.oneRepMaxKg > 0 ? `${formatKg(row.oneRepMaxKg)} kg` : "—"}
                            </span>
                          ) : (
                            <NumberKeypadField
                              ariaLabel={`${row.label} ${copy.plansManage.oneRepMax}`}
                              value={row.oneRepMaxKg}
                              min={0}
                              max={500}
                              allowDecimal
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
                          )}
                        </StrengthEditField>
                        <StrengthEditField label={copy.plansManage.trainingMax}>
                          {isAutoProgression ? (
                            <span className="v2-body" style={{ color: "var(--v2-ink)" }}>
                              {row.trainingMaxKg > 0 ? `${formatKg(row.trainingMaxKg)} kg` : "—"}
                            </span>
                          ) : (
                            <NumberKeypadField
                              ariaLabel={`${row.label} ${copy.plansManage.trainingMax}`}
                              value={row.trainingMaxKg}
                              min={0}
                              max={500}
                              allowDecimal
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
                          )}
                        </StrengthEditField>
                      </div>
                    </StrengthEditRow>
                  ))}
                </V2Stack>
              ) : (
                <V2EmptyState
                  icon="straighten"
                  title={copy.plansManage.noStrengthBaselines}
                  tone="inset"
                />
                )
              ) : null}
            </V2Stack>

            {/* ── Increment overrides ── */}
            {Object.keys(incrementDraft).length > 0 ? (
              <V2Stack gap={2}>
                <span
                  className="v2-eyebrow"
                  style={{ color: "var(--v2-ink-3)" }}
                >
                  {copy.plansManage.incrementSettingsLabel}
                </span>
                <V2SecondaryBtn
                  full
                  icon={showIncrementSettings ? "expand_less" : "expand_more"}
                  onClick={() => setShowIncrementSettings((prev) => !prev)}
                >
                  {showIncrementSettings
                    ? copy.plansManage.hideIncrementSettings
                    : copy.plansManage.showIncrementSettings}
                </V2SecondaryBtn>
                {showIncrementSettings ? (
                <V2Stack gap={2}>
                  <p
                    className="v2-small"
                    style={{ margin: 0, color: "var(--v2-ink-2)" }}
                  >
                    {copy.plansManage.incrementSettingsHint}
                  </p>
                  {Object.entries(incrementDraft).map(([key, row]) => {
                    const label = targetLabelFromKey(key);
                    return (
                      <StrengthEditRow key={key} label={label}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                            gap: "var(--v2-s-3)",
                          }}
                        >
                          <StrengthEditField
                            label={
                              locale === "ko"
                                ? `증량 (기본 ${formatKg(row.defaultIncreaseKg)}kg)`
                                : `Increase (default ${formatKg(row.defaultIncreaseKg)}kg)`
                            }
                          >
                            <NumberKeypadField
                              ariaLabel={`${label} ${locale === "ko" ? "증량" : "Increase"}`}
                              value={row.increaseKg}
                              min={0}
                              max={20}
                              allowDecimal
                              onChange={(value) => {
                                setIncrementDraft((prev) => ({
                                  ...prev,
                                  [key]: { ...prev[key]!, increaseKg: value },
                                }));
                              }}
                            />
                          </StrengthEditField>
                          <StrengthEditField
                            label={
                              locale === "ko"
                                ? `감량 (기본 ${Math.round((1 - row.defaultResetFactor) * 100)}%)`
                                : `Decrease (default ${Math.round((1 - row.defaultResetFactor) * 100)}%)`
                            }
                          >
                            <NumberKeypadField
                              ariaLabel={`${label} ${locale === "ko" ? "감량" : "Decrease"}`}
                              value={row.decreaseKg}
                              min={0}
                              max={20}
                              allowDecimal
                              onChange={(value) => {
                                setIncrementDraft((prev) => ({
                                  ...prev,
                                  [key]: { ...prev[key]!, decreaseKg: value },
                                }));
                              }}
                            />
                          </StrengthEditField>
                        </div>
                      </StrengthEditRow>
                    );
                  })}
                </V2Stack>
                ) : null}
              </V2Stack>
            ) : incrementLoading ? (
              <V2EmptyState
                icon="hourglass_empty"
                title={
                  locale === "ko"
                    ? "증량/감량 설정 불러오는 중..."
                    : "Loading increment settings..."
                }
                tone="inset"
              />
            ) : null}

            {/* ── Actions ── */}
            <V2Stack gap={2}>
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
            </V2Stack>
          </V2Stack>
        ) : (
          <V2EmptyState
            icon="search_off"
            title={copy.plansManage.notFound}
            tone="inset"
          />
        )}
      </BottomSheet>
    </>
  );
}
