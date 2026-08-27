/**
 * 최근 데이터 API 호출의 인메모리 링 버퍼.
 *
 * 폰에서는 devtools를 열 수 없어 "이 화면이 왜 비었나"를 확인할 방법이 없다. 전환 알약
 * 패널이 이 기록을 그대로 보여주므로, 화면을 떠나지 않고 방금 나간 요청과 그 결과를 본다.
 *
 * **메모리에만 산다.** 저장하지 않고 어디로도 보내지 않으며, 리로드하면 사라진다 —
 * 디버깅 보조지 텔레메트리가 아니다. 그래서 응답 본문도 담지 않는다(크고, 민감할 수 있고,
 * 여기서 답할 질문은 "무엇이 몇으로 얼마나 걸렸나"뿐이다).
 *
 * 범위는 `lib/api.ts`를 지나는 호출이다. 그 밖의 raw fetch(예: /api/auth/me)는 잡히지
 * 않는다 — 계측을 한 군데로 모으는 편이 낫고, 데이터 화면의 질문은 전부 이쪽을 지난다.
 */

export type ApiRequestLogEntry = {
  method: string;
  /** 쿼리스트링을 뗀 경로. 목록에서 눈으로 훑기 위한 것이라 길면 무의미하다. */
  path: string;
  /** 네트워크 자체가 실패하면(오프라인 등) null. */
  status: number | null;
  durationMs: number;
  at: number;
  ok: boolean;
};

const MAX_ENTRIES = 20;
const entries: ApiRequestLogEntry[] = [];
const listeners = new Set<() => void>();

function stripQuery(path: string): string {
  const index = path.indexOf("?");
  return index < 0 ? path : path.slice(0, index);
}

export function recordApiRequest(entry: {
  method: string;
  path: string;
  status: number | null;
  durationMs: number;
  ok: boolean;
}): void {
  entries.unshift({
    method: entry.method,
    path: stripQuery(entry.path),
    status: entry.status,
    durationMs: Math.round(entry.durationMs),
    ok: entry.ok,
    at: Date.now(),
  });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  for (const listener of listeners) listener();
}

/** 최신이 앞에 온다. */
export function getApiRequestLog(): ApiRequestLogEntry[] {
  return entries.slice();
}

export function clearApiRequestLog(): void {
  entries.length = 0;
  for (const listener of listeners) listener();
}

export function subscribeApiRequestLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
