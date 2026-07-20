"use client";

import { useEffect } from "react";

import { FONT_STYLESHEETS } from "@/lib/fonts";

// layout.tsx의 블로킹 <link rel="stylesheet"> 대신 useEffect로 비동기 주입
// → FCP/LCP 개선: 렌더링이 폰트 다운로드를 기다리지 않음.
//
// 다운로드 자체는 layout.tsx의 <link rel="preload" as="style">가 HTML 파싱 시점에
// 이미 시작한다(preload는 렌더 블로킹이 아니다). 여기서의 주입은 "받아온 CSS를
// 적용"하는 단계라 캐시 히트로 끝나고, FOUT 구간이 "하이드레이션 + 다운로드"에서
// "하이드레이션"으로 줄어든다.

function ensureStylesheet(href: string): void {
  // 이미 삽입된 경우 중복 추가 방지. rel까지 봐야 한다 — 같은 href의
  // <link rel="preload">가 head에 먼저 있으므로(layout.tsx), href만 보면
  // preload를 "이미 적용됨"으로 오인해 정작 스타일시트를 넣지 않는다.
  if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
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
 */
export function FontStylesheetLoader() {
  useEffect(() => {
    for (const href of FONT_STYLESHEETS) ensureStylesheet(href);
  }, []);

  return null;
}
