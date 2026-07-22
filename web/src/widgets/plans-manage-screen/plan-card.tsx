import {
  V2Card,
  V2Chip,
  V2PrimaryBtn,
  V2Stack,
} from "@/components/v2/primitives";
import {
  RECENT_THRESHOLD_DAYS,
  daysSince,
  formatRelativeDays,
  planTypeChipTone,
  planTypeLabel,
  type Plan,
} from "@/features/plans-manage/model/plan-view";

import type { LocaleKey, PlansManageCopy } from "./view-types";

export function PlanCardV2({
  plan,
  onManage,
  copy,
  locale,
}: {
  plan: Plan;
  onManage: () => void;
  copy: PlansManageCopy;
  locale: LocaleKey;
}) {
  const days = daysSince(plan.lastPerformedAt);
  const relText = formatRelativeDays(days, locale);
  const isFresh = typeof days === "number" && days <= RECENT_THRESHOLD_DAYS;
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
            {plan.isArchived ? (
              <V2Chip tone="neutral" icon="inventory_2">
                {locale === "ko" ? "보관됨" : "Archived"}
              </V2Chip>
            ) : null}
            {plan.baseProgramAccessible === false ? (
              <V2Chip tone="warning" icon="help">
                {locale === "ko" ? "스토어에 없음" : "Not in store"}
              </V2Chip>
            ) : null}
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
