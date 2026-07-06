import { NextResponse } from "next/server";
import { lt } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { authSession } from "@workout/core/db/schema";
import { withApiLogging } from "@/server/observability/apiRoute";

/**
 * 만료된 auth_session row 삭제.
 *
 * - cron이나 외부 스케줄러로 호출 (e.g. Vercel cron, GitHub Actions)
 * - WORKOUT_OPS_TOKEN 환경변수 설정 시: Authorization: Bearer <token> 필수
 * - 미설정 시: 누구나 호출 가능 (dev 편의). 운영에서는 반드시 설정 권장.
 */
async function POSTImpl(req: Request) {
  const expectedToken = (process.env.WORKOUT_OPS_TOKEN ?? "").trim();
  if (expectedToken) {
    const auth = req.headers.get("authorization") ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (provided !== expectedToken) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }
  }

  const result = await db
    .delete(authSession)
    .where(lt(authSession.expiresAt, new Date()));
  const deleted = (result as { rowCount?: number | null })?.rowCount ?? 0;
  return NextResponse.json({
    deleted,
    at: new Date().toISOString(),
  });
}

export const POST = withApiLogging(POSTImpl);

// GET은 dry-run (count only) — 모니터링/health-check용
async function GETImpl() {
  // Drizzle에는 count(distinct) 헬퍼가 별로 없어 raw SQL 대신 select all → length로 단순화.
  // 만료된 row가 많지 않다는 가정. 큰 규모면 SQL count로 교체.
  const rows = await db
    .select({ token: authSession.token })
    .from(authSession)
    .where(lt(authSession.expiresAt, new Date()))
    .limit(1000);
  return NextResponse.json({
    expired: rows.length,
    truncated: rows.length === 1000,
    at: new Date().toISOString(),
  });
}

export const GET = withApiLogging(GETImpl);
