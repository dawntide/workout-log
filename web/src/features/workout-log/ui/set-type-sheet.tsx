"use client";

import { useLocale } from "@/components/locale-provider";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { V2SelectableRow } from "@/components/v2/primitives/selectable-row";
import type { WorkoutSetType } from "@workout/core/workout-set-type";

/**
 * 세트 하나의 타입(작업/웜업/실패)을 고르는 시트.
 *
 * 팝오버가 아니라 시트인 이유는 두 가지다. 이 리포에는 "작은 목록에서 하나 고르기"
 * 역할의 단일 소스가 BottomSheet라 새 프리미티브를 만들 이유가 없고(Hard Rule 5),
 * 무엇보다 **웜업의 의미가 자명하지 않다** — 태그를 달면 그 세트가 볼륨·1RM·진행
 * 판정에서 통째로 빠진다. 한 줄 설명을 붙일 자리가 필요하다.
 */

export type SetTypeOption = {
  value: WorkoutSetType | null;
  label: { ko: string; en: string };
  hint: { ko: string; en: string };
};

export const SET_TYPE_OPTIONS: readonly SetTypeOption[] = [
  {
    value: null,
    label: { ko: "작업 세트", en: "Working set" },
    hint: { ko: "통계와 진행 판정에 모두 반영된다", en: "Counts toward stats and progression" },
  },
  {
    value: "WARMUP",
    label: { ko: "웜업", en: "Warm-up" },
    hint: {
      ko: "볼륨·추정 1RM·진행 판정에서 제외된다",
      en: "Excluded from volume, e1RM, and progression",
    },
  },
  {
    value: "FAILURE",
    label: { ko: "실패", en: "Failure" },
    hint: {
      ko: "통계에는 그대로 남고 진행 판정에서만 신호로 쓴다",
      en: "Stays in stats; only signals progression",
    },
  },
];

export function SetTypeSheet({
  open,
  onClose,
  setNumber,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  setNumber: number;
  value: WorkoutSetType | null;
  onChange: (next: WorkoutSetType | null) => void;
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={ko ? "세트 타입" : "Set type"}
      description={ko ? `${setNumber}세트` : `Set ${setNumber}`}
      closeLabel={ko ? "닫기" : "Close"}
    >
      <div
        role="radiogroup"
        aria-label={ko ? "세트 타입" : "Set type"}
        style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}
      >
        {SET_TYPE_OPTIONS.map((option) => (
          <V2SelectableRow
            key={option.value ?? "WORKING"}
            selected={value === option.value}
            title={ko ? option.label.ko : option.label.en}
            description={ko ? option.hint.ko : option.hint.en}
            onClick={() => {
              onChange(option.value);
              onClose();
            }}
          />
        ))}
      </div>
    </BottomSheet>
  );
}
