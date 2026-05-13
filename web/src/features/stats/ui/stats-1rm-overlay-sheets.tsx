"use client";

import dynamic from "next/dynamic";
import { memo } from "react";
import { CalendarRangePicker } from "@/components/ui/calendar-range-picker";
import type { RangeFilter, SheetType } from "@/features/stats/model/stats-1rm-types";

const BottomSheet = dynamic(
  () => import("@/components/ui/bottom-sheet").then((mod) => mod.BottomSheet),
  { ssr: false },
);
const SearchSelectSheet = dynamic(
  () =>
    import("@/components/ui/search-select-sheet").then((mod) => mod.SearchSelectSheet),
  { ssr: false },
);

type SearchOption = {
  key: string;
  label: string;
  active: boolean;
  ariaCurrent: boolean;
  onSelect: () => void;
};

export const Stats1RMOverlaySheets = memo(function Stats1RMOverlaySheets({
  locale,
  activeSheet,
  onClose,
  exerciseQuery,
  onExerciseQueryChange,
  filteredExerciseOptions,
  programQuery,
  onProgramQueryChange,
  filteredProgramOptions,
  optionsLoading,
  rangeDraft,
  onRangeDraftChange,
  rangeDraftError,
  applyRangeDraft,
  canApplyRangeDraft,
}: {
  locale: "ko" | "en";
  activeSheet: SheetType;
  onClose: () => void;
  exerciseQuery: string;
  onExerciseQueryChange: (value: string) => void;
  filteredExerciseOptions: SearchOption[];
  programQuery: string;
  onProgramQueryChange: (value: string) => void;
  filteredProgramOptions: SearchOption[];
  optionsLoading: boolean;
  rangeDraft: RangeFilter;
  onRangeDraftChange: (next: RangeFilter) => void;
  rangeDraftError: string | null;
  applyRangeDraft: () => void;
  canApplyRangeDraft: boolean;
}) {
  return (
    <>
      <SearchSelectSheet
        open={activeSheet === "exercise"}
        title={locale === "ko" ? "운동종목 필터" : "Exercise Filter"}
        description={
          locale === "ko"
            ? "그래프 대상 운동종목을 선택합니다."
            : "Choose the exercise to plot."
        }
        onClose={onClose}
        closeLabel={locale === "ko" ? "닫기" : "Close"}
        query={exerciseQuery}
        placeholder={locale === "ko" ? "운동종목 검색..." : "Search exercises..."}
        onQueryChange={onExerciseQueryChange}
        resultsAriaLabel={locale === "ko" ? "운동종목 목록" : "Exercise list"}
        options={filteredExerciseOptions}
        emptyText={locale === "ko" ? "검색 결과가 없습니다." : "No results found."}
        loading={optionsLoading}
        loadingText={locale === "ko" ? "운동종목 불러오는 중..." : "Loading exercises..."}
      />

      <BottomSheet
        open={activeSheet === "range"}
        title={locale === "ko" ? "기간 필터" : "Date Range Filter"}
        description={
          locale === "ko"
            ? "기간을 선택하면 필터 조합으로 다시 조회합니다."
            : "Choose a range to refetch the chart with the selected filters."
        }
        onClose={onClose}
        closeLabel={locale === "ko" ? "닫기" : "Close"}
        primaryAction={{
          ariaLabel: locale === "ko" ? "기간 적용" : "Apply range",
          onPress: applyRangeDraft,
          disabled: !canApplyRangeDraft,
        }}
        footer={null}
      >
        <div style={{ padding: "0 var(--v2-s-1)" }}>
          <CalendarRangePicker
            startDate={rangeDraft.from}
            endDate={rangeDraft.to}
            onRangeChange={(from, to) => {
              onRangeDraftChange({
                preset: "CUSTOM",
                from,
                to: to || from,
              });
            }}
          />
          {rangeDraftError ? (
            <p
              className="v2-small"
              style={{
                color: "var(--v2-c-danger)",
                marginTop: "var(--v2-s-4)",
                margin: 0,
              }}
            >
              {rangeDraftError}
            </p>
          ) : null}
        </div>
      </BottomSheet>

      <SearchSelectSheet
        open={activeSheet === "program"}
        title={locale === "ko" ? "플랜 필터" : "Plan Filter"}
        description={
          locale === "ko"
            ? "특정 플랜 기록만 보거나 전체를 볼 수 있습니다."
            : "View logs for a specific plan or across all plans."
        }
        onClose={onClose}
        closeLabel={locale === "ko" ? "닫기" : "Close"}
        query={programQuery}
        placeholder={locale === "ko" ? "플랜 검색..." : "Search plans..."}
        onQueryChange={onProgramQueryChange}
        resultsAriaLabel={locale === "ko" ? "플랜 목록" : "Plan list"}
        options={filteredProgramOptions}
        emptyText={locale === "ko" ? "검색 결과가 없습니다." : "No results found."}
        loading={optionsLoading}
        loadingText={locale === "ko" ? "플랜 불러오는 중..." : "Loading plans..."}
      />
    </>
  );
});
