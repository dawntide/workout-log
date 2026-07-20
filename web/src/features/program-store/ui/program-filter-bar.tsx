"use client";

import { V2Chip, V2SecondaryBtn } from "@/components/v2/primitives";
import {
  programFacetValueLabel,
  type ProgramFacetGroup,
  type ProgramFacetKey,
  type ProgramFacetSelection,
} from "@workout/core/program-store/facets";

type ProgramFilterBarProps = {
  locale: "ko" | "en";
  groups: ProgramFacetGroup[];
  selection: ProgramFacetSelection;
  selectedCount: number;
  onOpenSheet: () => void;
  onToggle: (key: ProgramFacetKey, value: string) => void;
};

/**
 * Filter trigger plus the currently applied values. The chips exist so an
 * active filter is visible without opening the sheet — otherwise a short list
 * looks like missing data rather than a filtered result.
 */
export function ProgramFilterBar({
  locale,
  groups,
  selection,
  selectedCount,
  onOpenSheet,
  onToggle,
}: ProgramFilterBarProps) {
  const ko = locale === "ko";
  if (groups.length === 0) return null;

  const active = groups.flatMap((group) =>
    (selection[group.key] ?? []).map((value) => ({
      key: group.key,
      value,
      label: programFacetValueLabel(group.key, value, locale),
    })),
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--v2-s-2)",
        overflowX: "auto",
        paddingBottom: "var(--v2-s-1)",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <V2SecondaryBtn icon="tune" onClick={onOpenSheet}>
          {selectedCount > 0
            ? ko
              ? `필터 ${selectedCount}`
              : `Filters ${selectedCount}`
            : ko
              ? "필터"
              : "Filters"}
        </V2SecondaryBtn>
      </div>

      {active.map((entry) => (
        <button
          key={`${entry.key}:${entry.value}`}
          type="button"
          onClick={() => onToggle(entry.key, entry.value)}
          aria-label={ko ? `${entry.label} 필터 제거` : `Remove ${entry.label} filter`}
          className="v2-pressable"
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            minHeight: "var(--v2-touch)",
            display: "inline-flex",
            alignItems: "center",
            flexShrink: 0,
            cursor: "pointer",
          }}
        >
          <V2Chip tone="accent" icon="close">
            {entry.label}
          </V2Chip>
        </button>
      ))}
    </div>
  );
}
