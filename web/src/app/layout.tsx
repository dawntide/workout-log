import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import "@/styles/index.css";
import "@/styles/components/bottom-sheet.css";
import "@/styles/components/pull-to-refresh.css";
import { AppShell } from "@/components/app-shell";
import { AppLaunchSplash } from "@/components/app-launch-splash";
import { ThemePreferenceSync } from "@/components/theme-preference-sync";
import { LocalePreferenceSync } from "@/components/locale-preference-sync";
import { TimezonePreferenceSync } from "@/components/timezone-preference-sync";
import { LocaleProvider } from "@/components/locale-provider";
import { ThemeSkinProvider } from "@/components/use-theme-skin";
import { FontStylesheetLoader } from "@/components/font-stylesheet-loader";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { resolveRequestLocale } from "@/lib/i18n/server";
import { resolveRequestSkin } from "@/lib/settings/theme-skin-server";
import { getAppCopy, type AppLocale } from "@/lib/i18n/messages";
import type { ThemeSkin } from "@/lib/settings/workout-preferences";

// Inter Variable Font — wght 100–900 전 범위 지원
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const EARLY_THEME_BOOTSTRAP = `
(() => {
  try {
    const storageKey = "workout-log.setting.v1.prefs.theme.mode";
    const raw = window.localStorage.getItem(storageKey);
    let preference = "system";

    if (raw) {
      const parsed = JSON.parse(raw);
      const normalized = String(parsed?.value ?? "").trim().toLowerCase();
      if (normalized === "light" || normalized === "dark" || normalized === "system") {
        preference = normalized;
      }
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolvedDark = preference === "dark" || (preference !== "light" && prefersDark);

    // Theme skin (paper|terminal). terminal은 dark-only로 자체 캔버스를 가진다.
    let skin = "paper";
    try {
      const rawSkin = window.localStorage.getItem("workout-log.setting.v1.prefs.theme.skin");
      if (rawSkin) {
        const v = String(JSON.parse(rawSkin)?.value ?? "").trim().toLowerCase();
        if (v === "terminal") skin = "terminal";
      }
    } catch {}

    const backgroundColor = skin === "terminal" ? "#0b0e0b" : (resolvedDark ? "#0e0d12" : "#f6f1e8");

    document.documentElement.setAttribute("data-theme-preference", preference);
    if (skin === "terminal") document.documentElement.setAttribute("data-theme", "terminal");
    document.documentElement.style.backgroundColor = backgroundColor;
    document.body.style.backgroundColor = backgroundColor;
  } catch {}
})();
`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1, // [수정됨] 상태바 배경 애니메이션 딜레이 및 주소창 대응
  viewportFit: "cover", // [수정됨] 상태바 배경 애니메이션 딜레이 및 주소창 대응
  // No themeColor here: let Safari use its natural frosted-glass effect.
  // In standalone mode (iOS home screen), apple-mobile-web-app-status-bar-style
  // controls the status bar instead — see appleWebApp below.
};

export const metadata: Metadata = {
  title: "Workout Log",
  description: "Workout tracking",
  // PERF: PWA 최적화 - 홈 화면 추가 시 앱 수준 경험 제공
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Workout Log",
  },
  formatDetection: {
    // iOS Safari가 전화번호/이메일을 자동 감지해 링크로 변환하는 것 방지
    // 이 동작이 레이아웃 계산 비용을 유발할 수 있음
    telephone: false,
    email: false,
    address: false,
  },
};

// PPR 정적 쉘 호환: 동적 로케일 읽기를 Suspense 경계 안으로 격리.
// html[lang]은 기본값 "ko"로 서빙, suppressHydrationWarning으로 hydration mismatch 무시.
async function LocaleShell({ children }: { children: React.ReactNode }) {
  const [initialLocale, initialSkin]: [AppLocale, ThemeSkin] = await Promise.all([
    resolveRequestLocale(),
    resolveRequestSkin(),
  ]);
  // 서버에서 활성 로케일 copy를 계산해 prop으로 전달 → 클라이언트는 전 로케일 카탈로그를
  // 정적 import하지 않아 초기 번들에서 제외된다(전환 시에만 동적 로드). AppCopy는 순수
  // 문자열 카탈로그(직렬화 가드: messages.serializable.test.ts) — 함수형 카피가 남아있던
  // #491 시도는 RSC prop 직렬화 크래시로 revert(#493)됐었다.
  const initialCopy = getAppCopy(initialLocale);
  return (
    // ThemeSkinProvider: 서버가 wl_skin 쿠키로 확정한 초기 skin을 주입 → useThemeSkin이 첫 렌더부터
    // 올바른 셸(paper/terminal)을 반환. terminal 사용자의 per-load paper→terminal remount + flash 제거.
    // ThemePreferenceSync(sibling, AppShell보다 먼저 렌더)가 mount 시 store를 localStorage값으로
    // 동기 세팅하므로, AppShell 서브트리의 useThemeSkin 이펙트가 읽을 땐 이미 최신값 → 재remount 없음.
    <ThemeSkinProvider initialSkin={initialSkin}>
      <LocaleProvider initialLocale={initialLocale} initialCopy={initialCopy}>
        <AppLaunchSplash />
        {/* 테마/로케일/타임존 sync는 AppShell 밖(sibling)에 둔다.
            AppShell이 skin 토글로 paper↔terminal 트리를 전환하면 children이 remount되는데,
            ThemePreferenceSync가 children 안에 있으면 재실행되며 서버 스냅샷(persist 전 구값)을
            다시 적용해 방금 고른 skin을 되돌리는 race가 발생함(테마가 가끔 paper로 복귀).
            sibling으로 빼면 토글 시 remount되지 않음. */}
        <ThemePreferenceSync />
        <LocalePreferenceSync />
        <TimezonePreferenceSync />
        <AppShell initialLocale={initialLocale}>{children}</AppShell>
      </LocaleProvider>
    </ThemeSkinProvider>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: EARLY_THEME_BOOTSTRAP }} />
        {/* DNS + TCP 핸드셰이크 선점 */}
        {/* Pretendard 폰트 파일은 CDN에서 서빙 (CSS는 자체 호스팅) */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        {/* Material Symbols는 Google Fonts CDN */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* PERF: Pretendard CSS는 동일 도메인 자체 호스팅 → HTTP/2 멀티플렉싱 활용 */}
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
      </head>
      <body>
        <FontStylesheetLoader />
        <ServiceWorkerRegister />
        {/* PPR: 동적 쿠키/헤더 읽기를 Suspense 안으로 격리 → 정적 쉘 즉시 서빙 */}
        <Suspense fallback={null}>
          <LocaleShell>{children}</LocaleShell>
        </Suspense>
      </body>
    </html>
  );
}
