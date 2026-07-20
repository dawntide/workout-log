"use client";

import dynamic from "next/dynamic";

import {
  V2PrimaryBtn,
  V2SecondaryBtn,
  V2SectionHeader,
  V2SelectableRow,
} from "@/components/v2/primitives";
import type {
  ProgramFacetGroup,
  ProgramFacetKey,
  ProgramFacetSelection,
} from "@workout/core/program-store/facets";

const BottomSheet = dynamic(
  () => import("@/components/ui/bottom-sheet").then((mod) => mod.BottomSheet),
  { ssr: false },
);

type ProgramFilterSheetProps = {
  open: boolean;
  locale: "ko" | "en";
  groups: ProgramFacetGroup[];
  selection: ProgramFacetSelection;
  /** How many programs the current selection leaves. */
  resultCount: number;
  hasSelection: boolean;
  onToggle: (key: ProgramFacetKey, value: string) => void;
  onReset: () => void;
  onClose: () => void;
};

export function ProgramFilterSheet({
  open,
  locale,
  groups,
  selection,
  resultCount,
  hasSelection,
  onToggle,
  onReset,
  onClose,
}: ProgramFilterSheetProps) {
  const ko = locale === "ko";

  const footer = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--v2-s-2)",
        paddingTop: "var(--v2-s-1)",
      }}
    >
      {/* The count is the point: with several axes it is easy to filter down to
          nothing, and reading that here beats closing onto an empty list. */}
      <V2PrimaryBtn full onClick={onClose}>
        {ko ? `${resultCount}개 프로그램 보기` : `Show ${resultCount} programs`}
      </V2PrimaryBtn>
      {hasSelection ? (
        <V2SecondaryBtn full onClick={onReset}>
          {ko ? "필터 초기화" : "Clear all"}
        </V2SecondaryBtn>
      ) : null}
    </div>
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      closeLabel={ko ? "닫기" : "Close"}
      title={ko ? "필터" : "Filters"}
      description={
        ko
          ? "같은 항목에서 여러 개를 고를 수 있고, 항목끼리는 모두 만족하는 프로그램만 남습니다."
          : "Pick several within a group; programs must satisfy every group you use."
      }
      footer={footer}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-5)" }}>
        {groups.map((group) => (
          <section key={group.key}>
            <V2SectionHeader level="h3" title={group.label} />
            {group.options.map((option) => (
              <V2SelectableRow
                key={option.value}
                mode="multi"
                selected={(selection[group.key] ?? []).includes(option.value)}
                onClick={() => onToggle(group.key, option.value)}
                title={option.label}
              />
            ))}
          </section>
        ))}
      </div>
    </BottomSheet>
  );
}
