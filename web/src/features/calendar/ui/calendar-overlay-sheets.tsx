"use client";

import dynamic from "next/dynamic";
import { memo } from "react";
import { V2Card, V2PrimaryBtn, V2SecondaryBtn, V2Switch } from "@/components/v2/primitives";
import { getMonth, getYear } from "@/lib/date-utils";

const MonthYearPickerSheet = dynamic(
  () =>
    import("@/components/ui/month-year-picker-sheet").then(
      (mod) => mod.MonthYearPickerSheet,
    ),
  { ssr: false },
);
const SearchSelectSheet = dynamic(
  () =>
    import("@/components/ui/search-select-sheet").then(
      (mod) => mod.SearchSelectSheet,
    ),
  { ssr: false },
);
const BottomSheet = dynamic(
  () => import("@/components/ui/bottom-sheet").then((mod) => mod.BottomSheet),
  { ssr: false },
);

type CalendarPlanOption = {
  id: string;
  name: string;
  isArchived?: boolean;
};

type CalendarOverlaySheetsCopy = {
  planSheetTitle: string;
  planSheetDescription: string;
  close: string;
  planSearchPlaceholder: string;
  planSearchResults: string;
  noMatchingPlans: string;
  planShowArchived: string;
  planArchivedBadge: string;
  noPlansWithoutArchived: string;
  monthPickerTitle: string;
};

type MoveDateConflictCopy = {
  title: string;
  description: string;
  close: string;
};

type DeleteCopy = {
  title: string;
  /** 본문 확인 문구. 버튼 라벨이 아니다(질문문을 버튼에 넣지 않는다). */
  message: string;
  confirm: string;
  cancel: string;
};

type CalendarOverlaySheetsProps = {
  copy: CalendarOverlaySheetsCopy;
  planSheetOpen: boolean;
  planQuery: string;
  filteredPlans: CalendarPlanOption[];
  selectedPlanId: string;
  showArchivedPlans: boolean;
  archivedPlansAvailable: boolean;
  onToggleArchivedPlans: (next: boolean) => void;
  onClosePlanSheet: () => void;
  onPlanQueryChange: (value: string) => void;
  onPlanQuerySubmit: () => void;
  onSelectPlan: (planId: string) => void;
  monthPickerOpen: boolean;
  anchorDate: string;
  today: string;
  onCloseMonthPicker: () => void;
  onMonthChange: (value: { year: number; month: number }) => void;
  moveDateConflictOpen: boolean;
  moveDateConflictCopy: MoveDateConflictCopy;
  onCloseMoveDateConflict: () => void;
  deleteConfirmOpen: boolean;
  deleteCopy: DeleteCopy;
  onCloseDeleteConfirm: () => void;
  onConfirmDelete: () => void;
};

/**
 * 보관 플랜 표시 토글. 검색 입력과 결과 목록 사이(=`filters` 슬롯)에 둔다 —
 * 결과에 붙어 있어야 켜 둔 걸 안다.
 */
const ArchivedPlanToggle = memo(function ArchivedPlanToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--v2-s-3)",
        marginTop: "var(--v2-s-3)",
      }}
    >
      <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
        {label}
      </span>
      <V2Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
});

const MoveDateConflictSheet = memo(function MoveDateConflictSheet({
  open,
  copy,
  onClose,
}: {
  open: boolean;
  copy: MoveDateConflictCopy;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      open={open}
      title={copy.title}
      onClose={onClose}
      closeLabel={copy.close}
      footer={
        <V2PrimaryBtn full onClick={onClose}>
          {copy.close}
        </V2PrimaryBtn>
      }
    >
      <V2Card tone="danger" padding="var(--v2-s-4)">
        <p className="v2-body" style={{ whiteSpace: "pre-line", margin: 0 }}>
          {copy.description}
        </p>
      </V2Card>
    </BottomSheet>
  );
});

const DeleteConfirmSheet = memo(function DeleteConfirmSheet({
  open,
  deleteCopy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  deleteCopy: DeleteCopy;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <BottomSheet
      open={open}
      title={deleteCopy.title}
      onClose={onClose}
      closeLabel={deleteCopy.cancel}
      footer={
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-1)",
            width: "100%",
          }}
        >
          <V2PrimaryBtn full tone="danger" onClick={onConfirm}>
            {deleteCopy.confirm}
          </V2PrimaryBtn>
          <V2SecondaryBtn full onClick={onClose}>
            {deleteCopy.cancel}
          </V2SecondaryBtn>
        </div>
      }
    >
      <V2Card tone="danger" padding="var(--v2-s-4)">
        <p className="v2-body" style={{ whiteSpace: "pre-line", margin: 0 }}>
          {deleteCopy.message}
        </p>
      </V2Card>
    </BottomSheet>
  );
});

export const CalendarOverlaySheets = memo(function CalendarOverlaySheets({
  copy,
  planSheetOpen,
  planQuery,
  filteredPlans,
  selectedPlanId,
  showArchivedPlans,
  archivedPlansAvailable,
  onToggleArchivedPlans,
  onClosePlanSheet,
  onPlanQueryChange,
  onPlanQuerySubmit,
  onSelectPlan,
  monthPickerOpen,
  anchorDate,
  today,
  onCloseMonthPicker,
  onMonthChange,
  moveDateConflictOpen,
  moveDateConflictCopy,
  onCloseMoveDateConflict,
  deleteConfirmOpen,
  deleteCopy,
  onCloseDeleteConfirm,
  onConfirmDelete,
}: CalendarOverlaySheetsProps) {
  return (
    <>
      <SearchSelectSheet
        open={planSheetOpen}
        title={copy.planSheetTitle}
        description={copy.planSheetDescription}
        onClose={onClosePlanSheet}
        closeLabel={copy.close}
        query={planQuery}
        placeholder={copy.planSearchPlaceholder}
        onQueryChange={onPlanQueryChange}
        onQuerySubmit={onPlanQuerySubmit}
        resultsAriaLabel={copy.planSearchResults}
        filters={
          // 보관 플랜이 없으면 토글도 없다 — 아무것도 바꾸지 못하는 스위치를 두지 않는다.
          archivedPlansAvailable ? (
            <ArchivedPlanToggle
              label={copy.planShowArchived}
              checked={showArchivedPlans}
              onChange={onToggleArchivedPlans}
            />
          ) : null
        }
        emptyText={
          // 토글을 꺼 둔 걸 잊고 "왜 안 나오지"가 되는 게 이 시트의 실패 모드다.
          !showArchivedPlans && archivedPlansAvailable
            ? copy.noPlansWithoutArchived
            : copy.noMatchingPlans
        }
        options={filteredPlans.map((plan) => ({
          key: plan.id,
          label: plan.isArchived ? `${plan.name} · ${copy.planArchivedBadge}` : plan.name,
          active: plan.id === selectedPlanId,
          ariaCurrent: plan.id === selectedPlanId,
          onSelect: () => onSelectPlan(plan.id),
        }))}
      />
      <MonthYearPickerSheet
        open={monthPickerOpen}
        onClose={onCloseMonthPicker}
        title={copy.monthPickerTitle}
        year={getYear(anchorDate)}
        month={getMonth(anchorDate)}
        minYear={getYear(today) - 10}
        maxYear={getYear(today) + 10}
        onChange={onMonthChange}
      />
      <MoveDateConflictSheet
        open={moveDateConflictOpen}
        copy={moveDateConflictCopy}
        onClose={onCloseMoveDateConflict}
      />
      <DeleteConfirmSheet
        open={deleteConfirmOpen}
        deleteCopy={deleteCopy}
        onClose={onCloseDeleteConfirm}
        onConfirm={onConfirmDelete}
      />
    </>
  );
});
