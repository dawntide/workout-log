"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MINIMAL_COPY_MODE } from "@/lib/ui/minimal-copy";
import { BottomSheetActionHeader, type BottomSheetPrimaryAction } from "./bottom-sheet-action-header";

const SHEET_STACK_EVENT = "mobile-bottom-sheet-stack-change";
const sheetStack: string[] = [];

function writeSheetStack(stack: string[]) {
  sheetStack.splice(0, sheetStack.length, ...stack);
  window.dispatchEvent(new Event(SHEET_STACK_EVENT));
}

function upsertSheetId(id: string) {
  const nextStack = sheetStack.filter((item) => item !== id);
  nextStack.push(id);
  writeSheetStack(nextStack);
}

function removeSheetId(id: string) {
  const currentStack = [...sheetStack];
  const nextStack = currentStack.filter((item) => item !== id);
  if (nextStack.length === currentStack.length) return;
  writeSheetStack(nextStack);
}

function topSheetId() {
  return sheetStack.length > 0 ? sheetStack[sheetStack.length - 1] : null;
}

function getActiveHtmlElement() {
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

function findScrollableAncestorWithin(root: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return null;

  let current: HTMLElement | null = target;
  while (current && current !== root) {
    const style = window.getComputedStyle(current);
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY);
    if (canScrollY && current.scrollHeight > current.clientHeight + 1) {
      return current;
    }
    current = current.parentElement;
  }

  return root.scrollHeight > root.clientHeight + 1 ? root : null;
}

function canScrollInDirection(element: HTMLElement, deltaY: number) {
  if (deltaY < 0) {
    return element.scrollTop > 0;
  }
  if (deltaY > 0) {
    return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
  }
  return true;
}

type BottomSheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  description?: string;
  className?: string;
  panelClassName?: string;
  closeLabel?: string;
  header?: ReactNode;
  primaryAction?: BottomSheetPrimaryAction | null;
  footer?: ReactNode;
};

export function BottomSheet({
  open,
  title,
  onClose,
  children,
  description,
  className = "",
  panelClassName = "",
  closeLabel = "Close",
  header,
  primaryAction = null,
  footer,
}: BottomSheetProps) {
  const sheetId = useId();
  const [present, setPresent] = useState(open);
  const [isTopSheet, setIsTopSheet] = useState(false);
  const [mounted, setMounted] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const closeAnimationTimerRef = useRef<number | null>(null);
  const openAnimationFrameRef = useRef<number | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const lastTouchYRef = useRef<number | null>(null);
  const prevPresentRef = useRef(open); // initialized to open (= initial present value)
  const closeAnimationMs = 400;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }

    if (!present) return;
    const timer = window.setTimeout(() => {
      setPresent(false);
    }, closeAnimationMs);

    return () => window.clearTimeout(timer);
  }, [closeAnimationMs, open, present]);

  const syncTopSheetState = useCallback(() => {
    if (!open) {
      setIsTopSheet(false);
      return;
    }
    setIsTopSheet(topSheetId() === sheetId);
  }, [open, sheetId]);

  useEffect(() => {
    if (!open) {
      if (openAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(openAnimationFrameRef.current);
        openAnimationFrameRef.current = null;
      }
      removeSheetId(sheetId);
      syncTopSheetState();
      return;
    }

    upsertSheetId(sheetId);
    window.addEventListener(SHEET_STACK_EVENT, syncTopSheetState);

    // Double rAF: let the panel mount in the off-screen (inert) state for one
    // frame before removing inert, so the CSS entry transition can fire.
    openAnimationFrameRef.current = window.requestAnimationFrame(() => {
      openAnimationFrameRef.current = window.requestAnimationFrame(() => {
        openAnimationFrameRef.current = null;
        syncTopSheetState();
      });
    });

    return () => {
      window.removeEventListener(SHEET_STACK_EVENT, syncTopSheetState);
      removeSheetId(sheetId);
      if (openAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(openAnimationFrameRef.current);
        openAnimationFrameRef.current = null;
      }
    };
  }, [open, sheetId, syncTopSheetState]);

  const isInteractiveSheet = open && isTopSheet;
  const hasDescription = !MINIMAL_COPY_MODE && Boolean(description);

  // Safety net: if React batched present+isTopSheet updates (both become true
  // in the same render), the panel mounts without inert and the CSS entry
  // transition never fires. Detect this case and force the initial off-screen
  // state synchronously, then restore CSS control in the next frame.
  //
  // wasPresent guard: prevents re-firing in React Strict Mode, where layout
  // effects are intentionally double-invoked (run → cleanup → run again).
  // On the Strict Mode re-run, isTopSheet is already true (set by the first
  // run's double rAF), so without this guard the safety net would fire a
  // second animation. wasPresent=true on re-run because prevPresentRef was
  // already updated to true on the first run.
  useLayoutEffect(() => {
    const wasPresent = prevPresentRef.current;
    prevPresentRef.current = present;

    if (!present || !isInteractiveSheet || wasPresent) return;
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transform = "translateY(100%)";
    panel.style.transition = "none";
    void panel.offsetHeight;
    panel.style.transition = "";
    const frame = requestAnimationFrame(() => {
      panel.style.transform = "";
    });
    return () => {
      cancelAnimationFrame(frame);
      panel.style.transform = "";
      panel.style.transition = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present]); // intentionally only [present]: runs once on mount

  useLayoutEffect(() => {
    if (isInteractiveSheet) return;

    const sheet = sheetRef.current;
    const activeElement = getActiveHtmlElement();
    if (sheet && activeElement && sheet.contains(activeElement)) {
      activeElement.blur();
    }
  }, [isInteractiveSheet]);

  useLayoutEffect(() => {
    if (!isInteractiveSheet) return;

    const sheet = sheetRef.current;
    const panel = panelRef.current;
    if (!sheet || !panel) return;

    const activeElement = getActiveHtmlElement();
    if (activeElement && !sheet.contains(activeElement)) {
      restoreFocusRef.current = activeElement;
    }
    if (activeElement && sheet.contains(activeElement)) return;

    const focusFrame = window.requestAnimationFrame(() => {
      const currentActiveElement = getActiveHtmlElement();
      if (currentActiveElement && sheet.contains(currentActiveElement)) return;
      panel.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [isInteractiveSheet]);

  useEffect(() => {
    if (open) return;

    const restoreTarget = restoreFocusRef.current;
    if (!restoreTarget?.isConnected) return;

    const focusFrame = window.requestAnimationFrame(() => {
      if (!restoreTarget.isConnected) return;

      const ownerSheet = restoreTarget.closest(".mobile-bottom-sheet");
      if (ownerSheet instanceof HTMLElement) {
        if (ownerSheet.hasAttribute("inert")) return;
      } else if (topSheetId() !== null) {
        return;
      }

      restoreTarget.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(focusFrame);
  }, [open]);

  const clearDragListeners = useCallback(() => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
  }, []);

  const clearDragVisual = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.classList.remove("is-dragging");
    panel.classList.remove("is-closing");
    panel.style.removeProperty("--mobile-bottom-sheet-drag-offset");
  }, []);

  const clearDragState = useCallback(() => {
    clearDragListeners();
    clearDragVisual();
    if (closeAnimationTimerRef.current !== null) {
      window.clearTimeout(closeAnimationTimerRef.current);
      closeAnimationTimerRef.current = null;
    }
  }, [clearDragListeners, clearDragVisual]);

  // 닫기 애니메이션: is-closing 클래스로 패널 슬라이드 → 애니메이션 후 onClose() 호출
  const handleClose = useCallback(() => {
    if (!isInteractiveSheet) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (panel.classList.contains("is-closing")) return;

    panel.classList.add("is-closing");
    window.setTimeout(() => {
      onClose();
    }, closeAnimationMs);
  }, [isInteractiveSheet, onClose, closeAnimationMs]);

  useEffect(() => {
    if (!isInteractiveSheet) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isInteractiveSheet, handleClose]);

  useEffect(() => {
    if (!isInteractiveSheet) return;

    const onPointerDown = (event: PointerEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      if (event.target instanceof Node && panel.contains(event.target)) return;
      handleClose();
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [isInteractiveSheet, handleClose]);

  useEffect(() => {
    if (!isInteractiveSheet) return;

    const content = contentRef.current;
    const panel = panelRef.current;
    if (!content || !panel) return;

    const onTouchStart = (event: TouchEvent) => {
      lastTouchYRef.current = event.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (event: TouchEvent) => {
      const target = event.target;
      const touchY = event.touches[0]?.clientY ?? null;
      const previousTouchY = lastTouchYRef.current;
      if (touchY !== null) {
        lastTouchYRef.current = touchY;
      }

      if (panel.contains(target as Node) && !content.contains(target as Node)) {
        event.preventDefault();
        return;
      }

      if (!content.contains(target as Node)) {
        event.preventDefault();
        return;
      }

      if (touchY === null || previousTouchY === null) return;

      const deltaY = previousTouchY - touchY;
      const scrollable = findScrollableAncestorWithin(content, target);
      if (!scrollable || !canScrollInDirection(scrollable, deltaY)) {
        event.preventDefault();
      }
    };

    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (panel.contains(target as Node) && !content.contains(target as Node)) {
        event.preventDefault();
        return;
      }

      if (!content.contains(target as Node)) {
        event.preventDefault();
        return;
      }

      const scrollable = findScrollableAncestorWithin(content, target);
      if (!scrollable || !canScrollInDirection(scrollable, event.deltaY)) {
        event.preventDefault();
      }
    };

    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    document.addEventListener("wheel", onWheel, { capture: true, passive: false });

    return () => {
      lastTouchYRef.current = null;
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("wheel", onWheel, true);
    };
  }, [isInteractiveSheet]);

  useEffect(() => {
    if (open) {
      if (closeAnimationTimerRef.current !== null) {
        window.clearTimeout(closeAnimationTimerRef.current);
        closeAnimationTimerRef.current = null;
      }
      clearDragVisual();
      return;
    }

    clearDragListeners();
    if (closeAnimationTimerRef.current !== null) window.clearTimeout(closeAnimationTimerRef.current);
    closeAnimationTimerRef.current = window.setTimeout(() => {
      clearDragVisual();
      closeAnimationTimerRef.current = null;
    }, closeAnimationMs);

    return () => {
      if (closeAnimationTimerRef.current === null) return;
      window.clearTimeout(closeAnimationTimerRef.current);
      closeAnimationTimerRef.current = null;
    };
  }, [open, clearDragListeners, clearDragVisual]);

  useEffect(() => () => clearDragState(), [clearDragState]);

  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>, skipInteractiveCheck = false) => {
      if (!isInteractiveSheet) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      // 헤더 내 버튼/링크 클릭 시 드래그 무시
      if (!skipInteractiveCheck) {
        const target = event.target as HTMLElement;
        if (target.closest('button, a, [role="button"]')) return;
      }
      const panel = panelRef.current;
      if (!panel) return;

      event.preventDefault();
      clearDragState();

      const panelHeight = panel.getBoundingClientRect().height;
      const closeThresholdPx = Math.min(Math.max(panelHeight * 0.22, 88), 180);
      const pointerId = event.pointerId;
      const startY = event.clientY;
      let dragOffset = 0;
      let lastY = startY;
      let lastTime = event.timeStamp;
      let velocityY = 0;

      panel.classList.add("is-dragging");
      panel.style.setProperty("--mobile-bottom-sheet-drag-offset", "0px");

      const finish = (close: boolean) => {
        clearDragListeners();
        panel.classList.remove("is-dragging");
        if (close) {
          // 드래그 놓는 위치에서 아래로 슬라이드 후 닫기
          panel.classList.add("is-closing");
          window.setTimeout(() => {
            onClose();
          }, closeAnimationMs);
          return;
        }
        panel.style.setProperty("--mobile-bottom-sheet-drag-offset", "0px");
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        dragOffset = Math.max(0, moveEvent.clientY - startY);
        panel.style.setProperty("--mobile-bottom-sheet-drag-offset", `${dragOffset}px`);
        if (dragOffset > 0) moveEvent.preventDefault();

        // 속도 추적 (px/ms)
        const dt = moveEvent.timeStamp - lastTime;
        if (dt > 0) velocityY = (moveEvent.clientY - lastY) / dt;
        lastY = moveEvent.clientY;
        lastTime = moveEvent.timeStamp;
      };

      const onPointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        // 임계값 초과 OR 빠른 플릭(0.5px/ms 이상 + 20px 이상 드래그)으로 닫기
        finish(dragOffset >= closeThresholdPx || (velocityY > 0.5 && dragOffset > 20));
      };

      const onPointerCancel = (cancelEvent: PointerEvent) => {
        if (cancelEvent.pointerId !== pointerId) return;
        finish(false);
      };

      dragCleanupRef.current = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
      };

      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerCancel);
    },
    [isInteractiveSheet, onClose, clearDragState, clearDragListeners],
  );

  const sheetElement = (
    <div
      ref={sheetRef}
      inert={!isInteractiveSheet}
      className={`mobile-bottom-sheet ${className}`}
    >
      <div className="mobile-bottom-sheet-frame">
        <section
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className={`mobile-bottom-sheet-panel ${panelClassName}`}
        >
          <div
            className="mobile-bottom-sheet-drag-handle"
            onPointerDown={(e) => onHandlePointerDown(e, true)}
          >
            <div aria-hidden="true" className="mobile-bottom-sheet-drag-handle-pill" />
          </div>
          {header ?? (primaryAction ? (
            <BottomSheetActionHeader
              title={title}
              description={hasDescription ? description : undefined}
              closeLabel={closeLabel}
              onClose={handleClose}
              action={primaryAction}
              onPointerDown={onHandlePointerDown}
            />
          ) : (
            <header
              className="mobile-bottom-sheet-header"
              onPointerDown={onHandlePointerDown}
            >
              <span aria-hidden="true" className="mobile-bottom-sheet-btn mobile-bottom-sheet-btn-spacer" />
              <div className="mobile-bottom-sheet-title">
                <h2>{title}</h2>
                {hasDescription ? <p>{description}</p> : null}
              </div>
              <button type="button" className="mobile-bottom-sheet-btn" onClick={handleClose} aria-label={closeLabel}>
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20, fontVariationSettings: "'wght' 500" }}>close</span>
              </button>
            </header>
          ))}
          <div ref={contentRef} className="mobile-bottom-sheet-content">{children}</div>
          {footer ? <footer className="mobile-bottom-sheet-footer">{footer}</footer> : null}
        </section>
      </div>
    </div>
  );

  if (!present) return null;
  if (!mounted) return null;

  return createPortal(sheetElement, document.body);
}
