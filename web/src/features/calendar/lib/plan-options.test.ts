import assert from "node:assert/strict";
import test from "node:test";

import {
  filterCalendarPlanOptions,
  hasArchivedPlan,
  selectablePlans,
} from "./plan-options";

type P = { id: string; name: string; type: "SINGLE"; isArchived?: boolean };

const active: P = { id: "a", name: "REF5 Adaptive Strength 프로그램 2", type: "SINGLE" };
const archived: P = {
  id: "b",
  name: "REF5 Adaptive Strength 프로그램",
  type: "SINGLE",
  isArchived: true,
};
const other: P = { id: "c", name: "Tactical Barbell Operator", type: "SINGLE" };
const plans = [active, archived, other];

test("기본값은 보관된 플랜을 감춘다", () => {
  const rows = filterCalendarPlanOptions(plans, {
    query: "",
    showArchived: false,
    selectedPlanId: "a",
  });
  assert.deepEqual(rows.map((p) => p.id), ["a", "c"]);
});

// 보관은 "기록은 남기고 목록에서만 내린다"는 뜻인데, 캘린더는 플랜 스코프 화면이라
// 목록에서 완전히 빼면 그 플랜의 기록에 도달할 길이 사라진다. 토글이 그 길이다.
test("토글을 켜면 보관된 플랜이 목록에 돌아온다", () => {
  const rows = filterCalendarPlanOptions(plans, {
    query: "",
    showArchived: true,
    selectedPlanId: "a",
  });
  assert.deepEqual(rows.map((p) => p.id), ["a", "b", "c"]);
});

test("보고 있는 보관 플랜은 토글을 꺼도 목록에 남는다", () => {
  const rows = filterCalendarPlanOptions(plans, {
    query: "",
    showArchived: false,
    selectedPlanId: "b",
  });
  assert.deepEqual(
    rows.map((p) => p.id),
    ["a", "b", "c"],
    "선택 항목이 사라지면 무엇을 보고 있는지 알 수 없다",
  );
});

test("검색어는 토글과 함께 적용된다", () => {
  const hidden = filterCalendarPlanOptions(plans, {
    query: "REF5",
    showArchived: false,
    selectedPlanId: "a",
  });
  assert.deepEqual(hidden.map((p) => p.id), ["a"]);

  const shown = filterCalendarPlanOptions(plans, {
    query: "REF5",
    showArchived: true,
    selectedPlanId: "a",
  });
  assert.deepEqual(shown.map((p) => p.id), ["a", "b"]);

  const byType = filterCalendarPlanOptions(plans, {
    query: "single",
    showArchived: false,
    selectedPlanId: "a",
  });
  assert.deepEqual(byType.map((p) => p.id), ["a", "c"], "플랜 타입도 검색 대상이다");
});

test("기본 선택 후보는 보관되지 않은 플랜뿐이다", () => {
  assert.deepEqual(selectablePlans(plans).map((p) => p.id), ["a", "c"]);
  assert.deepEqual(selectablePlans([archived]), []);
});

test("보관 플랜이 없으면 토글을 띄우지 않는다", () => {
  assert.equal(hasArchivedPlan(plans), true);
  assert.equal(hasArchivedPlan([active, other]), false);
  assert.equal(hasArchivedPlan([]), false);
});
