"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getThemeSkinSnapshot,
  subscribeThemeSkin,
} from "@/lib/settings/theme-skin-store";
import {
  DEFAULT_THEME_SKIN,
  type ThemeSkin,
} from "@/lib/settings/workout-preferences";

// 서버가 wl_skin 쿠키로 확정한 초기 skin을 첫 렌더에 주입하는 컨텍스트.
// SSR·하이드레이션 첫 렌더가 동일 값을 읽어 하이드레이션 불일치 0.
// Provider 밖에서 useThemeSkin을 쓰면 default "paper"(예: <body> 직속 FontStylesheetLoader) —
// 구 동작과 동일하게 mount 후 store로 flip(문제되지 않음: 폰트 지연로드는 F2 의도).
const InitialSkinContext = createContext<ThemeSkin>(DEFAULT_THEME_SKIN);

export function ThemeSkinProvider({
  initialSkin,
  children,
}: {
  initialSkin: ThemeSkin;
  children: ReactNode;
}) {
  return (
    <InitialSkinContext.Provider value={initialSkin}>
      {children}
    </InitialSkinContext.Provider>
  );
}

// SSR-safe 외부 스토어 구독.
// 첫 렌더 = 컨텍스트 initialSkin(서버 쿠키 확정값). terminal 사용자는 첫 렌더부터 terminal 셸을
//   그려 per-load paper→terminal remount + flash가 사라진다.
// mount 후 store 실제값 반영 + 구독(설정 토글 시 재렌더). 정상 경로(쿠키==localStorage)에선
//   store가 이미 같은 값이라 no-op; 불일치(크로스디바이스/최초 마이그레이션)면 1회만 reconcile하고
//   applyThemeSkinToDocument가 쿠키를 수렴시켜 다음 로드부터 0.
// (useSyncExternalStore + getServerSnapshot 분기는 server="paper" vs client store 값이
//  하이드레이션 중 진동하는 React 이슈가 있어 useState+useEffect 패턴 유지.)
export function useThemeSkin(): ThemeSkin {
  const initialSkin = useContext(InitialSkinContext);
  const [skin, setSkin] = useState<ThemeSkin>(initialSkin);

  useEffect(() => {
    setSkin(getThemeSkinSnapshot());
    return subscribeThemeSkin(() => setSkin(getThemeSkinSnapshot()));
  }, []);

  return skin;
}
