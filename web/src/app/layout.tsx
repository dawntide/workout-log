import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import "@/styles/index.css";
import "@/styles/components/bottom-sheet.css";
import { AppShell } from "@/components/app-shell";
import { AppLaunchSplash } from "@/components/app-launch-splash";
import { ThemePreferenceSync } from "@/components/theme-preference-sync";
import { LocalePreferenceSync } from "@/components/locale-preference-sync";
import { TimezonePreferenceSync } from "@/components/timezone-preference-sync";
import { LocaleProvider } from "@/components/locale-provider";
import { FontStylesheetLoader } from "@/components/font-stylesheet-loader";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { resolveRequestLocale } from "@/lib/i18n/server";
import type { AppLocale } from "@/lib/i18n/messages";

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
    const backgroundColor = resolvedDark ? "#0e0d12" : "#f6f1e8";

    document.documentElement.setAttribute("data-theme-preference", preference);
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
  const initialLocale: AppLocale = await resolveRequestLocale();
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <AppLaunchSplash />
      <AppShell initialLocale={initialLocale}>
        <ThemePreferenceSync />
        <LocalePreferenceSync />
        <TimezonePreferenceSync />
        {children}
      </AppShell>
    </LocaleProvider>
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
