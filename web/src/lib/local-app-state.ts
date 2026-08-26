import { apiInvalidateCache } from "@/lib/api";

/**
 * 브라우저에 남는 사용자 범위 상태의 단일 목록.
 *
 * 앱 초기화(설정 → 데이터)와 계정 전환(관리자 → 테스트 계정)이 같은 것을 지워야 해서
 * 여기 하나로 둔다. 두 벌이 되면 한쪽에만 키가 추가되고 다른 쪽이 조용히 낡는다.
 */
const LOCAL_STORAGE_PREFIXES = ["workout-log.setting.v1."];
const LOCAL_STORAGE_KEYS = [
  "workout-log.pending-logs.v1",
  "workoutlog:ux-events",
  "workoutlog:ux-events-synced-ids",
  "workoutlog:focus-mode",
] as const;

/** 인메모리 API 캐시 + 사용자 범위 localStorage를 지운다(동기). */
export function clearLocalAppState(): void {
  apiInvalidateCache();
  if (typeof window === "undefined") return;

  try {
    const removeKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (LOCAL_STORAGE_KEYS.includes(key as (typeof LOCAL_STORAGE_KEYS)[number])) {
        removeKeys.push(key);
        continue;
      }
      if (LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        removeKeys.push(key);
      }
    }
    for (const key of removeKeys) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // noop
  }
}

/**
 * 계정이 바뀔 때 쓰는 완전 정리. **반드시 await한 뒤 리로드해야 한다.**
 *
 * `apiInvalidateCache()`의 IDB 삭제는 fire-and-forget이라, 곧바로 리로드하면 삭제가
 * 끝나기 전에 페이지가 죽고 웜업이 이전 계정의 캐시를 그대로 복원한다 — 새 계정 화면에
 * 남의 데이터가 뜨는 경로다. 그래서 여기서는 IDB·SW 캐시 삭제를 직접 기다린다.
 */
export async function clearClientStateForAccountSwitch(): Promise<void> {
  clearLocalAppState();
  if (typeof window === "undefined") return;

  try {
    const { idbDeleteEntries } = await import("@/lib/api-cache-idb");
    await idbDeleteEntries();
  } catch {
    // noop
  }

  // RSC 페이로드·페이지 응답에도 이전 계정의 부트스트랩 데이터가 실려 있다.
  try {
    if ("caches" in window) {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((key) => window.caches.delete(key)));
    }
  } catch {
    // noop
  }
}
