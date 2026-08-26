import { NextResponse } from "next/server";
import { resolveRequestLocale } from "@/lib/i18n/messages";
import { ForbiddenError, UnauthorizedError } from "@/server/auth/user";

type ApiErrorResponseInit = {
  status?: number;
  fallback?: {
    ko: string;
    en: string;
  };
  extra?: Record<string, unknown>;
};

export async function apiErrorResponse(error: unknown, init?: ApiErrorResponseInit) {
  const locale = await resolveRequestLocale();
  const fallbackMessage =
    locale === "ko"
      ? (init?.fallback?.ko ?? "알 수 없는 오류가 발생했습니다.")
      : (init?.fallback?.en ?? "An unknown error occurred.");

  // 미인증은 401, 권한 부족은 403으로 매핑 (그 외는 500). 명시 status가 우선한다.
  const status =
    init?.status ??
    (error instanceof UnauthorizedError
      ? 401
      : error instanceof ForbiddenError
        ? 403
        : 500);

  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : fallbackMessage,
      ...(init?.extra ?? {}),
    },
    { status },
  );
}
