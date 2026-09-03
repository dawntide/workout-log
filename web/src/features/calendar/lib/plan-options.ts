import type { CalendarPlan } from "../model/types";

/**
 * 캘린더 플랜 선택 목록.
 *
 * 보관은 "기록을 지우지 않고 목록에서만 내리는" 상태다. 그런데 캘린더는 플랜 스코프
 * 화면이라, 보관된 플랜을 목록에서 통째로 빼면 그 플랜의 기록에 **도달할 길이 아예
 * 사라진다** — 보관이 사실상 숨김이 되어 버린다. 그래서 기본값은 감추되 토글로 꺼낼
 * 수 있게 두고, 기본 선택에서만 제외한다(기본 선택은 `resolveActivePlan`의 몫이다).
 */
export type CalendarPlanOptionInput = Pick<CalendarPlan, "id" | "name" | "type"> & {
  isArchived?: boolean;
};

function normalizeSearchText(...values: Array<string | null | undefined>) {
  return values
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export function isArchivedPlan(plan: { isArchived?: boolean }): boolean {
  return plan.isArchived === true;
}

/** 보관되지 않은 플랜만. 기본 선택 후보다. */
export function selectablePlans<T extends { isArchived?: boolean }>(plans: readonly T[]): T[] {
  return plans.filter((plan) => !isArchivedPlan(plan));
}

export function filterCalendarPlanOptions<T extends CalendarPlanOptionInput>(
  plans: readonly T[],
  input: { query: string; showArchived: boolean; selectedPlanId: string },
): T[] {
  const normalizedQuery = input.query.trim().toLowerCase();
  return plans.filter((plan) => {
    // 지금 보고 있는 플랜은 토글과 무관하게 남긴다 — 보관된 플랜을 고른 뒤 토글을
    // 끄면 선택 항목이 목록에서 사라져 "내가 뭘 보고 있는지"를 잃는다.
    const visible =
      input.showArchived || !isArchivedPlan(plan) || plan.id === input.selectedPlanId;
    if (!visible) return false;
    if (!normalizedQuery) return true;
    return normalizeSearchText(plan.name, plan.type).includes(normalizedQuery);
  });
}

/** 목록에 보관 플랜이 하나라도 있는지 — 토글을 보여줄지 정한다. */
export function hasArchivedPlan(plans: readonly { isArchived?: boolean }[]): boolean {
  return plans.some(isArchivedPlan);
}
