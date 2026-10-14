import { eq, lte } from "drizzle-orm";

import { db } from "@workout/core/db/client";
import { restPushSchedule } from "@workout/core/db/schema";
import { logInfo, logWarn } from "@workout/core/observability/logger";

import { validatePushSubscription, type PushSubscriptionRejection } from "./subscription";
import { deliverPush, readVapidConfig, type PushDelivery } from "./web-push";

/**
 * 휴식 종료 푸시 — 예약·취소·발송.
 *
 * 흐름: 세트 완료로 휴식이 시작되면 클라이언트가 그 기기의 구독과 남은 초를 보내 예약한다
 * (사용자당 1행 upsert). 연장은 같은 예약을 덮고, 스킵·저장은 취소한다. prod의
 * Supabase Cron이 매초 만료 행이 있을 때만 dispatch를 부른다.
 */

export const REST_PUSH_MAX_DELAY_SECONDS = 900;
/** 이보다 늦게 claim된 예약은 버린다 — cron이 멈췄다 돌아온 뒤 지난 휴식이 몰려 울리면 안 된다. */
export const REST_PUSH_STALE_AFTER_MS = 60_000;
const TITLE_MAX = 80;
const BODY_MAX = 180;

export type RestPushScheduleInput = {
  subscription: unknown;
  delaySeconds: unknown;
  title: unknown;
  body: unknown;
};

export type RestPushScheduleRejection = PushSubscriptionRejection | "delay" | "text";

type ParsedSchedule = {
  endpoint: string;
  p256dh: string;
  auth: string;
  delaySeconds: number;
  title: string;
  body: string;
};

export function parseRestPushSchedule(
  input: RestPushScheduleInput,
): { ok: true; value: ParsedSchedule } | { ok: false; reason: RestPushScheduleRejection } {
  const subscription = validatePushSubscription(input.subscription);
  if (!subscription.ok) return { ok: false, reason: subscription.reason };
  const delay = Number(input.delaySeconds);
  if (!Number.isFinite(delay) || delay < 1 || delay > REST_PUSH_MAX_DELAY_SECONDS) {
    return { ok: false, reason: "delay" };
  }
  if (typeof input.title !== "string" || typeof input.body !== "string") return { ok: false, reason: "text" };
  const title = input.title.trim().slice(0, TITLE_MAX);
  const body = input.body.trim().slice(0, BODY_MAX);
  if (!title) return { ok: false, reason: "text" };
  const { endpoint, keys } = subscription.subscription;
  return {
    ok: true,
    value: { endpoint, p256dh: keys.p256dh, auth: keys.auth, delaySeconds: Math.round(delay), title, body },
  };
}

export async function scheduleRestPush(userId: string, value: ParsedSchedule): Promise<{ fireAt: string }> {
  // 기준 시각은 서버다 — 기기 시계가 틀려도 "N초 뒤"는 정확하다.
  const fireAt = new Date(Date.now() + value.delaySeconds * 1000);
  const row = {
    endpoint: value.endpoint,
    p256dh: value.p256dh,
    auth: value.auth,
    fireAt,
    title: value.title,
    body: value.body,
  };
  await db
    .insert(restPushSchedule)
    .values({ userId, ...row })
    .onConflictDoUpdate({ target: restPushSchedule.userId, set: { ...row, createdAt: new Date() } });
  return { fireAt: fireAt.toISOString() };
}

export async function cancelRestPush(userId: string): Promise<void> {
  await db.delete(restPushSchedule).where(eq(restPushSchedule.userId, userId));
}

export type RestPushDispatchResult = {
  claimed: number;
  accepted: number;
  expired: number;
  stale: number;
  failed: number;
  configured: boolean;
};

/**
 * 만료된 예약을 claim(삭제)하고 발송한다.
 *
 * `DELETE … RETURNING`이 claim이다 — cron이 1초마다 부르므로 이전 호출이 콜드스타트로
 * 늦어도 같은 행을 두 번 보내지 않는다. 실패는 재전송하지 않는다(늦은 휴식 알림은 소음이다).
 */
export async function dispatchDueRestPushes(
  now: Date = new Date(),
  request: typeof fetch = fetch,
): Promise<RestPushDispatchResult> {
  const vapid = readVapidConfig();
  const result: RestPushDispatchResult = {
    claimed: 0,
    accepted: 0,
    expired: 0,
    stale: 0,
    failed: 0,
    configured: Boolean(vapid),
  };
  // 키가 없으면 claim하지 않는다 — 설정을 고친 뒤 아직 유효한 예약은 살릴 수 있다.
  if (!vapid) return result;

  const due = await db.delete(restPushSchedule).where(lte(restPushSchedule.fireAt, now)).returning();
  result.claimed = due.length;

  const deliveries = await Promise.all(
    due.map(async (row): Promise<PushDelivery | "stale"> => {
      if (now.getTime() - row.fireAt.getTime() > REST_PUSH_STALE_AFTER_MS) return "stale";
      return deliverPush(
        { endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth } },
        {
          data: { title: row.title, body: row.body, url: "/workout/log", tag: "rest-timer" },
          ttl: 60,
          topic: "rest-timer",
        },
        vapid,
        request,
      );
    }),
  );

  for (const delivery of deliveries) {
    if (delivery === "stale") result.stale += 1;
    else if (delivery.outcome !== "failed") result[delivery.outcome] += 1;
    else {
      result.failed += 1;
      // endpoint·키·본문은 남기지 않는다.
      logWarn("rest_push.delivery_failed", {
        reason: delivery.reason,
        status: delivery.status ?? null,
      });
    }
  }
  if (result.claimed > 0) logInfo("rest_push.dispatched", { ...result });
  return result;
}
