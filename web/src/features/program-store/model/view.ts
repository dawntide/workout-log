import type { ProgramListItem } from "@workout/core/program-store/model";

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
  items: ProgramListItem[],
  categoryFilter: string,
) {
  if (categoryFilter === "all") return items;
  return items.filter((item) => {
    const tags = (item.template.tags ?? []).map((tag) => tag.toLowerCase()).join(" ");
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
