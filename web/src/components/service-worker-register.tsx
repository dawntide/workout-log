"use client";

import { useEffect } from "react";

/**
 * 서비스워커(/sw.js) 등록 컴포넌트.
 *
 * - SW 코드는 라우트 핸들러가 동적으로 서빙한다 (web/src/app/sw.js/route.ts).
 * - NEXT_PUBLIC_DISABLE_SW=1 이면 등록하지 않는다. 로컬 .env.local 기본값이 =1 이라
 *   dev에서는 자동으로 꺼진다 (dev SW는 HMR/스테일 캐시 혼란을 유발 → prod에서만 활성화).
 *   로컬에서 PWA를 검증하려면 플래그를 잠시 끄고 prod 빌드로 실행한다.
 * - 첫 페이지 로드 리소스 경쟁을 피하려 load 이벤트 이후에 등록한다.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DISABLE_SW === "1") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("[sw] 등록 실패:", error);
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
