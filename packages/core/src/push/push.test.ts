import assert from "node:assert/strict";
import { generateKeyPairSync, createECDH } from "node:crypto";
import test from "node:test";

import { parseRestPushSchedule } from "./rest-push";
import { validatePushSubscription } from "./subscription";
import { deliverPush, readVapidConfig, type VapidConfig } from "./web-push";

function browserKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: Buffer.alloc(16, 7).toString("base64url"),
  };
}

function vapidKeys(): VapidConfig {
  const jwk = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ format: "jwk" });
  return {
    publicKey: Buffer.concat([
      Buffer.from([4]),
      Buffer.from(jwk.x!, "base64url"),
      Buffer.from(jwk.y!, "base64url"),
    ]).toString("base64url"),
    privateKey: jwk.d!,
    subject: "mailto:admin@example.com",
  };
}

const subscription = {
  endpoint: "https://web.push.apple.com/QGuQyavXutnMH",
  expirationTime: null,
  keys: browserKeys(),
};

test("알려진 푸시 서비스의 HTTPS 구독만 받는다", () => {
  assert.equal(validatePushSubscription(subscription).ok, true);
  for (const endpoint of [
    "http://web.push.apple.com/x",
    "https://evil.example.com/x",
    "https://web.push.apple.com.evil.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://user@fcm.googleapis.com/x",
  ]) {
    assert.deepEqual(validatePushSubscription({ ...subscription, endpoint }), {
      ok: false,
      reason: "endpoint",
    });
  }
  assert.deepEqual(
    validatePushSubscription({ ...subscription, keys: { ...subscription.keys, auth: "short" } }),
    { ok: false, reason: "auth" },
  );
});

test("예약 입력은 지연 범위와 제목을 검증한다", () => {
  const base = { subscription, delaySeconds: 90, title: "휴식 끝", body: "스쿼트 3세트" };
  const parsed = parseRestPushSchedule(base);
  assert.ok(parsed.ok);
  assert.equal(parsed.value.delaySeconds, 90);
  assert.deepEqual(parseRestPushSchedule({ ...base, delaySeconds: 0 }), { ok: false, reason: "delay" });
  assert.deepEqual(parseRestPushSchedule({ ...base, delaySeconds: 901 }), { ok: false, reason: "delay" });
  assert.deepEqual(parseRestPushSchedule({ ...base, title: "  " }), { ok: false, reason: "text" });
  const long = parseRestPushSchedule({ ...base, body: "x".repeat(500) });
  assert.ok(long.ok);
  assert.equal(long.value.body.length, 180);
});

test("VAPID env는 모양이 맞을 때만 켜진다", () => {
  const keys = vapidKeys();
  const saved = { ...process.env };
  try {
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = keys.subject;
    assert.deepEqual(readVapidConfig(), keys);
    process.env.VAPID_SUBJECT = "admin@example.com";
    assert.equal(readVapidConfig(), null);
  } finally {
    process.env = saved;
  }
});

test("발송: 암호화한 요청을 구독 주소로 보내고 404/410은 만료로 본다", async () => {
  const keys = vapidKeys();
  const message = {
    data: { title: "휴식 끝", body: "", url: "/workout/log", tag: "rest-timer" },
    ttl: 60,
    topic: "rest-timer",
  };
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const respond = (status: number): typeof fetch =>
    (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status });
    }) as typeof fetch;

  assert.deepEqual(await deliverPush(subscription, message, keys, respond(201)), { outcome: "accepted" });
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(calls[0].url, subscription.endpoint);
  assert.equal(calls[0].init.redirect, "manual");
  assert.equal(headers.ttl, "60");
  assert.equal(headers.urgency, "high");
  assert.equal(headers["content-encoding"], "aes128gcm");

  assert.deepEqual(await deliverPush(subscription, message, keys, respond(410)), { outcome: "expired" });
  assert.deepEqual(await deliverPush(subscription, message, keys, respond(403)), {
    outcome: "failed",
    reason: "rejected",
    status: 403,
  });
  assert.deepEqual(
    await deliverPush({ ...subscription, endpoint: "https://evil.example.com/x" }, message, keys, respond(201)),
    { outcome: "failed", reason: "subscription" },
  );
});
