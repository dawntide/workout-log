"use client";

import { useThemeSkin } from "@/components/use-theme-skin";
import { ExerciseCatalogContent } from "@/components/exercise-catalog/exercise-catalog-content";
import { ExerciseCatalogTuiView } from "@/components/exercise-catalog/exercise-catalog-tui-view";

// 운동 종목 관리 화면 래퍼 — skin 분기(program-store-screen 패턴). terminal이면 TUI 뷰,
// 아니면 기존 paper 컴포넌트를 그대로 mount(무수정). 두 뷰는 각자 데이터 로직을
// 보유하므로 한 번에 한쪽만 mount된다(paper 회귀 0).
export function ExerciseCatalogScreen() {
  const skin = useThemeSkin();
  if (skin === "terminal") {
    return <ExerciseCatalogTuiView />;
  }
  return <ExerciseCatalogContent />;
}
