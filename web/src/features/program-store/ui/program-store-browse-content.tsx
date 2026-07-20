"use client";

import { SearchInput } from "@/components/ui/search-input";
import { V2PrimaryBtn, V2SecondaryBtn, V2SectionHeader } from "@/components/v2/primitives";
import { AppPage, PageSection, StateBlock } from "@/components/ui/page-layout";
import type {
  ProgramFacetGroup,
  ProgramFacetKey,
  ProgramFacetSelection,
} from "@workout/core/program-store/facets";
import type { ProgramStoreListItem } from "@/features/program-store/model/view";
import { ProgramListCard } from "./program-list-card";
import { ProgramFilterBar } from "./program-filter-bar";

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

type ProgramStoreBrowseContentProps = {
  locale: "ko" | "en";
  copy: ProgramStoreCopy;
  error: string | null;
  notice: string | null;
  storeQuery: string;
  listItems: ProgramStoreListItem[];
  filteredListItems: ProgramStoreListItem[];
  facetFilteredItems: ProgramStoreListItem[];
  marketListItems: ProgramStoreListItem[];
  customListItems: ProgramStoreListItem[];
  customProgramCount: number;
  facetGroups: ProgramFacetGroup[];
  facetSelection: ProgramFacetSelection;
  selectedFacetCount: number;
  isStoreSettled: boolean;
  hasStoreQuery: boolean;
  onRetry: () => void;
  onChangeStoreQuery: (value: string) => void;
  onOpenFilterSheet: () => void;
  onToggleFacet: (key: ProgramFacetKey, value: string) => void;
  onResetFacets: () => void;
  onSelectItem: (item: ProgramStoreListItem) => void;
  onOpenCreateSheet: () => void;
};

export function ProgramStoreBrowseContent({
  locale,
  copy,
  error,
  notice,
  storeQuery,
  listItems,
  filteredListItems,
  facetFilteredItems,
  marketListItems,
  customListItems,
  customProgramCount,
  facetGroups,
  facetSelection,
  selectedFacetCount,
  isStoreSettled,
  hasStoreQuery,
  onRetry,
  onChangeStoreQuery,
  onOpenFilterSheet,
  onToggleFacet,
  onResetFacets,
  onSelectItem,
  onOpenCreateSheet,
}: ProgramStoreBrowseContentProps) {
  return (
    <AppPage>
      <V2SectionHeader
        level="h1"
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        action={(
          <V2SecondaryBtn icon="add" onClick={onOpenCreateSheet}>
            {locale === "ko" ? "프로그램 만들기" : "Create Program"}
          </V2SecondaryBtn>
        )}
      />

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
            <ProgramFilterBar
              locale={locale}
              groups={facetGroups}
              selection={facetSelection}
              selectedCount={selectedFacetCount}
              onOpenSheet={onOpenFilterSheet}
              onToggle={onToggleFacet}
            />
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
      facetFilteredItems.length === 0 ? (
        <StateBlock
          title={
            locale === "ko"
              ? "조건에 맞는 프로그램이 없습니다"
              : "No programs match these filters"
          }
          description={
            locale === "ko"
              ? "조건을 하나씩 빼면 결과가 넓어집니다."
              : "Removing a filter or two will widen the results."
          }
          tone="neutral"
          icon="playlist_remove"
          action={(
            <V2SecondaryBtn onClick={onResetFacets}>
              {locale === "ko" ? "필터 초기화" : "Clear filters"}
            </V2SecondaryBtn>
          )}
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
