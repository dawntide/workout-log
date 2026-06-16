import type { MetadataRoute } from "next";

// PWA Web App Manifest.
// Next.js 파일 기반 메타데이터 규칙 — /manifest.webmanifest 로 서빙되고
// <link rel="manifest"> 가 자동으로 <head>에 주입된다. "홈 화면에 추가(설치)" 가능.
// 다크 톤 앱 아이콘과 어울리도록 스플래시/테마 색은 다크 페이퍼 톤(--v2-paper dark)으로 통일한다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Workout Log",
    short_name: "Workout",
    description: "근력 운동 기록 앱",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "ko",
    dir: "ltr",
    background_color: "#16151c",
    theme_color: "#16151c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
