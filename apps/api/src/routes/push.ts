import { Hono } from "hono";

import {
  cancelRestPush,
  parseRestPushSchedule,
  scheduleRestPush,
} from "@workout/core/push/rest-push";
import { readVapidConfig } from "@workout/core/push/web-push";

import { requireAuth, type AppEnv } from "../auth";
import { apiError, resolveLocale } from "../lib/http";

/**
 * 휴식 종료 푸시 (`/api/push`).
 *
 * 구독 등록 API가 따로 없다 — 예약마다 그 기기의 구독을 함께 보낸다(스키마 주석 참조).
 * 발송은 `/api/ops/rest-push/dispatch`(ops 토큰)가 한다.
 */
export const pushRoutes = new Hono<AppEnv>();
pushRoutes.use("*", requireAuth);

// GET /api/push/vapid-key — 브라우저 구독용 공개 키. 서버에 키가 없으면 `null`(기능 꺼짐).
// 5xx가 아니라 200인 이유: 미배포는 정상 상태이고, E2E 브라우저 가드가 5xx를 실패로 센다.
pushRoutes.get("/vapid-key", (c) => {
  const vapid = readVapidConfig();
  c.header("Cache-Control", "private, max-age=3600");
  return c.json({ publicKey: vapid?.publicKey ?? null });
});

// PUT /api/push/rest — 휴식 종료 예약(사용자당 1건, 덮어쓰기). 연장도 이 경로다.
pushRoutes.put("/rest", async (c) => {
  const locale = resolveLocale(c);
  try {
    // 키가 내려간 뒤 남은 구독의 예약 — 보낼 수 없으니 받지 않는다(오류는 아니다).
    if (!readVapidConfig()) return c.json({ scheduled: false });
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = parseRestPushSchedule({
      subscription: body.subscription,
      delaySeconds: body.delaySeconds,
      title: body.title,
      body: body.body,
    });
    if (!parsed.ok) return c.json({ error: "Invalid rest push", reason: parsed.reason }, 400);
    return c.json({ scheduled: true, ...(await scheduleRestPush(c.get("userId"), parsed.value)) });
  } catch (e) {
    return apiError(c, e, locale);
  }
});

// DELETE /api/push/rest — 예약 취소(스킵·기록 저장). 없어도 성공이다.
pushRoutes.delete("/rest", async (c) => {
  const locale = resolveLocale(c);
  try {
    await cancelRestPush(c.get("userId"));
    return c.body(null, 204);
  } catch (e) {
    return apiError(c, e, locale);
  }
});
