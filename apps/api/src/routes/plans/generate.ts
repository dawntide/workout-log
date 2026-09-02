import { Hono } from "hono";

import { and, count, desc, eq, inArray, isNotNull, max, or } from "@workout/core/db/ops";
import {
  generateAndSaveSession,
  generateSessionSnapshot,
  previewSessionExercises,
} from "@workout/core/program-engine/generateSession";
import {
  REF5_IDENTIFIERS,
  REF5_PROTOCOL_VERSION,
  Ref5StaleVersionError,
  Ref5ValidationError,
  readRef5PlanStartConfig,
} from "@workout/core/program-engine/ref5";
import { apiError, normalizeTimezone, resolveLocale } from "../../lib/http";
import { type AppEnv } from "../../auth";
import {
  toRecord,
  asRecord,
} from "./shared";

/**
 * 세션 생성(처방 계산 + 저장).
 *
 * 등록 순서는 plans.ts가 정한다 — 이 함수를 부르는 순서가 곧 Hono 매칭 순서다.
 */
export function registerGenerateRoute(plansRoutes: Hono<AppEnv>) {
  // POST /api/plans/:planId/generate — generate (and save) a session for a plan.
  plansRoutes.post("/:planId/generate", async (c) => {
    const locale = resolveLocale(c);
    try {
      const planId = c.req.param("planId");
      const body = await c.req.json().catch(() => ({}));
      const userId = c.get("userId");
      const rawWeek = body.week;
      const rawDay = body.day;
      const week =
        rawWeek === undefined || rawWeek === null || rawWeek === "" ? undefined : Number(rawWeek);
      const day =
        rawDay === undefined || rawDay === null || rawDay === "" ? undefined : Number(rawDay);
      const sessionDate =
        typeof body.sessionDate === "string" && body.sessionDate.trim()
          ? body.sessionDate.trim()
          : undefined;
      const timezone =
        typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : undefined;
      const ref5Raw = asRecord(body.ref5);
      const hasRef5Input = Object.keys(ref5Raw).length > 0;
      const hasRemovedRef5Input = [
        "climb",
        "climbing",
        "climbingWithin48h",
        "strongClimbing",
        "pullFallback",
        "substitute",
        "substitution",
        "omitPullVolume",
        "omitted",
        "omittedPrescriptions",
      ].some((key) => Object.hasOwn(ref5Raw, key));
      if (hasRemovedRef5Input) {
        return c.json(
          {
            error:
              locale === "ko"
                ? "오래된 REF5 입력이 감지되었습니다. 화면을 새로고침한 뒤 다시 시작해 주세요."
                : "Stale REF5 input was detected. Refresh and start again.",
            code: "REF5_STALE_VERSION",
            expectedProtocolVersion: REF5_PROTOCOL_VERSION,
          },
          409,
        );
      }
      const ref5Bodyweight = Number(ref5Raw.bodyweightKg ?? ref5Raw.todayBodyweightKg);
      const ref5 = hasRef5Input
        ? {
            protocolVersion: String(ref5Raw.protocolVersion ?? "") as typeof REF5_PROTOCOL_VERSION,
            actualStartAt: String(ref5Raw.actualStartAt ?? "").trim(),
            todayBodyweightKg: ref5Bodyweight,
            manualMicro: ref5Raw.manualMicro === true,
            // §7.6 revert. Absent means false; only a normal BP-focus session
            // acts on it, so no other session type needs to send it.
            oapSlotReverted: ref5Raw.oapSlotReverted === true,
            startEventId: String(ref5Raw.startEventId ?? "").trim(),
          }
        : undefined;

      if (ref5 && ref5.protocolVersion !== REF5_PROTOCOL_VERSION) {
        return c.json(
          {
            error:
              locale === "ko"
                ? "오래된 REF5 버전입니다. 화면을 새로고침한 뒤 다시 시작해 주세요."
                : "This REF5 protocol version is stale. Refresh and start again.",
            code: "REF5_STALE_VERSION",
            expectedProtocolVersion: REF5_PROTOCOL_VERSION,
          },
          409,
        );
      }

      if (
        (week !== undefined && !Number.isFinite(week)) ||
        (day !== undefined && !Number.isFinite(day))
      ) {
        return c.json(
          {
            error:
              locale === "ko"
                ? "week/day 값이 주어지면 숫자여야 합니다."
                : "week/day must be numeric when provided",
          },
          400,
        );
      }

      if (
        ref5 &&
        (!ref5.actualStartAt ||
          Number.isNaN(new Date(ref5.actualStartAt).getTime()) ||
          !Number.isFinite(ref5.todayBodyweightKg) ||
          ref5.todayBodyweightKg <= 0 ||
          !ref5.startEventId)
      ) {
        return c.json(
          {
            error:
              locale === "ko"
                ? "REF5에는 실제 시작 시각, 오늘 체중, 시작 사건 ID가 필요합니다."
                : "REF5 requires an exact start time, today's bodyweight, and a start event ID.",
          },
          400,
        );
      }

      const generationInput = {
        userId,
        planId,
        week,
        day,
        sessionDate,
        timezone,
        ref5,
      };

      if (body.preview === true) {
        if (!ref5) {
          return c.json(
            { error: locale === "ko" ? "REF5 미리보기 입력이 필요합니다." : "REF5 preview input is required." },
            400,
          );
        }
        const snapshot = await generateSessionSnapshot(generationInput);
        return c.json(
          {
            preview: true,
            session: {
              id: null,
              planId,
              sessionKey: String((snapshot as { sessionKey?: unknown }).sessionKey ?? ""),
              snapshot,
            },
          },
          200,
        );
      }

      const session = await generateAndSaveSession(generationInput);
      const savedRef5 = toRecord(toRecord(session.snapshot).ref5);
      const resumed = Boolean(
        ref5 && String(savedRef5.startEventId ?? "") !== ref5.startEventId,
      );

      return c.json({ session, resumed }, resumed ? 200 : 201);
    } catch (e) {
      if (e instanceof Ref5StaleVersionError) {
        return c.json(
          {
            error: e.message,
            code: "REF5_STALE_VERSION",
            expectedProtocolVersion: REF5_PROTOCOL_VERSION,
          },
          409,
        );
      }
      if (e instanceof Ref5ValidationError) return c.json({ error: e.message }, 400);
      return apiError(c, e, locale);
    }
  });
}
