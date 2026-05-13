"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";
import type { BottomSheetPrimaryAction } from "@/components/ui/bottom-sheet-action-header";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { SearchInput } from "@/components/ui/search-input";

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
            style={{ display: "flex", flexDirection: "column", gap: "2px", height: "300px", overflowY: "auto", marginTop: "var(--v2-s-2)" }}
          >
            {loading ? (
              <span style={{ padding: "var(--v2-s-4)", textAlign: "center", color: "var(--v2-ink-2)", fontSize: "13px" }}>{resolvedLoadingText}</span>
            ) : options.length === 0 ? (
              <span style={{ padding: "var(--v2-s-4)", textAlign: "center", color: "var(--v2-ink-2)", fontSize: "13px" }}>{emptyText}</span>
            ) : (
              options.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-current={option.ariaCurrent ? "true" : undefined}
                  onClick={option.onSelect}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    padding: "11px 12px",
                    border: option.active ? "1px solid var(--v2-accent)" : "1px solid transparent",
                    borderRadius: "10px",
                    backgroundColor: option.active ? "var(--v2-accent-weak)" : "transparent",
                    color: option.active ? "var(--v2-accent-ink)" : "var(--v2-ink)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "14px",
                    fontWeight: option.active ? 700 : 500,
                    letterSpacing: option.active ? "-0.1px" : "0",
                    transition: "background-color 0.12s ease",
                  }}
                >
                  <span style={{ flex: 1 }}>{option.label}</span>
                  {option.active && (
                    <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: "'FILL' 1, 'wght' 500", flexShrink: 0, color: "var(--v2-accent)" }}>check</span>
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
      <div style={{ padding: "4px 2px 0 2px" }}>
        <SearchSelectCombobox {...comboboxProps} />
        {children}
      </div>
    </BottomSheet>
  );
}
