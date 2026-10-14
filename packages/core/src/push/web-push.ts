import { buildPushPayload } from "@block65/webcrypto-web-push";

import { validatePushSubscription, type PushSubscriptionData } from "./subscription";

/**
 * Web Push 발송(VAPID + aes128gcm). WebCrypto만 쓰는 라이브러리라 Node·Vercel 어디서나 돈다.
 *
 * 키는 `web/scripts/setup-push-keys.mjs`로 한 번 만들고 env로 둔다. 공개 키만 브라우저에
 * 내려간다(`GET /api/push/vapid-key`).
 */

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

export type PushDelivery =
  | { outcome: "accepted" | "expired" }
  | { outcome: "failed"; reason: "subscription" | "encryption" | "network" | "rejected"; status?: number };

export type PushMessage = {
  data: { title: string; body: string; url: string; tag: string };
  /** 초. 이 시간 안에 전달하지 못하면 푸시 서비스가 버린다 — 늦은 휴식 알림은 의미가 없다. */
  ttl: number;
  /** 같은 topic의 미전달 메시지는 새 것이 대체한다. */
  topic: string;
};

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** env의 VAPID 키가 모양까지 맞을 때만 반환한다. 아니면 null(= 푸시 기능 꺼짐). */
export function readVapidConfig(): VapidConfig | null {
  const publicKey = readEnv("VAPID_PUBLIC_KEY");
  const privateKey = readEnv("VAPID_PRIVATE_KEY");
  const subject = readEnv("VAPID_SUBJECT");
  if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject)) return null;
  if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey) || !/^[A-Za-z0-9_-]{43}$/.test(privateKey)) return null;
  if (Buffer.from(publicKey, "base64url")[0] !== 4) return null;
  return { publicKey, privateKey, subject };
}

export async function deliverPush(
  subscription: PushSubscriptionData,
  message: PushMessage,
  vapid: VapidConfig,
  request: typeof fetch = fetch,
): Promise<PushDelivery> {
  if (!validatePushSubscription(subscription).ok) return { outcome: "failed", reason: "subscription" };
  if (subscription.expirationTime !== null && subscription.expirationTime <= Date.now()) {
    return { outcome: "expired" };
  }

  let payload: Awaited<ReturnType<typeof buildPushPayload>>;
  try {
    payload = await buildPushPayload(
      { data: message.data, options: { ttl: message.ttl, urgency: "high", topic: message.topic } },
      subscription,
      vapid,
    );
  } catch {
    return { outcome: "failed", reason: "encryption" };
  }

  try {
    // 검증한 목적지 밖으로 자격 증명이 따라가지 않게 리디렉션은 따르지 않는다(3xx = 실패).
    const response = await request(subscription.endpoint, {
      ...payload,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 404 || response.status === 410) return { outcome: "expired" };
    if (response.ok) return { outcome: "accepted" };
    return { outcome: "failed", reason: "rejected", status: response.status };
  } catch {
    return { outcome: "failed", reason: "network" };
  }
}
