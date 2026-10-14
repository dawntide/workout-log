/**
 * 휴식 종료 푸시의 브라우저 어댑터 — 구독(켜기·끄기)과 예약·취소 호출.
 *
 * 켜짐 여부는 서버 설정이 아니라 **이 기기의 push 구독 존재**다. 알림은 휴식을 시작한
 * 기기로만 가야 하므로 기기 단위 상태가 맞고, 서버는 예약마다 구독을 함께 받는다.
 *
 * 예약·취소는 fire-and-forget이다 — 실패해도 휴식 타이머(화면 카운트다운·종료음)는
 * 그대로 돌아야 한다.
 */

import { apiDelete, apiGet, apiPut } from "@/lib/api";

export type RestPushSupport = "ready" | "needs-install" | "unsupported";

type StandaloneNavigator = Navigator & { standalone?: boolean };

function isIosDevice(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+는 데스크톱 Safari로 보고한다 — 터치 포인트로 가른다.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as StandaloneNavigator).standalone === true
  );
}

export function detectRestPushSupport(): RestPushSupport {
  if (typeof window === "undefined") return "unsupported";
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // iOS Safari 탭에는 PushManager가 없다. 홈 화면에 설치한 앱에서만 생긴다(16.4+).
  if (isIosDevice() && !isStandalone()) return "needs-install";
  return capable ? "ready" : "unsupported";
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    // null = 서버에 키가 없다(기능 꺼짐).
    const { publicKey } = await apiGet<{ publicKey: string | null }>("/api/push/vapid-key", {
      maxAgeMs: 60 * 60 * 1000,
    });
    return typeof publicKey === "string" ? publicKey : null;
  } catch {
    return null;
  }
}

export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  } catch {
    return null;
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return null;
  const registration = await getServiceWorkerRegistration();
  try {
    return (await registration?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

export async function isRestPushEnabled(): Promise<boolean> {
  return (await currentSubscription()) !== null;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * 켜기. **사용자 제스처 안에서, await 전에** 불러야 한다 — iOS는 제스처를 벗어난
 * subscribe를 거부한다. 그래서 등록·공개 키는 호출자가 미리 받아 둔다.
 */
export function enableRestPush(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<PushSubscription> {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(publicKey),
  });
}

export async function disableRestPush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await cancelRestPush(subscription);
  await subscription.unsubscribe();
}

export function scheduleRestPush(input: { delaySeconds: number; title: string; body: string }): void {
  void (async () => {
    const subscription = await currentSubscription();
    if (!subscription) return;
    const json = subscription.toJSON();
    await apiPut(
      "/api/push/rest",
      {
        subscription: { ...json, expirationTime: json.expirationTime ?? null },
        delaySeconds: Math.round(input.delaySeconds),
        title: input.title,
        body: input.body,
      },
      { invalidateCache: false },
    );
  })().catch(() => {
    // 알림 예약 실패는 타이머 동작을 막지 않는다.
  });
}

/** 예약 취소. 이 기기에 구독이 없으면 서버를 부르지 않는다. */
export async function cancelRestPush(known?: PushSubscription | null): Promise<void> {
  try {
    const subscription = known ?? (await currentSubscription());
    if (!subscription) return;
    await apiDelete("/api/push/rest", { invalidateCache: false });
  } catch {
    // 취소 실패 시 최악은 지난 휴식 알림 한 번이다.
  }
}
