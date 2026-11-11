"use client";

import { ExerciseCatalogContent } from "@/components/exercise-catalog/exercise-catalog-content";

export function ExerciseCatalogScreen({ canManage }: { canManage: boolean }) {
  return <ExerciseCatalogContent canManage={canManage} />;
}
