/**
 * 공개 API HTTP 클라이언트.
 *
 * **core를 import하지 않는다.** MCP 서버는 HTTP 경계 밖에 있어야 배포·버전이
 * 독립적이고, 도메인 로직이 두 곳으로 갈라지지 않는다(계획서 §6-3).
 * 여기 있는 것은 fetch 래퍼뿐이다.
 */

export type WorkoutApiConfig = {
  baseUrl: string;
  token: string;
};

export class WorkoutApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "WorkoutApiError";
  }
}

const DEFAULT_BASE_URL = "https://workout-log-eight.vercel.app";

export function readConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WorkoutApiConfig {
  const token = (env.WORKOUT_LOG_TOKEN ?? "").trim();
  if (!token) {
    throw new Error(
      "WORKOUT_LOG_TOKEN이 필요합니다. 앱의 설정 > 계정 > 액세스 토큰에서 발급하세요.",
    );
  }
  if (!token.startsWith("wlpat_")) {
    // 세션 토큰을 넣으면 전 경로가 열린다 — MCP가 쓰라고 만든 자격증명이 아니다.
    throw new Error(
      "WORKOUT_LOG_TOKEN이 개인 액세스 토큰이 아닙니다(wlpat_로 시작해야 합니다).",
    );
  }
  return {
    baseUrl: (env.WORKOUT_LOG_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    token,
  };
}

/** 상태 코드를 **사람이 고칠 수 있는 문장**으로 바꾼다. LLM이 이걸 그대로 읽는다. */
function explain(status: number, path: string, body: string): string {
  if (status === 401) {
    return `401 — 토큰이 유효하지 않거나 ${path}가 공개 표면 밖입니다. 폐기된 토큰이거나, 이 경로는 앱에서만 쓸 수 있습니다.`;
  }
  if (status === 403) {
    return `403 — 이 토큰은 읽기 전용입니다. 쓰기가 필요하면 read_write 스코프로 새로 발급하세요.`;
  }
  if (status === 429) {
    return `429 — 요청이 너무 잦습니다(읽기 120/분, 쓰기 30/분). 잠시 뒤 다시 시도하세요.`;
  }
  return `${status} — ${body.slice(0, 300)}`;
}

export async function apiRequest<T>(
  config: WorkoutApiConfig,
  method: "GET" | "POST" | "PATCH",
  path: string,
  options: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
): Promise<T> {
  const url = new URL(config.baseUrl + path);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    throw new WorkoutApiError(
      response.status,
      explain(response.status, path, await response.text().catch(() => "")),
    );
  }
  return (await response.json()) as T;
}
