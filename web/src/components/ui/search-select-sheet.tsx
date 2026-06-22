"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";
import type { BottomSheetPrimaryAction } from "@/components/ui/bottom-sheet-action-header";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { SearchInput } from "@/components/ui/search-input";
import { V2Icon } from "@/components/v2/primitives/v2-icon";

export type SearchSelectOption = {
  key: string;
  label: ReactNode;
  onSelect: () => void;
  active?: boolean;
  ariaCurrent?: boolean;
};

type SearchSelectComboboxProps = {
  label?: string;
  query: string;
  placeholder: string;
  onQueryChange: (value: string) => void;
  onQuerySubmit?: () => void;
  onClearQuery?: () => void;
  resultsAriaLabel: string;
  options: SearchSelectOption[];
  emptyText: string;
  loading?: boolean;
  loadingText?: string;
  selectionSummary?: ReactNode;
  hideOptions?: boolean;
};

type SearchSelectSheetProps = SearchSelectComboboxProps & {
  open: boolean;
  title: string;
  onClose: () => void;
  description?: string;
  closeLabel?: string;
  header?: ReactNode;
  primaryAction?: BottomSheetPrimaryAction | null;
  footer?: ReactNode;
  children?: ReactNode;
};

export function SearchSelectCombobox({
  label,
  query,
  placeholder,
  onQueryChange,
  onQuerySubmit,
  onClearQuery,
  resultsAriaLabel,
  options,
  emptyText,
  loading = false,
  loadingText,
  selectionSummary,
  hideOptions = false,
}: SearchSelectComboboxProps) {
  const { locale } = useLocale();
  const resolvedLoadingText = loadingText ?? (locale === "ko" ? "검색 중..." : "Searching...");
  return (
    <label>
      {label ? <span>{label}</span> : null}
      <div data-no-swipe="true">
        <SearchInput
          value={query}
          onChange={onQueryChange}
          onClear={onClearQuery}
          placeholder={placeholder}
          ariaLabel={label || placeholder}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || !onQuerySubmit) return;
            event.preventDefault();
            onQuerySubmit();
          }}
        />

        {selectionSummary}

        {!hideOptions ? (
          <div
            role="listbox"
            aria-label={resultsAriaLabel}
            style={{ display: "flex", flexDirection: "column", gap: 2, height: "300px", overflowY: "auto", marginTop: "var(--v2-s-2)" }}
          >
            {loading ? (
              <span className="v2-small" style={{ padding: "var(--v2-s-4)", textAlign: "center", color: "var(--v2-ink-2)" }}>{resolvedLoadingText}</span>
            ) : options.length === 0 ? (
              <span className="v2-small" style={{ padding: "var(--v2-s-4)", textAlign: "center", color: "var(--v2-ink-2)" }}>{emptyText}</span>
            ) : (
              options.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-current={option.ariaCurrent ? "true" : undefined}
                  onClick={option.onSelect}
                  className="v2-pressable v2-body"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    padding: "var(--v2-s-3)",
                    boxShadow: option.active ? "inset 0 0 0 2px var(--v2-accent)" : "none",
                    border: "none",
                    borderRadius: "var(--v2-r-2)",
                    backgroundColor: option.active ? "var(--v2-accent-weak)" : "transparent",
                    color: option.active ? "var(--v2-accent-ink)" : "var(--v2-ink)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontWeight: option.active ? 700 : 500,
                    transition: "background-color 0.12s ease",
                  }}
                >
                  <span style={{ flex: 1 }}>{option.label}</span>
                  {option.active && (
                    <V2Icon name="check" fill weight={500} style={{ fontSize: "var(--v2-t-18)", flexShrink: 0, color: "var(--v2-accent)" }} />
                  )}
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    </label>
  );
}

export function SearchSelectSheet({
  open,
  title,
  onClose,
  description,
  closeLabel,
  header,
  primaryAction,
  footer,
  children,
  ...comboboxProps
}: SearchSelectSheetProps) {
  const { locale } = useLocale();
  const resolvedCloseLabel = closeLabel ?? (locale === "ko" ? "닫기" : "Close");
  return (
    <BottomSheet
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      closeLabel={resolvedCloseLabel}
      header={header}
      primaryAction={primaryAction}
      footer={footer}
    >
      <div style={{ padding: "var(--v2-s-1) 2px 0px 2px" }}>
        <SearchSelectCombobox {...comboboxProps} />
        {children}
      </div>
    </BottomSheet>
  );
}
