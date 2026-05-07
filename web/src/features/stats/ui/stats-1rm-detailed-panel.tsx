"use client";

import { forwardRef, useImperativeHandle } from "react";
import { useLocale } from "@/components/locale-provider";
import { EmptyStateRows, ErrorStateRows } from "@/components/ui/settings-state";
import {
  useStats1RMController,
} from "@/features/stats/model/use-stats-1rm-controller";
import type {
  BaseFilterOption,
  E1RMResponse,
} from "@/features/stats/model/stats-1rm-types";
import {
  Stats1RMChartSection,
} from "@/features/stats/ui/stats-1rm-chart-section";
import {
  Stats1RMControls,
} from "@/features/stats/ui/stats-1rm-controls";
import {
  Stats1RMOverlaySheets,
} from "@/features/stats/ui/stats-1rm-overlay-sheets";
import {
  E1RMInteractiveChart,
  clampIndex,
} from "@/features/stats/ui/e1rm-interactive-chart";

export type Stats1RMDetailedRef = {
  selectExercise: (exerciseId: string) => void;
};

type Stats1RMDetailedPanelProps = {
  refreshTick?: number;
  initialExercises?: BaseFilterOption[];
  initialPlans?: BaseFilterOption[];
  initialStats?: E1RMResponse | null;
  initialSelectedExerciseId?: string | null;
  initialSelectedPlanId?: string;
};

export const Stats1RMDetailedPanel = forwardRef<
  Stats1RMDetailedRef,
  Stats1RMDetailedPanelProps
>(function Stats1RMDetailedPanel(
  {
    refreshTick = 0,
    initialExercises,
    initialPlans,
    initialStats,
    initialSelectedExerciseId,
    initialSelectedPlanId = "",
  },
  ref,
) {
  const { locale } = useLocale();
  const {
    activeSheet,
    setActiveSheet,
    optionsLoading,
    optionsError,
    error,
    loadFilterOptions,
    retryDataLoad,
    exercises,
    selectedExercise,
    selectedProgramLabel,
    rangeFilter,
    rangeDraft,
    setRangeDraft,
    rangeDraftError,
    setRangeDraftError,
    stats,
    activePointIndex,
    setActivePointIndex,
    exerciseQuery,
    setExerciseQuery,
    programQuery,
    setProgramQuery,
    isControlPending,
    filteredExerciseOptions,
    filteredProgramOptions,
    showNoExerciseState,
    showDataEmptyState,
    applyRangeDraft,
    canApplyRangeDraft,
    setPresetRange,
    startFilterTransition,
    setSelectedExerciseId,
    selectedSeries: series,
  } = useStats1RMController({
    locale,
    refreshTick,
    initialExercises,
    initialPlans,
    initialStats,
    initialSelectedExerciseId,
    initialSelectedPlanId,
  });

  useImperativeHandle(
    ref,
    () => ({
      selectExercise: (target: string) => {
        startFilterTransition(() => {
          const normalized = target.trim();
          const matchedExercise = exercises.find(
            (entry) =>
              entry.id === normalized ||
              entry.name === normalized ||
              entry.searchText === normalized.toLowerCase(),
          );
          setSelectedExerciseId(matchedExercise?.id ?? normalized);
        });
      },
    }),
    [exercises, setSelectedExerciseId, startFilterTransition],
  );

  const hasChartData = series.length > 0;
  const resolvedActiveIndex = hasChartData
    ? clampIndex(activePointIndex, series.length)
    : 0;
  const activePoint = hasChartData ? series[resolvedActiveIndex] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
      <Stats1RMControls
        locale={locale}
        selectedExerciseName={selectedExercise?.name ?? null}
        selectedProgramLabel={selectedProgramLabel}
        rangePreset={rangeFilter.preset}
        isControlPending={isControlPending}
        onOpenExerciseSheet={() => setActiveSheet("exercise")}
        onOpenProgramSheet={() => setActiveSheet("program")}
        onOpenRangeSheet={() => setActiveSheet("range")}
        onSelectPreset={setPresetRange}
      />

      <div>
        <ErrorStateRows
          message={optionsError}
          title={
            locale === "ko"
              ? "필터 옵션을 불러오지 못했습니다"
              : "Could not load filter options"
          }
          onRetry={() => {
            void loadFilterOptions();
          }}
        />
        <EmptyStateRows
          when={showNoExerciseState}
          label={locale === "ko" ? "운동종목이 없습니다" : "No exercises"}
          description={
            locale === "ko"
              ? "운동종목이 준비되면 1RM 그래프를 표시할 수 있습니다."
              : "Once exercises are available, the 1RM chart can be shown."
          }
        />

        {!showNoExerciseState ? (
          <>
            <ErrorStateRows
              message={error}
              title={
                locale === "ko"
                  ? "1RM 데이터를 불러오지 못했습니다"
                  : "Could not load 1RM data"
              }
              onRetry={() => {
                retryDataLoad();
              }}
            />
            <EmptyStateRows
              when={showDataEmptyState}
              label={
                locale === "ko"
                  ? "선택한 필터 조합에 데이터가 없습니다"
                  : "No data for the selected filters"
              }
              description={
                locale === "ko"
                  ? "필터를 변경하거나 운동 기록을 추가한 뒤 다시 확인하세요."
                  : "Change the filters or add workout logs, then check again."
              }
            />
          </>
        ) : null}

        {hasChartData ? (
          <Stats1RMChartSection
            locale={locale}
            stats={stats}
            activePoint={activePoint}
            chart={
              <E1RMInteractiveChart
                series={series}
                activeIndex={resolvedActiveIndex}
                onActiveIndexChange={setActivePointIndex}
                locale={locale}
              />
            }
          />
        ) : null}
      </div>

      <Stats1RMOverlaySheets
        locale={locale}
        activeSheet={activeSheet}
        onClose={() => setActiveSheet(null)}
        exerciseQuery={exerciseQuery}
        onExerciseQueryChange={setExerciseQuery}
        filteredExerciseOptions={filteredExerciseOptions}
        programQuery={programQuery}
        onProgramQueryChange={setProgramQuery}
        filteredProgramOptions={filteredProgramOptions}
        optionsLoading={optionsLoading}
        rangeDraft={rangeDraft}
        onRangeDraftChange={(nextRangeDraft) => {
          setRangeDraft(nextRangeDraft);
          setRangeDraftError(null);
        }}
        rangeDraftError={rangeDraftError}
        applyRangeDraft={applyRangeDraft}
        canApplyRangeDraft={canApplyRangeDraft}
      />
    </div>
  );
});
