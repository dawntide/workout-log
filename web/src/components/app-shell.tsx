"use client";

import { useEffect, useState, type ReactNode } from "react";
import { V2BottomNav } from "@/components/v2/v2-bottom-nav";
import { V2BottomDockProvider } from "@/components/v2/v2-bottom-dock-context";
import { AppDialogProvider } from "@/components/ui/app-dialog-provider";
import { ApiCacheWarmer } from "@/components/api-cache-warmer";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { V2AppUpdateBanner } from "@/components/v2/app-update-banner";
import { V2EmailVerificationBanner } from "@/components/v2/auth/v2-email-verification-banner";
import type { AppLocale } from "@/lib/i18n/messages";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useThemeSkin } from "@/components/use-theme-skin";
import {
  TermShell,
  TermKeyHintProvider,
  useTermFooterRegistration,
  type TermTab,
} from "@/components/v2/terminal";
import { APP_ROUTES } from "@/lib/app-routes";

const NAV_HIDDEN_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/onboarding",
  "/forgot-password",
  "/reset-password",
];

// PERF: 앱 시작 시 즉시 prefetch할 주요 네비게이션 경로
// 사용자가 탭을 클릭하기 전에 미리 JS 청크를 다운로드 → 네비게이션 체감 속도 향상
// 스탯 홈은 별도 페이지가 아니라 "/?deck=stats"(홈 데크)라 "/" prefetch가 커버한다.
const PREFETCH_ROUTES = ["/", "/workout/log", "/calendar", "/plans"];

// terminal 테마 셸의 탭 스트립 = 네비게이션(paper의 V2BottomNav 대체). href로 SPA 이동.
const TERM_TABS: TermTab[] = [
  { key: "home", label: "home", href: "/" },
  { key: "log", label: "log", href: "/workout/log" },
  { key: "stats", label: "stats", href: APP_ROUTES.statsHome },
  { key: "cal", label: "cal", href: APP_ROUTES.calendarHome },
  { key: "store", label: "store", href: APP_ROUTES.programStore },
  { key: "more", label: "more", href: "/settings" },
];

function isStatsDeck(deck: string | null): boolean {
  return deck === "stats" || deck === "progress";
}

function activeTermTab(pathname: string, deck: string | null): string {
  if (pathname === "/") return isStatsDeck(deck) ? "stats" : "home";
  if (pathname.startsWith("/workout/log")) return "log";
  if (pathname.startsWith("/stats")) return "stats";
  if (pathname.startsWith(APP_ROUTES.calendarHome)) return "cal";
  if (pathname.startsWith(APP_ROUTES.programStore)) return "store";
  if (pathname.startsWith("/settings")) return "more";
  return "log";
}

function termPath(pathname: string, deck: string | null): string {
  if (pathname === "/") return isStatsDeck(deck) ? "~/stats" : "~/home";
  return `~${pathname}`;
}

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
  const skin = useThemeSkin();
  const deck = useSearchParams().get("deck");
  const [clock, setClock] = useState("");

  // 터미널 셸 타이틀바 시계 — 클라 전용(SSR 불일치 방지), terminal일 때만 tick.
  useEffect(() => {
    if (skin !== "terminal") return;
    const tick = () => {
      const d = new Date();
      setClock(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      );
    };
    tick();
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, [skin]);

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

  // ── terminal 스킨: AppShell chrome를 TermShell로 교체(풀하이트 프레임) ──
  // V2BottomNav·배너·app-shell wrapper 생략, children은 TermShell ViewPane에.
  // providers(Dialog/Dock)·ApiCacheWarmer는 기능이라 유지. paper 트리는 아래 그대로(무수정).
  if (skin === "terminal" && !hideNav) {
    return (
      <AppDialogProvider>
        <V2BottomDockProvider>
          <ApiCacheWarmer />
          {/* PWA 당겨서 새로고침 — ViewPane(.term-viewpane) 내부 스크롤 기준 */}
          {!hideNav && <PullToRefresh variant="terminal" />}
          {/* 화면이 등록한 푸터(mode·keyHints·statusRight)를 셸이 읽어 렌더 */}
          <TermKeyHintProvider>
            <TermShellHost
              path={termPath(pathname, deck)}
              clock={clock}
              tabs={TERM_TABS}
              activeTab={activeTermTab(pathname, deck)}
            >
              {children}
            </TermShellHost>
          </TermKeyHintProvider>
        </V2BottomDockProvider>
      </AppDialogProvider>
    );
  }

  return (
    <AppDialogProvider>
      <V2BottomDockProvider>
        <ApiCacheWarmer />
        <div className="app-shell v2-frame flex flex-col min-h-screen">
          {!hideNav && <PullToRefresh />}
          {!hideNav && <V2AppUpdateBanner />}
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

// 셸 chrome 안에서 화면이 등록한 푸터(mode·keyHints·statusRight)를 읽어 TermShell에 전달.
// TermKeyHintProvider 내부에 mount돼야 컨텍스트를 읽는다(= AppShell terminal 분기 안).
function TermShellHost({
  path,
  clock,
  tabs,
  activeTab,
  children,
}: {
  path: string;
  clock: string;
  tabs: TermTab[];
  activeTab: string;
  children: ReactNode;
}) {
  const footer = useTermFooterRegistration();
  return (
    <TermShell
      path={path}
      clock={clock}
      tabs={tabs}
      activeTab={activeTab}
      mode={footer?.mode ?? "-- NORMAL --"}
      modeTone={footer?.modeTone ?? "normal"}
      statusRight={footer?.statusRight}
      keyHints={footer?.keyHints ?? []}
    >
      {children}
    </TermShell>
  );
}
