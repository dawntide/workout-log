"use client";

import { useEffect, useRef, useState } from "react";

// 당김 임계값/최대치 — 손가락 이동에 감쇠를 적용해 임계값 이상 당겨야 트리거된다.
const THRESHOLD = 70;
const MAX_PULL = 120;
// 감쇠 계수가 클수록 손가락보다 천천히 따라온다. Safari처럼 당길수록 저항이
// 커지는 고무줄 느낌을 주기 위해 진행도에 따라 감쇠를 점진적으로 강화한다.
const BASE_DAMPING = 0.6;

/**
 * 설치된 PWA(standalone)에서 "당겨서 새로고침".
 *
 * - iOS 홈 화면 standalone에는 Safari 네이티브 당겨서 새로고침이 없고,
 *   앱이 `overscroll-behavior-y: contain`(base.css)으로 브라우저 기본 PTR도 꺼놨다.
 *   → 커스텀 제스처로 제공.
 * - 동작: 임계값 이상 당기고 놓으면 `location.reload()` (SW network-first가 fresh 제공).
 * - 성능: 드래그 중 값은 React state 대신 CSS 변수(`--ptr-y`)로 DOM에 직접 반영.
 *
 * document(body) 스크롤 최상단(`window.scrollY===0`)에서 추적하고,
 * safe-area를 포함하지 않는 `.app-shell__content`만 transform으로 끌어내린다.
 * `.app-main`을 움직이면 iOS PWA가 상단 합성 상태를 다시 잡아 상태바에 solid tint가
 * 남을 수 있으므로 safe-area 레이어는 제스처 내내 고정한다.
 */
export function PullToRefresh() {
  const [active, setActive] = useState(false);
  const elRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!isStandalone || !("ontouchstart" in window)) return;
    setActive(true);

    let startY = 0;
    let tracking = false;
    let pull = 0;
    let refreshing = false;
    let resetTimer = 0;

    const atTop = () =>
      (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    // 열려 있는(=비활성 inert가 아닌) 바텀시트/다이얼로그가 있으면 PTR을 멈춘다.
    const modalOpen = () => Boolean(document.querySelector(".mobile-bottom-sheet:not([inert])"));

    const getPullSurface = () =>
      document.querySelector<HTMLElement>(".app-shell__content");

    // 손가락 이동량(dy) → 점진적 감쇠가 적용된 당김 거리. 당길수록 저항 증가.
    const damp = (dy: number) => {
      const linear = dy * BASE_DAMPING;
      // 임계값을 넘어선 영역은 추가 감쇠로 더 무겁게 → 고무줄 느낌.
      const eased = MAX_PULL * (1 - Math.exp(-linear / MAX_PULL));
      return Math.min(MAX_PULL, eased);
    };

    const setVars = (y: number) => {
      const node = elRef.current;
      if (node) {
        node.style.setProperty("--ptr-y", `${y}px`);
        node.style.setProperty("--ptr-opacity", `${Math.min(1, y / THRESHOLD)}`);
      }
      // 페이지 콘텐츠를 함께 끌어내려 "페이지가 당겨지는" 감각을 준다.
      const surface = getPullSurface();
      if (surface) {
        surface.style.transform = y > 0 ? `translate3d(0, ${y}px, 0)` : "";
      }
    };

    // 손가락을 떼거나 취소될 때 페이지/배지를 부드럽게 제자리로 복귀.
    const animatePageBack = () => {
      const surface = getPullSurface();
      if (!surface) return;
      surface.style.transition = "transform var(--v2-d-3, 0.32s) var(--v2-e-out, cubic-bezier(0.22,0.61,0.36,1))";
      surface.style.transform = "";
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => {
        surface.style.transition = "";
      }, 360);
    };

    const reset = (animate = false) => {
      tracking = false;
      pull = 0;
      elRef.current?.classList.remove("is-dragging", "is-ready");
      const node = elRef.current;
      if (node) {
        node.style.setProperty("--ptr-y", "0px");
        node.style.setProperty("--ptr-opacity", "0");
      }
      if (animate) animatePageBack();
      else {
        const surface = getPullSurface();
        if (surface) surface.style.transform = "";
      }
    };

    const onStart = (e: TouchEvent) => {
      if (refreshing || e.touches.length !== 1 || !atTop() || modalOpen()) {
        tracking = false;
        return;
      }
      window.clearTimeout(resetTimer);
      const surface = getPullSurface();
      if (surface) surface.style.transition = "";
      startY = e.touches[0]?.clientY ?? 0;
      tracking = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking || refreshing) return;
      // 제스처 도중 모달이 열렸다면 즉시 중단.
      if (modalOpen()) {
        reset(pull > 0);
        return;
      }
      const touch = e.touches[0];
      if (!touch) return;
      const dy = touch.clientY - startY;
      if (dy <= 0 || !atTop()) {
        if (pull > 0) reset();
        else tracking = false;
        return;
      }
      // 최상단에서 아래로 당기는 중 — 기본 스크롤/바운스 차단
      e.preventDefault();
      pull = damp(dy);
      const node = elRef.current;
      if (node) {
        node.classList.add("is-dragging");
        node.classList.toggle("is-ready", pull >= THRESHOLD);
      }
      setVars(pull);
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      const node = elRef.current;
      if (pull >= THRESHOLD && node) {
        refreshing = true;
        node.classList.remove("is-dragging", "is-ready");
        node.classList.add("is-refreshing");
        const icon = node.querySelector(".ptr__icon");
        if (icon) icon.textContent = "progress_activity";
        node.style.setProperty("--ptr-y", `${THRESHOLD}px`);
        node.style.setProperty("--ptr-opacity", "1");
        // 페이지는 살짝 당겨진 상태에서 멈췄다가 새로고침되도록 임계값 위치로 정착.
        const surface = getPullSurface();
        if (surface) {
          surface.style.transition = "transform var(--v2-d-2, 0.22s) var(--v2-e-out, cubic-bezier(0.22,0.61,0.36,1))";
          surface.style.transform = `translate3d(0, ${THRESHOLD}px, 0)`;
        }
        // 스피너가 잠깐 보이도록 살짝 지연 후 새로고침
        window.setTimeout(() => window.location.reload(), 320);
      } else {
        reset(true);
      }
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.clearTimeout(resetTimer);
      const surface = getPullSurface();
      if (surface) {
        surface.style.transform = "";
        surface.style.transition = "";
      }
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  if (!active) return null;

  return (
    <div ref={elRef} className="ptr" aria-hidden="true">
      <div className="ptr__badge">
        <span className="ptr__icon material-symbols-outlined">arrow_downward</span>
      </div>
    </div>
  );
}
