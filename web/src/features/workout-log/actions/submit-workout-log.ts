"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedUserId } from "@/server/auth/user";
import { resolveRequestLocale } from "@/lib/i18n/messages";
import { upsertWorkoutLogService, type UpsertWorkoutLogInput } from "@/server/services/workout-log/upsert-log";
import { logError } from "@/server/observability/logger";

export async function submitWorkoutLogAction(
  payload: Omit<UpsertWorkoutLogInput, "userId" | "locale">
) {
  try {
    const userId = getAuthenticatedUserId();
    const locale = await resolveRequestLocale();

    const result = await upsertWorkoutLogService({
      ...payload,
      userId,
      locale,
    });

    // 저장 직후 캘린더/홈/기록 페이지가 stale 캐시(Router Cache, default 30s)를
    // 보여주지 않도록 명시적으로 무효화. 그렇지 않으면 새로 기록한 날짜에
    // dot 이 즉시 반영되지 않고 강제 새로고침이 필요해진다.
    revalidatePath("/");
    revalidatePath("/calendar");
    revalidatePath("/workout/log");
    revalidatePath("/stats");

    return {
      success: true,
      data: result,
    };
  } catch (error: any) {
    logError("action.submit_workout_log_error", { error });
    return {
      success: false,
      error: error?.message ?? "Failed to save the workout log.",
    };
  }
}
