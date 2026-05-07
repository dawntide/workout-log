import { NextResponse } from "next/server";
import { parseDateRangeFromSearchParams } from "@/server/stats/range";
import { withApiLogging } from "@/server/observability/apiRoute";
import { logError } from "@/server/observability/logger";
import { getAuthenticatedUserId } from "@/server/auth/user";
import { fetchVolumeSeries, type VolumeBucket } from "@/server/stats/volume-series-service";
import { apiErrorResponse } from "@/app/api/_utils/error-response";

async function GETImpl(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = getAuthenticatedUserId();
    const exerciseId = searchParams.get("exerciseId")?.trim() ?? "";
    const exerciseName = searchParams.get("exercise") ?? searchParams.get("exerciseName");
    const bucketRaw = (searchParams.get("bucket") ?? "week").toLowerCase();
    const bucket: VolumeBucket =
      bucketRaw === "day" ? "day" : bucketRaw === "month" ? "month" : "week";
    const perExercise = searchParams.get("perExercise") === "1";
    const maxExercisesRaw = Number(searchParams.get("maxExercises") ?? "12");
    const maxExercises = Number.isFinite(maxExercisesRaw)
      ? Math.max(1, Math.min(40, Math.floor(maxExercisesRaw)))
      : 12;

    const { from, to, rangeDays } = parseDateRangeFromSearchParams(searchParams, 180);

    const result = await fetchVolumeSeries({
      userId,
      from,
      to,
      rangeDays,
      bucket,
      exerciseId,
      exerciseName,
      perExercise,
      maxExercises,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    logError("api.handler_error", { error: e });
    return apiErrorResponse(e);
  }
}

export const GET = withApiLogging(GETImpl);
