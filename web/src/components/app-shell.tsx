"use client";

import { useEffect, type ReactNode } from "react";
import { V2BottomNav } from "@/components/v2/v2-bottom-nav";
import { AppDialogProvider } from "@/components/ui/app-dialog-provider";
import { ApiCacheWarmer } from "@/components/api-cache-warmer";
import { V2EmailVerificationBanner } from "@/components/v2/auth/v2-email-verification-banner";
import type { AppLocale } from "@/lib/i18n/messages";
import { shouldUseViewTransition } from "@/lib/navigation/view-transition";
import { usePathname, useRouter } from "next/navigation";

const NAV_HIDDEN_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/onboarding",
  "/forgot-password",
  "/reset-password",
];

// PERF: 앱 시작 시 즉시 prefetch할 주요 네비게이션 경로
// 사용자가 탭을 클릭하기 전에 미리 JS 청크를 다운로드 → 네비게이션 체감 속도 향상
const PREFETCH_ROUTES = ["/", "/workout/log", "/stats", "/calendar", "/plans"];

/**
 * AppShell Component
 * PERF: View Transitions API로 네이티브 앱 같은 페이지 전환 제공.
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

  // PERF: 앱 마운트 시 주요 경로 prefetch (300ms 지연 후 → 초기 렌더 차단 방지)
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const route of PREFETCH_ROUTES) {
        router.prefetch(route);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [router]);

  // PERF: View Transitions API - iOS Safari 18+ / Android Chrome 111+ 지원
  // 미지원 브라우저는 자동 fallback (일반 router.push)
  useEffect(() => {
    if (!("startViewTransition" in document)) return;

    const handleLinkClick = (e: MouseEvent) => {
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
      const nextUrl = new URL(href, window.location.href);

      if (!shouldUseViewTransition(window.location.pathname, nextUrl.pathname)) {
        router.push(href);
        return;
      }

      (document as any).startViewTransition(() => {
        router.push(href);
      });
    };

    window.addEventListener("click", handleLinkClick);
    return () => window.removeEventListener("click", handleLinkClick);
  }, [router]);

  return (
    <AppDialogProvider>
      <ApiCacheWarmer />
      <div className="app-shell v2-frame flex flex-col min-h-screen">
        {!hideNav && <V2EmailVerificationBanner />}
        <main className="app-main flex-1 flex flex-col overflow-x-hidden">
          <div className="container app-shell__content">
            <div className="app-shell__page">
              {children}
            </div>
          </div>
        </main>
        {!hideNav && <V2BottomNav />}
      </div>
    </AppDialogProvider>
  );
}
