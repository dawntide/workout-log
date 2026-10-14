"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  detectRestPushSupport,
  disableRestPush,
  enableRestPush,
  fetchVapidPublicKey,
  getServiceWorkerRegistration,
  isRestPushEnabled,
} from "./rest-push-client";

/**
 * 설정 화면의 "휴식 끝 알림" 토글 상태.
 *
 * - `hidden`: 서버에 VAPID 키가 없다(기능 미배포) — 행 자체를 숨긴다.
 * - `needs-install`: iOS Safari 탭 — 홈 화면에 추가해야 쓸 수 있다.
 * - `unsupported`: 브라우저가 Web Push를 못 하거나 서비스워커가 없다(로컬 dev 포함).
 * - `ready`: 토글 가능.
 */
export type RestPushSettingStatus = "loading" | "hidden" | "needs-install" | "unsupported" | "ready";

export type RestPushSettingError = "denied" | "failed" | null;

export function useRestPushSetting() {
  const [status, setStatus] = useState<RestPushSettingStatus>("loading");
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<RestPushSettingError>(null);
  // subscribe는 제스처 안에서 await 없이 불러야 하므로 미리 받아 둔다.
  const prepared = useRef<{ registration: ServiceWorkerRegistration; publicKey: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const publicKey = await fetchVapidPublicKey();
      if (cancelled) return;
      if (!publicKey) return setStatus("hidden");
      const support = detectRestPushSupport();
      if (support !== "ready") return setStatus(support);
      const registration = await getServiceWorkerRegistration();
      if (cancelled) return;
      if (!registration) return setStatus("unsupported");
      prepared.current = { registration, publicKey };
      const on = await isRestPushEnabled();
      if (cancelled) return;
      setEnabled(on);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((next: boolean) => {
    setError(null);
    if (!next) {
      setPending(true);
      void disableRestPush()
        .then(() => setEnabled(false))
        .catch(() => setError("failed"))
        .finally(() => setPending(false));
      return;
    }
    const ready = prepared.current;
    if (!ready) return;
    setPending(true);
    // await 이전에 호출 — iOS 권한 요청이 이 탭 제스처에 묶인다.
    void enableRestPush(ready.registration, ready.publicKey)
      .then(() => setEnabled(true))
      .catch((e: unknown) => {
        const denied =
          typeof Notification !== "undefined" && Notification.permission === "denied";
        setError(denied || (e instanceof Error && e.name === "NotAllowedError") ? "denied" : "failed");
        setEnabled(false);
      })
      .finally(() => setPending(false));
  }, []);

  return { status, enabled, pending, error, toggle };
}
