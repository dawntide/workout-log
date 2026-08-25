/**
 * PAT가 닿을 수 있는 **공개 표면**.
 *
 * 기본은 **거부**다. 세션(웹·TUI)은 내부 클라이언트라 전 경로를 쓰지만, PAT는 여기
 * 적힌 경로에만 닿는다. 계획서 §5는 이 강제를 PR2로 미뤘는데, 그러면 PR1 머지부터
 * PR2까지 **PAT가 `/api/auth/*`까지 열린 창**이 생긴다 — 그래서 발급과 같은 PR에서
 * 잠근다(§7 결정 7).
 *
 * ⚠️ **프로덕션 프로브로는 이 목록을 검증할 수 없다** — 미인증 요청은 프록시가 401로
 * 끊어 Hono까지 가지 않고, 존재하지 않는 경로도 401이다. 유닛이 유일한 방어선이다.
 */

import type { Context, Next } from "hono";

import { isApiTokenValue, verifyApiToken } from "@workout/core/auth/api-token";
import { logError } from "@workout/core/observability/logger";

import type { AppEnv } from "./auth";

export type ApiTokenScope = "read" | "read_write";

/** 경로 패턴. `:param`은 한 세그먼트와 매치한다. */
type SurfaceRule = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
};

/**
 * 읽기 표면 — `read`·`read_write` 토큰 둘 다 허용.
 *
 * 계획서 §7 결정 3(logs·stats·plans·exercises)에 `bodyweight`를 더했다. M2-1(#683)이
 * 추가한 경로라 계획서가 알 수 없었고, "내 데이터를 프로그램으로 읽는다"는 목적에
 * 정확히 들어맞는다. `export`는 PR2에서 판단한다 — 전량 덤프라 스코프 의미가 다르다.
 */
const READ_SURFACE: SurfaceRule[] = [
  { method: "GET", path: "/api/logs" },
  { method: "GET", path: "/api/logs/calendar" },
  { method: "GET", path: "/api/logs/:logId" },
  // stats는 **패턴이 아니라 전수 열거**다. `/api/stats/:metric` 한 줄로 묶으면
  // 나중에 추가되는 지표가 검토 없이 공개된다 — `ux-snapshot`(UX 텔레메트리)처럼
  // 사용자 데이터가 아닌 것도 있다.
  { method: "GET", path: "/api/stats/bundle" },
  { method: "GET", path: "/api/stats/e1rm" },
  { method: "GET", path: "/api/stats/prs" },
  { method: "GET", path: "/api/stats/strength-summary" },
  { method: "GET", path: "/api/stats/volume" },
  { method: "GET", path: "/api/stats/volume-series" },
  { method: "GET", path: "/api/plans" },
  { method: "GET", path: "/api/plans/:planId/cycle-overview" },
  { method: "GET", path: "/api/plans/:planId/progression-state" },
  { method: "GET", path: "/api/plans/:planId/generated-sessions/active" },
  { method: "GET", path: "/api/plans/:planId/generated-sessions/:sessionId" },
  { method: "GET", path: "/api/exercises" },
  { method: "GET", path: "/api/exercises/categories" },
  { method: "GET", path: "/api/bodyweight" },
  { method: "GET", path: "/api/home" },
];

/**
 * 쓰기 표면 — `read_write` 토큰만.
 *
 * 세션 기록이 목적이라 **생성·수정까지만** 연다. 삭제(`DELETE /api/logs/:logId`,
 * `DELETE /api/bodyweight/:id`)는 넣지 않는다 — 프로그램 실수의 손실이 되돌릴 수 없고,
 * MCP 도구 목록에 삭제가 있으면 LLM이 부를 수 있다.
 */
const WRITE_SURFACE: SurfaceRule[] = [
  { method: "POST", path: "/api/logs" },
  { method: "PATCH", path: "/api/logs/:logId" },
  { method: "POST", path: "/api/bodyweight" },
];

function matches(rule: SurfaceRule, method: string, pathname: string): boolean {
  if (rule.method !== method.toUpperCase()) return false;
  const ruleParts = rule.path.split("/");
  const pathParts = pathname.split("/");
  if (ruleParts.length !== pathParts.length) return false;
  return ruleParts.every(
    (part, index) => part.startsWith(":") || part === pathParts[index],
  );
}

export type SurfaceDecision =
  | { allowed: true }
  | { allowed: false; reason: "not_public" | "scope" };

/**
 * PAT 요청이 이 경로에 닿아도 되는지.
 *
 * 비공개 경로는 **404가 아니라 401**을 준다 — 존재 여부를 알려 주지 않는 것이
 * 목적이 아니라, 이 토큰으로는 인증되지 않는다는 사실이 정확한 답이다.
 */
export function decideApiTokenSurface(input: {
  method: string;
  pathname: string;
  scope: ApiTokenScope;
}): SurfaceDecision {
  const { method, pathname, scope } = input;
  if (READ_SURFACE.some((rule) => matches(rule, method, pathname))) {
    return { allowed: true };
  }
  if (WRITE_SURFACE.some((rule) => matches(rule, method, pathname))) {
    return scope === "read_write" ? { allowed: true } : { allowed: false, reason: "scope" };
  }
  return { allowed: false, reason: "not_public" };
}

/** 스냅샷·문서 생성용. 순서까지 포함해 목록을 노출한다. */
export function apiTokenSurfaceSnapshot(): { read: string[]; write: string[] } {
  return {
    read: READ_SURFACE.map((rule) => `${rule.method} ${rule.path}`),
    write: WRITE_SURFACE.map((rule) => `${rule.method} ${rule.path}`),
  };
}


/**
 * PAT 인증 + 공개 표면 강제. **앱 최상단 미들웨어다.**
 *
 * 라우터가 아니라 여기에 두는 이유: 대부분의 라우터가 `use("*", requireAuth)`로
 * 인증을 걸지만 그건 라우터마다 기억해야 하는 규약이고, 보안 경계를 규약에 맡기면
 * 새 라우터 하나가 잊는 순간 PAT에 열린다. 실제로 `/api/auth/me`·`/logout`은
 * `requireAuth`를 쓰지 않는다 — 여기서 막으면 그런 경로도 덮인다.
 *
 * **검증도 여기서 한 번만** 한다. 표면 판단에 스코프가 필요하고 스코프는 검증해야
 * 알 수 있으므로, 둘을 갈라 놓으면 DB를 두 번 타거나 한쪽이 스코프를 못 본다.
 * 결과는 컨텍스트에 실어 `requireAuth`가 재사용한다.
 *
 * 세션(웹·TUI)은 그냥 통과시킨다 — 내부 클라이언트라 표면 제한 대상이 아니다.
 */
export async function enforceApiTokenSurface(c: Context<AppEnv>, next: Next) {
  const auth = c.req.header("Authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return next();
  const token = auth.slice(7).trim();
  if (!isApiTokenValue(token)) return next();

  let verified: Awaited<ReturnType<typeof verifyApiToken>>;
  try {
    verified = await verifyApiToken(token);
  } catch (e) {
    // 세션 조회와 같은 이유로 503이다 — 일시 장애를 "폐기됨"으로 오해하면
    // 클라이언트가 멀쩡한 토큰을 버린다.
    logError("api.api_token_lookup_failed", { error: e });
    return c.json({ error: "Service temporarily unavailable" }, 503);
  }
  if (!verified) return c.json({ error: "Unauthorized" }, 401);

  const decision = decideApiTokenSurface({
    method: c.req.method,
    pathname: new URL(c.req.url).pathname,
    scope: verified.scope,
  });
  if (!decision.allowed) {
    return decision.reason === "scope"
      ? c.json({ error: "Token scope does not allow writes" }, 403)
      : c.json({ error: "Unauthorized" }, 401);
  }

  c.set("apiTokenUserId", verified.userId);
  c.set("apiTokenScope", verified.scope);
  return next();
}
