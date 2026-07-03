import type { NextConfig } from "next";

const allowedDevOrigins = Array.from(new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "100.71.82.104",
  ...(process.env.NEXT_ALLOWED_DEV_ORIGINS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? []),
]));

const nextConfig: NextConfig = {
  allowedDevOrigins,
  env: {
    // Vercel deployment: use VERCEL_GIT_COMMIT_SHA, fallback to NEXT_PUBLIC_APP_VERSION or dev
    NEXT_PUBLIC_APP_VERSION: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) ?? process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
  },
  // PERF: Node.js 전용 패키지(pg)를 서버 번들에서 외부 모듈로 유지 → 클라이언트 번들 제외
  serverExternalPackages: ["pg", "pg-native"],
  // @workout/core는 빌드 산출물 없는 source-only TS 워크스페이스 패키지 → Next가 직접 트랜스파일
  transpilePackages: ["@workout/core"],
  // NOTE: cacheComponents(PPR)는 의도적으로 비활성화한다.
  // "use cache"/cacheLife/cacheTag/unstable_cache 사용처가 0건이라 자동 static shell 외
  // 이득이 없고, Vercel preview 빈 화면 + dev typecheck race 비용만 유발했다.
  // 캐싱은 lib/api.ts SWR 캐시 + API Route Cache-Control 헤더로 처리한다.
  experimental: {
    optimizePackageImports: ["drizzle-orm", "jotai", "idb"],
    // PERF: React 서버 렌더링 최적화 (불필요한 서버 컴포넌트 래퍼 제거)
    optimizeServerReact: true,
    // PERF: 클라이언트 사이드 라우터 캐시 TTL 설정
    // dynamic: 30s — API 데이터가 포함된 동적 페이지 캐시 (SWR 패턴과 정합)
    // static: 300s — 정적 페이지 캐시 (5분)
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
  // Vercel 환경에서는 output: "standalone"을 사용하지 않으므로 제거 또는 주석 처리
  // output: "standalone",
  outputFileTracingIncludes: {
    "/api/health": [
      "./scripts/migrate.mjs",
      "./scripts/seed-if-needed.mjs",
      "./src/server/db/migrations/*",
      "./node_modules/drizzle-orm/**/*",
      "./node_modules/pg/**/*",
    ],
  },
  // 서버 응답 gzip/brotli 압축 활성화 (Next.js 기본값이지만 명시)
  compress: true,
  // next/image 최적화: AVIF 우선, WebP 폴백 → 동일 품질에서 20-50% 용량 절감
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // production 빌드(Turbopack)에서만 React Compiler 활성화.
  // dev + Turbopack에서는 HMR 그래프 오류가 간헐적으로 발생할 수 있어 비활성화.
  reactCompiler: process.env.NODE_ENV === "production",
  async redirects() {
    const isProd = process.env.NODE_ENV === "production";
    return [
      // /workout/today 폐기 → 홈으로 영구 이동 (migration RM-1)
      { source: "/workout/today", destination: "/", permanent: true },
      // /workout/today/overrides → /workout/log/overrides 로 이전 (migration MV-2)
      { source: "/workout/today/overrides", destination: "/workout/log/overrides", permanent: true },
      // /workout/log/exercise-catalog → /exercises 단일화 (migration MV-1)
      {
        source: "/workout/log/exercise-catalog",
        destination: "/exercises?context=session",
        permanent: true,
      },
      // /test-safari 는 개발 전용 — 프로덕션에서는 홈으로 (migration RM-2)
      ...(isProd
        ? [{ source: "/test-safari", destination: "/", permanent: false }]
        : []),
    ];
  },
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    return [
      // 정적 자산 장기 캐싱 — content-hash URL이므로 1년 캐싱 안전
      // 개발 모드에서는 HMR 동작을 보호하기 위해 헤더를 추가하지 않음
      ...(isProd ? [{
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      }] : []),
      // PERF: 자체 호스팅 폰트 CSS 장기 캐싱 (내용 변경 시 파일명 변경으로 캐시 버스팅)
      {
        source: "/fonts/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // PWA 아이콘 / manifest(.webmanifest) / sw.js 중간 캐싱
      {
        source: "/(icons|manifest|sw.js)(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
