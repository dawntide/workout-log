"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { V2Icon } from "@/components/v2/primitives/v2-icon";

/**
 * 새 배포(서비스워커 업데이트) 감지 배너.
 *
 * 동작 원리
 * - SW 본체(web/src/app/sw.js/route.ts)는 install 시 skipWaiting,
 *   activate 시 clients.claim 하므로 새 SW는 백그라운드에서 자동으로 교체된다.
 *   하지만 "이미 떠 있는 화면"은 자동으로 새로고침되지 않으므로, 사용자는
 *   직접 새로고침하기 전까지 옛 버전을 계속 본다.
 * - 이 배너는 그 갭을 메운다: 새 SW가 설치되면 알림을 띄우고, 사용자가
 *   명시적으로 누를 때만 reload 한다.
 *
 * 안전 가드
 * - 절대 자동으로 reload 하지 않는다(controllerchange 자동 reload 미사용).
 *   운동 기록 입력 중에 화면이 날아가는 일을 구조적으로 막는다.
 * - 사용자가 "지금 업데이트"를 누르면, reload 직전에 활성 입력 필드를 blur
 *   하여 onBlur 저장 로직을 한 번 트리거한 뒤 다음 프레임에 새로고침한다.
 *
 * 감지
 * - navigator.serviceWorker.ready 로 등록을 얻고 updatefound → installed
 *   (+ 기존 controller 존재 = 최초 설치가 아닌 "업데이트")를 신호로 본다.
 * - 포그라운드 복귀 시 reg.update()로 배포 직후 감지 시점을 앞당긴다.
 */
export function V2AppUpdateBanner() {
  const { locale } = useLocale();
  const [ready, setReady] = useState(false);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DISABLE_SW === "1") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;

    const markReady = () => {
      if (!cancelled) setReady(true);
    };

    const trackInstalling = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        // installed + 기존 controller 존재 → 최초 설치가 아닌 "업데이트".
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          markReady();
        }
      });
    };

    const watch = (reg: ServiceWorkerRegistration) => {
      registration = reg;
      // 마운트 시점에 이미 새 워커가 대기/설치돼 있던 경우.
      if (reg.waiting && navigator.serviceWorker.controller) {
        markReady();
      }
      trackInstalling(reg.installing);
      reg.addEventListener("updatefound", () => trackInstalling(reg.installing));
    };

    navigator.serviceWorker.ready
      .then((reg) => {
        if (!cancelled) watch(reg);
      })
      .catch(() => {});

    // 포그라운드 복귀 시 업데이트 확인 → 배포 직후 빠르게 감지.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        registration?.update().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const handleUpdate = useCallback(() => {
    if (reloading) return;
    setReloading(true);
    // 입력 중 미저장 값 보호: 활성 입력 필드를 먼저 blur 하여 onBlur 저장을
    // 트리거한 뒤, 다음 프레임에 새로고침한다. 새 SW가 이미 active이므로
    // 단순 reload 만으로 최신 빌드(HTML network-first + 새 정적 청크)를 받는다.
    const active = document.activeElement as HTMLElement | null;
    if (active && typeof active.blur === "function") active.blur();
    requestAnimationFrame(() => window.location.reload());
  }, [reloading]);

  if (!ready) return null;

  const isKo = locale === "ko";

  return (
    <div
      role="status"
      style={{
        margin: "12px 12px 0",
        padding: "var(--v2-s-3) var(--v2-s-4)",
        borderRadius: "var(--v2-r-2)",
        background: "color-mix(in srgb, var(--v2-accent) 14%, var(--v2-paper))",
        color: "var(--v2-ink)",
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--v2-s-3)",
      }}
    >
      <V2Icon
        name="new_releases"
        style={{ color: "var(--v2-accent-ink)", fontSize: "var(--v2-t-20)", marginTop: 1 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="v2-font-display" style={{ fontSize: "var(--v2-t-small)", fontWeight: 700 }}>
          {isKo ? "새 버전이 준비됐어요" : "A new version is ready"}
        </div>
        <div
          className="v2-small"
          style={{ color: "var(--v2-ink-2)", marginTop: 2, fontSize: "var(--v2-t-12)" }}
        >
          {isKo ? (
            <>
              새로고침하면 최신 버전으로 업데이트됩니다.{" "}
              <InlineAction onClick={handleUpdate} disabled={reloading}>
                {reloading ? "업데이트 중…" : "지금 업데이트"}
              </InlineAction>
            </>
          ) : (
            <>
              Refresh to update to the latest version.{" "}
              <InlineAction onClick={handleUpdate} disabled={reloading}>
                {reloading ? "Updating…" : "Update now"}
              </InlineAction>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setReady(false)}
        aria-label={isKo ? "업데이트 알림 닫기" : "Dismiss update banner"}
        style={{
          border: "none",
          borderRadius: "var(--v2-r-1)",
          background: "transparent",
          color: "var(--v2-ink-3)",
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <V2Icon name="close" style={{ fontSize: "var(--v2-t-18)" }} />
      </button>
    </div>
  );
}

function InlineAction({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="v2-font-display"
      style={{
        border: "none",
        background: "transparent",
        color: "var(--v2-accent-ink)",
        padding: 0,
        fontSize: "var(--v2-t-12)",
        fontWeight: 800,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
