import { NextResponse } from "next/server";
import { getStatsPageBootstrap } from "@/server/services/stats/get-stats-page-bootstrap";
import { withApiLogging } from "@/server/observability/apiRoute";
import { logError } from "@workout/core/observability/logger";
import { apiErrorResponse } from "@/app/api/_utils/error-response";

async function GETImpl(req: Request) {
  try {
    const url = new URL(req.url);
    const params: Record<string, string | undefined> = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    const payload = await getStatsPageBootstrap(params);

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    logError("api.handler_error", { error: e });
    return apiErrorResponse(e);
  }
}

export const GET = withApiLogging(GETImpl);
