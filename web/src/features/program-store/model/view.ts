import {
  getProgramScheduleLabel,
  type ProgramListItem,
} from "@workout/core/program-store/model";

export const WENDLER_531_VARIANT_SLUGS = [
  "wendler-531",
  "wendler-531-fsl",
  "wendler-531-bbb",
] as const;

type Wendler531VariantSlug = (typeof WENDLER_531_VARIANT_SLUGS)[number];

export type ProgramStoreListItem = ProgramListItem & {
  variants?: ProgramListItem[];
};

const WENDLER_531_VARIANT_ORDER = new Map<string, number>(
  WENDLER_531_VARIANT_SLUGS.map((slug, index) => [slug, index]),
);

function isWendler531VariantSlug(slug: string): slug is Wendler531VariantSlug {
  return WENDLER_531_VARIANT_ORDER.has(slug);
}

function isOfficialWendler531Variant(item: ProgramListItem) {
  return (
    item.source === "MARKET" && isWendler531VariantSlug(item.template.slug)
  );
}

function sortWendler531Variants(items: ProgramListItem[]) {
  return [...items].sort(
    (a, b) =>
      (WENDLER_531_VARIANT_ORDER.get(a.template.slug) ?? Number.MAX_SAFE_INTEGER) -
      (WENDLER_531_VARIANT_ORDER.get(b.template.slug) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function getWendler531VariantPresentation(
  slug: string,
  locale: "ko" | "en",
) {
  if (slug === "wendler-531-fsl") {
    return {
      label: "FSL",
      description:
        locale === "ko"
          ? "첫 작업 세트 중량으로 5×5 보조 세트를 추가합니다."
          : "Adds 5×5 assistance at the first working-set load.",
    };
  }
  if (slug === "wendler-531-bbb") {
    return {
      label: "BBB",
      description:
        locale === "ko"
          ? "훈련 최대 중량(TM)의 50%로 5×10 보조 세트를 추가합니다."
          : "Adds 5×10 assistance at 50% of the training max (TM).",
    };
  }
  return {
    label: locale === "ko" ? "기본" : "Base",
    description:
      locale === "ko"
        ? "보조 세트 없이 메인 5/3/1 세트만 수행합니다."
        : "Runs the main 5/3/1 sets without additional assistance.",
  };
}

export function groupProgramStoreListItems(
  items: ProgramListItem[],
  locale: "ko" | "en",
): ProgramStoreListItem[] {
  const variants = sortWendler531Variants(
    items.filter(isOfficialWendler531Variant),
  );
  if (variants.length !== WENDLER_531_VARIANT_SLUGS.length) return items;

  const variantIds = new Set(variants.map((variant) => variant.template.id));
  const firstVariantIndex = items.findIndex((item) =>
    variantIds.has(item.template.id),
  );
  const representative = variants[0]!;
  const variantLabels = variants.map(
    (variant) =>
      getWendler531VariantPresentation(variant.template.slug, locale).label,
  );
  const groupedItem: ProgramStoreListItem = {
    ...representative,
    key: "market-family-wendler-531",
    name: "Jim Wendler 5/3/1",
    subtitle:
      locale === "ko"
        ? `${variants.length}가지 방식 · ${variantLabels.join(" / ")}`
        : `${variants.length} variants · ${variantLabels.join(" / ")}`,
    description:
      locale === "ko"
        ? "동일한 4주 5/3/1 진행을 바탕으로 보조 운동 구성에 따라 기본·FSL·BBB 중 선택합니다."
        : "Choose Base, FSL, or BBB assistance while keeping the same four-week 5/3/1 progression.",
    variants,
  };

  return items.flatMap((item, index) => {
    if (index === firstVariantIndex) return [groupedItem];
    if (variantIds.has(item.template.id)) return [];
    return [item];
  });
}

function programListItemSearchText(
  item: ProgramListItem,
  locale: "ko" | "en",
) {
  const scheduleLabel = getProgramScheduleLabel(item.template, locale);
  const tags = Array.isArray(item.template.tags)
    ? item.template.tags.join(" ")
    : "";
  return normalizeSearchText(
    item.template.slug,
    formatProgramDisplayName(item.name),
    item.subtitle,
    item.description,
    scheduleLabel,
    tags,
  );
}

export function filterProgramListItemsBySearch(
  items: ProgramStoreListItem[],
  query: string,
  locale: "ko" | "en",
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return items;
  return items.filter((item) => {
    const searchableItems = item.variants ?? [item];
    return normalizeSearchText(
      programListItemSearchText(item, locale),
      ...searchableItems.map((variant) =>
        programListItemSearchText(variant, locale),
      ),
    ).includes(normalizedQuery);
  });
}

export function resolveProgramStoreSelection(
  item: ProgramStoreListItem,
  query: string,
  locale: "ko" | "en",
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery || !item.variants) return item;
  return (
    item.variants.find((variant) =>
      programListItemSearchText(variant, locale).includes(normalizedQuery),
    ) ?? item
  );
}

export function getProgramStoreDetailVariants(
  items: ProgramListItem[],
  item: ProgramListItem | null,
) {
  if (!item || !isOfficialWendler531Variant(item)) return item ? [item] : [];
  const variants = sortWendler531Variants(
    items.filter(isOfficialWendler531Variant),
  );
  return variants.length === WENDLER_531_VARIANT_SLUGS.length
    ? variants
    : [item];
}

export function storeCategories(locale: "ko" | "en") {
  return [
    { key: "all", label: locale === "ko" ? "전체" : "All" },
    { key: "strength", label: locale === "ko" ? "근력" : "Strength" },
    { key: "hypertrophy", label: locale === "ko" ? "근비대" : "Hypertrophy" },
    { key: "beginner", label: locale === "ko" ? "입문" : "Beginner" },
    { key: "endurance", label: locale === "ko" ? "지구력" : "Endurance" },
  ] as const;
}

export function formatProgramDisplayName(name: string) {
  return String(name)
    .replace(/\s*\(base[^)]*\)\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function normalizeSearchText(...values: Array<string | null | undefined>) {
  return values
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

export function filterProgramListItemsByCategory(
  items: ProgramStoreListItem[],
  categoryFilter: string,
) {
  if (categoryFilter === "all") return items;
  return items.filter((item) => {
    const tags = (item.variants ?? [item])
      .flatMap((entry) => entry.template.tags ?? [])
      .map((tag) => tag.toLowerCase())
      .join(" ");
    switch (categoryFilter) {
      case "strength":
        return tags.includes("strength") || tags.includes("근력") || tags.includes("power");
      case "hypertrophy":
        return tags.includes("hypertrophy") || tags.includes("근비대");
      case "beginner":
        return (
          tags.includes("beginner") ||
          tags.includes("novice") ||
          tags.includes("입문") ||
          tags.includes("초보")
        );
      case "endurance":
        return tags.includes("endurance") || tags.includes("지구력");
      default:
        return true;
    }
  });
}
