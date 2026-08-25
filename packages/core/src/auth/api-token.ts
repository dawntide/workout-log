import { and, desc, eq, isNull, or, sql, gt } from "drizzle-orm";

import { db } from "@workout/core/db/client";
import { authApiToken } from "@workout/core/db/schema";
import { generateAuthTokenPair, sha256Hex } from "./token";

/**
 * 개인 액세스 토큰(PAT).
 *
 * **평문은 발급 응답에서 한 번만 나간다.** 저장은 SHA-256 해시뿐이라 분실하면 재발급이
 * 유일한 방법이다 — `password_reset_token`·`email_verification_token`과 같은 패턴이고,
 * PAT는 만료가 nullable(무기한)이라 세션보다 장수명이므로 더 그렇다.
 */

/** 제시된 토큰의 종류를 가르는 접두사. DB가 아니라 **요청 값**을 보고 판별한다. */
export const API_TOKEN_PREFIX = "wlpat_";

export const API_TOKEN_SCOPES = ["read", "read_write"] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

/** 기본은 읽기다 — 쓰기는 명시 선택(계획서 §6-4). */
export const DEFAULT_API_TOKEN_SCOPE: ApiTokenScope = "read";

const NAME_MAX_LENGTH = 60;
/** 목록에 보여줄 앞자리 길이(접두사 + 6자). 평문 복원 용도가 아니다. */
const DISPLAY_PREFIX_CHARS = API_TOKEN_PREFIX.length + 6;

export type ApiTokenSummary = {
  tokenHash: string;
  tokenPrefix: string;
  name: string;
  scope: ApiTokenScope;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
};

export type IssuedApiToken = {
  /** 평문 — **이 응답에서만** 볼 수 있다. */
  token: string;
  summary: ApiTokenSummary;
};

export class ApiTokenValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiTokenValidationError";
  }
}

export function isApiTokenValue(token: string): boolean {
  return token.startsWith(API_TOKEN_PREFIX);
}

export function normalizeApiTokenScope(value: unknown): ApiTokenScope {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (API_TOKEN_SCOPES as readonly string[]).includes(normalized)
    ? (normalized as ApiTokenScope)
    : DEFAULT_API_TOKEN_SCOPE;
}

function normalizeName(value: unknown): string {
  const name = String(value ?? "").trim();
  if (!name) throw new ApiTokenValidationError("name is required");
  if (name.length > NAME_MAX_LENGTH) {
    throw new ApiTokenValidationError(`name must be ${NAME_MAX_LENGTH} characters or fewer`);
  }
  return name;
}

function normalizeExpiresAt(value: unknown, now: Date): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new ApiTokenValidationError("expiresAt must be a valid date");
  }
  if (date.getTime() <= now.getTime()) {
    throw new ApiTokenValidationError("expiresAt must be in the future");
  }
  return date;
}

function toSummary(row: {
  tokenHash: string;
  tokenPrefix: string;
  name: string;
  scope: string;
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
}): ApiTokenSummary {
  return {
    tokenHash: row.tokenHash,
    tokenPrefix: row.tokenPrefix,
    name: row.name,
    scope: normalizeApiTokenScope(row.scope),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
  };
}

export async function issueApiToken(input: {
  userId: string;
  name: unknown;
  scope?: unknown;
  expiresAt?: unknown;
  now?: Date;
}): Promise<IssuedApiToken> {
  const now = input.now ?? new Date();
  const name = normalizeName(input.name);
  const scope = normalizeApiTokenScope(input.scope);
  const expiresAt = normalizeExpiresAt(input.expiresAt, now);

  const pair = await generateAuthTokenPair();
  const token = `${API_TOKEN_PREFIX}${pair.token}`;
  // 접두사까지 포함한 **제시될 문자열 그대로** 해시한다 — 검증 때 같은 값을 받는다.
  const tokenHash = await sha256Hex(token);
  const tokenPrefix = token.slice(0, DISPLAY_PREFIX_CHARS);

  const [row] = await db
    .insert(authApiToken)
    .values({ tokenHash, tokenPrefix, userId: input.userId, name, scope, expiresAt })
    .returning();

  return { token, summary: toSummary(row) };
}

export async function listApiTokens(userId: string): Promise<ApiTokenSummary[]> {
  const rows = await db
    .select()
    .from(authApiToken)
    .where(eq(authApiToken.userId, userId))
    .orderBy(desc(authApiToken.createdAt));
  return rows.map(toSummary);
}

/**
 * 토큰을 폐기한다.
 *
 * `userId`로 함께 좁힌다 — 해시를 알아도 남의 토큰은 못 지운다. 목록 응답이 해시를
 * 담고 있으므로 이 조건이 없으면 해시가 곧 삭제 권한이 된다.
 */
export async function revokeApiToken(input: {
  userId: string;
  tokenHash: string;
}): Promise<boolean> {
  const deleted = await db
    .delete(authApiToken)
    .where(
      and(eq(authApiToken.userId, input.userId), eq(authApiToken.tokenHash, input.tokenHash)),
    )
    .returning({ tokenHash: authApiToken.tokenHash });
  return deleted.length > 0;
}

export type VerifiedApiToken = {
  userId: string;
  scope: ApiTokenScope;
  tokenHash: string;
};

/**
 * 제시된 평문 토큰을 검증한다. 만료됐거나 없으면 `null`.
 *
 * `lastUsedAt` 갱신은 **await하지 않는다** — 인증 경로의 지연이고, 실패해도 인증
 * 자체는 유효하다. 실패를 삼키되 조용히 죽지는 않게 catch를 붙인다.
 */
export async function verifyApiToken(
  token: string,
  now: Date = new Date(),
): Promise<VerifiedApiToken | null> {
  if (!isApiTokenValue(token)) return null;
  const tokenHash = await sha256Hex(token);

  const [row] = await db
    .select({
      userId: authApiToken.userId,
      scope: authApiToken.scope,
      tokenHash: authApiToken.tokenHash,
    })
    .from(authApiToken)
    .where(
      and(
        eq(authApiToken.tokenHash, tokenHash),
        // 만료 없음(무기한) 또는 아직 유효.
        or(isNull(authApiToken.expiresAt), gt(authApiToken.expiresAt, now)),
      ),
    )
    .limit(1);

  if (!row) return null;

  void db
    .update(authApiToken)
    .set({ lastUsedAt: now })
    .where(eq(authApiToken.tokenHash, tokenHash))
    .catch(() => {
      // 마지막 사용 시각은 부가 정보다 — 갱신 실패가 인증을 막으면 안 된다.
    });

  return { userId: row.userId, scope: normalizeApiTokenScope(row.scope), tokenHash };
}

/** 만료된 토큰 청소. 세션 프루닝과 **분리된** 경로다(계획서 §6-1). */
export async function pruneExpiredApiTokens(now: Date = new Date()): Promise<number> {
  const deleted = await db
    .delete(authApiToken)
    .where(sql`${authApiToken.expiresAt} is not null and ${authApiToken.expiresAt} <= ${now}`)
    .returning({ tokenHash: authApiToken.tokenHash });
  return deleted.length;
}
