"use client";

import { useEffect } from "react";

import { useThemeSkin } from "@/components/use-theme-skin";

// layout.tsx의 블로킹 <link rel="stylesheet"> 대신 useEffect로 비동기 주입
// → FCP/LCP 개선: 렌더링이 폰트 다운로드를 기다리지 않음.

// 모든 스킨에서 필요한 폰트 스타일시트.
const BASE_FONT_STYLESHEETS = [
  // PERF: Pretendard Variable (한글) — 자체 호스팅 CSS로 CDN DNS 왕복 제거.
  // 폰트 파일은 CDN에서 서빙하되, CSS 자체는 동일 도메인 → HTTP/2 멀티플렉싱 활용.
  "/fonts/pretendard-subset.css",
  // Material Symbols Outlined — variable 아이콘 폰트 (display=swap 포함).
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap",
];

// ironlog terminal 테마 전용 모노 폰트 (self-host @font-face).
// terminal 스킨일 때만 로드 — paper 사용자(다수)에게는 불필요한 CSS+폰트 파일 다운로드.
const TERMINAL_FONT_STYLESHEET = "/fonts/terminal-mono.css";

function ensureStylesheet(href: string): void {
  // 이미 삽입된 경우 중복 추가 방지.
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  // crossOrigin 미설정 — CSS 스타일시트는 CORS 불필요, Safari 호환성 확보.
  // crossOrigin="anonymous"를 설정하면 Safari가 stylesheet를 CORS 컨텍스트로 처리하고
  // 내부 @font-face → fonts.gstatic.com 폰트 파일을 다른 CORS 컨텍스트로 취급해 로드 거부.
  document.head.appendChild(link);
}

/**
 * CDN/자체호스팅 폰트 스타일시트를 비블로킹으로 로드하는 컴포넌트.
 *
 * 이유: <link rel="stylesheet">는 렌더 블로킹 리소스임. CSS를 다운로드하는 동안
 * 브라우저는 어떤 픽셀도 그리지 않아 모바일 LTE 기준 약 200-400ms FCP 지연이 발생.
 * useEffect 내에서 동적으로 <link>를 삽입해 시스템 폰트로 즉시 렌더 후 swap 교체.
 *
 * terminal-mono는 스킨이 terminal일 때만 로드한다(런타임 토글에도 반응). paper 스킨은
 * 이 폰트를 쓰지 않으므로 다수 사용자의 불필요한 다운로드를 제거한다.
 */
export function FontStylesheetLoader() {
  const skin = useThemeSkin();

  useEffect(() => {
    for (const href of BASE_FONT_STYLESHEETS) ensureStylesheet(href);
  }, []);

  useEffect(() => {
    if (skin === "terminal") ensureStylesheet(TERMINAL_FONT_STYLESHEET);
  }, [skin]);

  return null;
}
