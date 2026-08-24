"use client";

import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useLocale } from "@/components/locale-provider";
import { workoutPreferencesAtom } from "@/features/workout-log/store/workout-log-atoms";
import type { WorkoutExerciseViewModel } from "@/lib/workout-record/model";
import { breakdownPlates, formatPerSide } from "@workout/core/plate-breakdown";

/**
 * 운동 하나의 전 세트를 원판 조합으로 분해해 보여주는 읽기 전용 시트.
 *
 * 진입점을 세트 행이 아니라 운동 카드에 둔 이유는 두 가지다. 세트 행 5열 그리드를
 * 건드리면 로깅 입력 동선(1탭 완료)에 영향이 가고, 램프 처방처럼 세트마다 무게가
 * 다른 경우를 한 화면에서 보는 편이 낫기 때문이다(계획서 §3.4).
 */
export function PlateBreakdownSheet({
  open,
  onClose,
  exercise,
}: {
  open: boolean;
  onClose: () => void;
  exercise: WorkoutExerciseViewModel;
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const preferences = useAtomValue(workoutPreferencesAtom);

  const rows = useMemo(() => {
    const weights = exercise.set.weightKgPerSet ?? [];
    const inventory = {
      barWeightKg: preferences.plateBarWeightKg,
      platesKg: preferences.platePlatesKg,
    };
    return weights.map((weightKg, index) => ({
      setIndex: index,
      weightKg,
      result: breakdownPlates(weightKg, inventory),
    }));
  }, [exercise.set.weightKgPerSet, preferences.plateBarWeightKg, preferences.platePlatesKg]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={ko ? "원판 계산" : "Plate Breakdown"}
      description={exercise.exerciseName}
      closeLabel={ko ? "닫기" : "Close"}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-3)" }}>
        <div
          style={{
            background: "var(--v2-paper)",
            borderRadius: "var(--v2-r-4)",
            padding: "var(--v2-s-4)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-2)",
          }}
        >
          {rows.map((row) => (
            <div
              key={row.setIndex}
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: "var(--v2-s-3)",
              }}
            >
              <span className="v2-mono-label" style={{ color: "var(--v2-ink-3)", flexShrink: 0 }}>
                {ko ? `세트 ${row.setIndex + 1}` : `Set ${row.setIndex + 1}`}
              </span>
              <span
                className="v2-body"
                style={{ color: "var(--v2-c-weight)", fontWeight: 700, flexShrink: 0 }}
              >
                {row.weightKg} kg
              </span>
              <span
                className="v2-mono-label"
                style={{
                  color:
                    row.result.kind === "nearest" ? "var(--v2-c-warning)" : "var(--v2-ink-2)",
                  textAlign: "right",
                  minWidth: 0,
                }}
              >
                {row.result.kind === "below-bar"
                  ? ko
                    ? `빈 바(${row.result.barWeightKg}kg)보다 가벼움`
                    : `Lighter than the ${row.result.barWeightKg} kg bar`
                  : formatPerSide(row.result.perSide) || (ko ? "바만" : "Bar only")}
                {row.result.kind === "nearest" ? (
                  <span style={{ display: "block", color: "var(--v2-ink-3)" }}>
                    {ko ? `→ ${row.result.totalKg}kg 가능` : `→ ${row.result.totalKg} kg`}
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </div>

        <p
          className="v2-small"
          style={{ margin: 0, color: "var(--v2-ink-3)", padding: "0 var(--v2-s-2)" }}
        >
          {ko
            ? `바 ${preferences.plateBarWeightKg}kg 기준, 한쪽에 끼울 원판입니다. 바·원판 설정에서 바꿀 수 있습니다.`
            : `Plates per side, assuming a ${preferences.plateBarWeightKg} kg bar. Change this in Bar & Plates settings.`}
        </p>
      </div>
    </BottomSheet>
  );
}
