import type { ThemeSkin } from "./workout-preferences";

// 모듈 전역 스토어 — terminal/paper 스킨을 React에 반응형으로 노출(useSyncExternalStore).
// applyThemeSkinToDocument(workout-preferences)가 DOM attribute set과 함께 여기를 갱신
// → 단일 write 경로(boot·서버 sync·설정 토글 모두 lockstep).
// 초기값 "paper"(=SSR/무attribute와 일치) → 클라 mount 후 ThemePreferenceSync가 flip하므로
// 하이드레이션 불일치 없음(첫 클라 렌더 = SSR = paper). 색은 boot가 선반영이라 색 flash 없음.
// 서버에선 applyThemeSkinToDocument가 document 없으면 early-return → setThemeSkin 미호출 → current 불변(요청 간 누수 없음).

let current: ThemeSkin = "paper";
const listeners = new Set<() => void>();

export function setThemeSkin(skin: ThemeSkin): void {
  if (skin === current) return;
  current = skin;
  for (const listener of listeners) listener();
}

export function getThemeSkinSnapshot(): ThemeSkin {
  return current;
}

export function subscribeThemeSkin(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
