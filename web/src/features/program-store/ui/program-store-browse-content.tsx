"use client";

import { SearchInput } from "@/components/ui/search-input";
import { V2PrimaryBtn, V2SecondaryBtn } from "@/components/v2/primitives";
import { AppPage, PageHeader, PageSection, StateBlock } from "@/components/ui/page-layout";
import type { ProgramListItem } from "@/lib/program-store/model";
import { ProgramListCard } from "./program-list-card";

type ProgramStoreCopy = {
  eyebrow: string;
  title: string;
  description: string;
  loadError: string;
  notice: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  emptySearch: string;
  emptySearchDescription: string;
};

type CategoryOption = {
  key: string;
  label: string;
};

type ProgramStoreBrowseContentProps = {
  locale: "ko" | "en";
  copy: ProgramStoreCopy;
  error: string | null;
  notice: string | null;
  storeQuery: string;
  categoryFilter: string;
  listItems: ProgramListItem[];
  filteredListItems: ProgramListItem[];
  categoryFilteredItems: ProgramListItem[];
  marketListItems: ProgramListItem[];
  customListItems: ProgramListItem[];
  customProgramCount: number;
  categoryOptions: readonly CategoryOption[];
  isStoreSettled: boolean;
  hasStoreQuery: boolean;
  onRetry: () => void;
  onChangeStoreQuery: (value: string) => void;
  onChangeCategoryFilter: (key: string) => void;
  onSelectItem: (item: ProgramListItem) => void;
  onOpenCreateSheet: () => void;
};

export function ProgramStoreBrowseContent({
  locale,
  copy,
  error,
  notice,
  storeQuery,
  categoryFilter,
  listItems,
  filteredListItems,
  categoryFilteredItems,
  marketListItems,
  customListItems,
  customProgramCount,
  categoryOptions,
  isStoreSettled,
  hasStoreQuery,
  onRetry,
  onChangeStoreQuery,
  onChangeCategoryFilter,
  onSelectItem,
  onOpenCreateSheet,
}: ProgramStoreBrowseContentProps) {
  return (
    <AppPage>
      <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />

      {error ? (
        <StateBlock
          tone="danger"
          icon="warning"
          title={copy.loadError}
          description={error}
          action={(
            <V2SecondaryBtn onClick={onRetry}>
              {locale === "ko" ? "다시 시도" : "Retry"}
            </V2SecondaryBtn>
          )}
        />
      ) : null}

      {notice ? (
        <StateBlock
          tone="success"
          icon="check_circle"
          title={copy.notice}
          description={notice}
        />
      ) : null}

      {listItems.length > 0 || hasStoreQuery ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-4)",
          }}
        >
          <SearchInput
            value={storeQuery}
            onChange={onChangeStoreQuery}
            placeholder={copy.searchPlaceholder}
            ariaLabel={copy.searchAriaLabel}
          />

          {listItems.length > 0 ? (
            <div
              style={{
                display: "flex",
                gap: "var(--v2-s-2)",
                overflowX: "auto",
                paddingBottom: "var(--v2-s-1)",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {categoryOptions.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => onChangeCategoryFilter(category.key)}
                  style={{
                    padding: "var(--v2-s-2) var(--v2-s-5)",
                    border: "none",
                    borderRadius: "var(--v2-r-pill)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    fontFamily: "var(--font-label-family)",
                    fontSize: "var(--v2-t-label)",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    flexShrink: 0,
                    background:
                      categoryFilter === category.key
                        ? "var(--v2-accent-weak)"
                        : "var(--v2-paper)",
                    color:
                      categoryFilter === category.key
                        ? "var(--v2-accent-ink)"
                        : "var(--v2-ink-2)",
                    boxShadow:
                      categoryFilter === category.key
                        ? "0 10px 20px color-mix(in srgb, var(--shadow-color-soft) 68%, transparent)"
                        : "none",
                  }}
                >
                  {category.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {isStoreSettled && !error && listItems.length > 0 && filteredListItems.length === 0 ? (
        <StateBlock
          title={copy.emptySearch}
          description={copy.emptySearchDescription}
          tone="accent"
          icon="search_off"
        />
      ) : null}

      {isStoreSettled &&
      !error &&
      filteredListItems.length > 0 &&
      categoryFilteredItems.length === 0 ? (
        <StateBlock
          title={locale === "ko" ? "해당 카테고리의 프로그램이 없습니다" : "No programs in this category"}
          description={
            locale === "ko"
              ? "다른 카테고리를 선택하거나 전체를 확인해 보세요."
              : "Try a different category or browse all programs."
          }
          tone="neutral"
          icon="playlist_remove"
        />
      ) : null}

      {!hasStoreQuery || marketListItems.length > 0 || (isStoreSettled && listItems.length === 0) ? (
        <PageSection title={locale === "ko" ? "공식 프로그램" : "Official Programs"}>
          {isStoreSettled && !error && !hasStoreQuery && marketListItems.length === 0 ? (
            <StateBlock
              title={locale === "ko" ? "표시할 프로그램이 없습니다" : "No programs to show"}
              description={
                locale === "ko"
                  ? "새 시드나 공개 템플릿이 추가되면 이 영역에 나타납니다."
                  : "Seeded and public templates will appear here when available."
              }
              icon="inventory_2"
            />
          ) : null}
          {marketListItems.length > 0 ? (
            <div>
              {marketListItems.map((item) => (
                <ProgramListCard
                  key={item.key}
                  item={item}
                  locale={locale}
                  onPress={() => onSelectItem(item)}
                />
              ))}
            </div>
          ) : null}
        </PageSection>
      ) : null}

      {customListItems.length > 0 || (!hasStoreQuery && customProgramCount > 0) ? (
        <PageSection title={locale === "ko" ? "내 프로그램" : "My Programs"}>
          <div>
            {customListItems.map((item) => (
              <ProgramListCard
                key={item.key}
                item={item}
                locale={locale}
                onPress={() => onSelectItem(item)}
              />
            ))}
          </div>
        </PageSection>
      ) : null}

      <PageSection
        title={locale === "ko" ? "프로그램 만들기" : "Create Program"}
        description={
          locale === "ko"
            ? "기존 구조를 복제하거나 새 프로그램을 직접 구성할 수 있습니다."
            : "Clone an existing structure or build a brand new program from scratch."
        }
      >
        <StateBlock
          tone="accent"
          icon="add_circle"
          title={locale === "ko" ? "새 프로그램 만들기" : "Create a New Program"}
          description={
            locale === "ko"
              ? "기존 프로그램을 바탕으로 시작하거나 직접 새 구조를 만드세요."
              : "Start from an existing program or build a fresh structure from scratch."
          }
          action={(
            <V2PrimaryBtn full onClick={onOpenCreateSheet}>
              {locale === "ko" ? "프로그램 만들기" : "Create Program"}
            </V2PrimaryBtn>
          )}
        />
      </PageSection>
    </AppPage>
  );
}
