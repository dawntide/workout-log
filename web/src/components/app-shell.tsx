"use client";

import { useEffect, type ReactNode } from "react";
import { V2BottomNav } from "@/components/v2/v2-bottom-nav";
import { V2BottomDockProvider } from "@/components/v2/v2-bottom-dock-context";
import { AppDialogProvider } from "@/components/ui/app-dialog-provider";
import { ApiCacheWarmer } from "@/components/api-cache-warmer";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { V2AppUpdateBanner } from "@/components/v2/app-update-banner";
import { V2EmailVerificationBanner } from "@/components/v2/auth/v2-email-verification-banner";
import { V2ImpersonationDock } from "@/components/v2/auth/v2-impersonation-dock";
import type { AppLocale } from "@/lib/i18n/messages";
import { usePathname, useRouter } from "next/navigation";

const NAV_HIDDEN_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/onboarding",
  "/forgot-password",
  "/reset-password",
];

/**
 * 전환 알약만 따로 쓰는 숨김 목록 — 미인증 화면에서만 숨긴다.
 *
 * 온보딩이 빠진 것이 핵심이다. 갓 만들어진 테스트 계정으로 전환하면 첫 화면이 바로
 * 온보딩인데, 다른 배너와 같이 숨겼더니 **돌아갈 길이 없는 화면에 떨어졌다**(실측).
 * 전환 중에는 인증된 상태이므로 온보딩에서도 알약이 떠야 한다.
 */
const IMPERSONATION_DOCK_HIDDEN_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
];

// PERF: 앱 시작 시 즉시 prefetch할 주요 네비게이션 경로
// 사용자가 탭을 클릭하기 전에 미리 JS 청크를 다운로드 → 네비게이션 체감 속도 향상
// 스탯 홈은 별도 페이지가 아니라 "/?deck=stats"(홈 데크)라 "/" prefetch가 커버한다.
const PREFETCH_ROUTES = ["/", "/workout/log", "/calendar", "/plans"];

/**
 * AppShell Component
 * 페이지 전환: 콘텐츠 전용 페이드 애니메이션(.app-shell__page) — 바텀 네비의
 * backdrop-filter 블러를 끊지 않기 위해 document 레벨 View Transition은 쓰지 않음.
 * PERF: 주요 경로 prefetch로 즉각적인 네비게이션 응답성 확보.
 */
export function AppShell({
  initialLocale,
  children,
}: {
  initialLocale: AppLocale;
  children: ReactNode;
}) {
  void initialLocale;
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const hideNav = NAV_HIDDEN_PATH_PREFIXES.some((p) => pathname.startsWith(p));
  const hideImpersonationDock = IMPERSONATION_DOCK_HIDDEN_PREFIXES.some((p) =>
    pathname.startsWith(p),
  );

  // PERF: 앱 마운트 시 주요 경로 prefetch (300ms 지연 후 → 초기 렌더 차단 방지)
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const route of PREFETCH_ROUTES) {
        router.prefetch(route);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [router]);

  // 내부 링크(<a>)를 클라이언트 사이드 네비게이션으로 처리.
  // 과거에는 document.startViewTransition으로 감쌌으나, 반투명 backdrop-filter
  // 바텀 네비가 전환 중 스냅샷으로 교체되며 블러가 풀렸다 다시 생기는 깜빡임이
  // 있어(특히 iOS Safari) 제거했다. 전환 느낌은 네비를 건드리지 않는 콘텐츠
  // 전용 페이드(.app-shell__page, key=pathname)로 대체한다.
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      // next/link가 이미 처리한 클릭은 건너뛴다. Link의 onClick은 React 위임 핸들러라
      // 이 window 리스너보다 **먼저** 돌면서 preventDefault + 클라 네비게이션을 끝낸다.
      // 그걸 모르고 여기서 다시 router.push하면 같은 이동이 두 번 일어나, RSC 페이로드를
      // 두 번 받아온다(2026-08-11 실측: /plans/manage?_rsc=… 요청 2건 — 같은 URL·prefetch 아님.
      // raw <a>인 하단 네비는 1건). 히스토리는 라우터가 합쳐 pushState가 1회라 눈에 안 띄었다.
      if (e.defaultPrevented) return;

      const target = (e.target as HTMLElement).closest("a");
      if (
        !target ||
        target.origin !== window.location.origin ||
        target.hasAttribute("download") ||
        target.target === "_blank" ||
        e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
      ) return;

      e.preventDefault();
      const href = target.getAttribute("href");
      if (!href) return;
      router.push(href);
    };

    window.addEventListener("click", handleLinkClick);
    return () => window.removeEventListener("click", handleLinkClick);
  }, [router]);

  return (
    <AppDialogProvider>
      <V2BottomDockProvider>
        <ApiCacheWarmer />
        <div className="app-shell v2-frame flex flex-col min-h-screen">
          {!hideNav && <PullToRefresh />}
          {!hideNav && <V2AppUpdateBanner />}
          {/* 전환 알약은 흐름 밖(fixed)이라 배너들과 자리를 다투지 않는다. 숨김 조건만
              다르다(위 상수 주석 참조). */}
          {!hideImpersonationDock && <V2ImpersonationDock />}
          {!hideNav && <V2EmailVerificationBanner />}
          <main className="app-main flex-1 flex flex-col overflow-x-hidden">
            <div className="container app-shell__content">
              <div className="app-shell__page" key={pathname}>
                {children}
              </div>
            </div>
          </main>
          {!hideNav && <V2BottomNav />}
        </div>
      </V2BottomDockProvider>
    </AppDialogProvider>
  );
}
