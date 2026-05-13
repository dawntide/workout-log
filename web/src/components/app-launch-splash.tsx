"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useLocale } from "@/components/locale-provider";

const MIN_VISIBLE_MS = 300;
const EXIT_ANIMATION_MS = 200;

type SplashPhase = "visible" | "hiding" | "hidden";

function nowMs() {
  if (typeof performance !== "undefined") return performance.now();
  return Date.now();
}

export function AppLaunchSplash() {
  const { locale } = useLocale();
  const [phase, setPhase] = useState<SplashPhase>("visible");
  const startedAtRef = useRef<number>(nowMs());

  useEffect(() => {
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const closeSplash = () => {
      const elapsedMs = nowMs() - startedAtRef.current;
      const waitMs = Math.max(0, MIN_VISIBLE_MS - elapsedMs);

      closeTimer = setTimeout(() => {
        setPhase("hiding");
        hideTimer = setTimeout(() => setPhase("hidden"), EXIT_ANIMATION_MS);
      }, waitMs);
    };

    if (document.readyState === "complete") {
      closeSplash();
    } else {
      window.addEventListener("load", closeSplash, { once: true });
    }

    return () => {
      window.removeEventListener("load", closeSplash);
      if (closeTimer) clearTimeout(closeTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  if (phase === "hidden") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={locale === "ko" ? "앱을 불러오는 중" : "Loading app"}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        top: "env(safe-area-inset-top, 0px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--v2-bg)",
        transition: "opacity 0.2s ease",
        opacity: phase === "hiding" ? 0 : 1,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--v2-s-4)" }}>
        <Image
          src="/icons/icon-192.png"
          width={76}
          height={76}
          alt=""
          style={{ borderRadius: "20%" }}
          priority
        />
        <p style={{ fontFamily: "var(--v2-f-display)", fontSize: 22, fontWeight: 700, color: "var(--v2-ink)", margin: 0 }}>
          Workout Log
        </p>
        <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: "var(--v2-s-2)", color: "var(--v2-ink-2)" }}>
          <span style={{ font: "var(--font-secondary)" }}>{locale === "ko" ? "로딩 중..." : "Loading..."}</span>
        </div>
      </div>
    </div>
  );
}
