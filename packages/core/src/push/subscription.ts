/**
 * Web Push 구독 검증 — 서버가 임의 URL로 요청을 보내지 않게 하는 경계.
 *
 * 구독의 endpoint는 클라이언트가 보낸 값이고 서버는 그 주소로 POST한다. 알려진
 * 브라우저 푸시 서비스의 HTTPS 주소만 받지 않으면 SSRF 통로가 된다.
 * (migle-board `src/shared/push.ts`와 같은 규칙)
 */

export type PushSubscriptionData = {
  endpoint: string;
  expirationTime: number | null;
  keys: { auth: string; p256dh: string };
};

export type PushSubscriptionRejection = "shape" | "endpoint" | "expiration" | "auth" | "p256dh";

const ALLOWED_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
const ALLOWED_HOST_SUFFIXES = [".push.apple.com", ".notify.windows.com"];

function isAllowedHost(hostname: string): boolean {
  return (
    ALLOWED_HOSTS.includes(hostname) ||
    hostname === "notify.windows.com" ||
    ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

/** base64url 키가 기대 길이(바이트)인지. p256dh(65)는 비압축 점(0x04 시작)이어야 한다. */
function isKeyOfLength(value: unknown, length: number): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const raw = Buffer.from(value, "base64url");
  return raw.length === length && (length !== 65 || raw[0] === 4);
}

export function validatePushSubscription(
  value: unknown,
): { ok: true; subscription: PushSubscriptionData } | { ok: false; reason: PushSubscriptionRejection } {
  if (!value || typeof value !== "object") return { ok: false, reason: "shape" };
  const s = value as Partial<PushSubscriptionData>;
  if (typeof s.endpoint !== "string" || s.endpoint.length > 2048) return { ok: false, reason: "endpoint" };
  try {
    const url = new URL(s.endpoint);
    if (
      url.protocol !== "https:" ||
      !isAllowedHost(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      url.hash
    ) {
      return { ok: false, reason: "endpoint" };
    }
  } catch {
    return { ok: false, reason: "endpoint" };
  }
  // 일부 브라우저 직렬화는 모르는 만료를 null 대신 생략한다.
  const expirationTime = s.expirationTime ?? null;
  if (
    expirationTime !== null &&
    (typeof expirationTime !== "number" || !Number.isFinite(expirationTime) || expirationTime <= 0)
  ) {
    return { ok: false, reason: "expiration" };
  }
  if (!s.keys || !isKeyOfLength(s.keys.auth, 16)) return { ok: false, reason: "auth" };
  if (!isKeyOfLength(s.keys.p256dh, 65)) return { ok: false, reason: "p256dh" };
  return {
    ok: true,
    subscription: {
      endpoint: s.endpoint,
      expirationTime,
      keys: { auth: s.keys.auth, p256dh: s.keys.p256dh },
    },
  };
}
