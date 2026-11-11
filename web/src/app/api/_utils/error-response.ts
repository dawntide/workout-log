import { NextResponse } from "next/server";
import {
  clientErrorMessage,
  isInternalError,
} from "@workout/core/observability/client-error-message";
import { logError } from "@workout/core/observability/logger";
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

  // DB·네트워크 계층 예외는 SQL·파라미터가 실리므로 고정 문구로 바꾸고 상세는 로그에만 남긴다.
  if (isInternalError(error)) {
    logError("api.handler_error", { error });
  }

  return NextResponse.json(
    {
      error: clientErrorMessage(error, fallbackMessage),
      ...(init?.extra ?? {}),
    },
    { status },
  );
}
