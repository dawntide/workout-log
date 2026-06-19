"use client";

import { useEffect, useState } from "react";
import {
  getThemeSkinSnapshot,
  subscribeThemeSkin,
} from "@/lib/settings/theme-skin-store";
import type { ThemeSkin } from "@/lib/settings/workout-preferences";

// SSR-safe 외부 스토어 구독.
// SSR + 첫 클라 렌더 = 항상 "paper"(=무 data-theme attribute와 일치, 하이드레이션 불일치 0).
// mount 후 store 실제값 반영 + 구독 → 스킨 변경 시 re-render.
// (useSyncExternalStore + getServerSnapshot 분기는 server="paper" vs client store="terminal"이
//  하이드레이션 중 진동하는 React 이슈가 있어 useState+useEffect 패턴으로 회피.)
export function useThemeSkin(): ThemeSkin {
  const [skin, setSkin] = useState<ThemeSkin>("paper");

  useEffect(() => {
    setSkin(getThemeSkinSnapshot());
    return subscribeThemeSkin(() => setSkin(getThemeSkinSnapshot()));
  }, []);

  return skin;
}
