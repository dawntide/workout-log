"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { V2Icon } from "@/components/v2/primitives/v2-icon";
import { errorMessage } from "@/lib/error-message";
import { clearClientStateForAccountSwitch } from "@/lib/local-app-state";

type MeResponse = {
  user: null | { email: string | null; impersonating?: boolean };
};

type Point = { x: number; y: number };

/**
 * 테스트 계정 전환 중에 뜨는 **떠 있는 알약**.
 *
 * 지켜야 하는 두 가지는 그대로다 — 지금 테스트 계정이라는 사실이 어느 화면에서든 보이고,
 * 거기서 바로 돌아올 수 있어야 한다(전환 중에는 role이 test라 /settings/debug가 404여서
 * 복귀 경로가 여기밖에 없다).
 *
 * 상시 배너(78px)를 걷어내고 알약으로 접은 이유는 둘이다. 화면 위쪽을 늘 차지하던 공간을
 * 돌려주고, 펼침 패널이 앞으로 디버그 도구 메뉴가 자랄 자리가 된다.
 *
 * **드래그로 옮길 수 있다.** 떠 있는 요소는 필연적으로 무언가를 가리는데, 어느 화면에서
 * 무엇을 가릴지는 미리 정할 수 없다. 옮길 수 있게 하면 그 판단을 사용자에게 넘기고,
 * 위치는 저장돼 다음에도 그 자리에 뜬다.
 */

const POSITION_STORAGE_KEY = "workout-log.v2.impersonation-dock.pos";
/** 이만큼 움직이면 탭이 아니라 드래그로 본다. 손가락은 완벽히 정지하지 않는다. */
const DRAG_THRESHOLD_PX = 6;
const EDGE_MARGIN_PX = 12;

function clampToViewport(point: Point, size: { width: number; height: number }): Point {
  if (typeof window === "undefined") return point;
  const maxX = Math.max(EDGE_MARGIN_PX, window.innerWidth - size.width - EDGE_MARGIN_PX);
  const maxY = Math.max(EDGE_MARGIN_PX, window.innerHeight - size.height - EDGE_MARGIN_PX);
  return {
    x: Math.min(Math.max(point.x, EDGE_MARGIN_PX), maxX),
    y: Math.min(Math.max(point.y, EDGE_MARGIN_PX), maxY),
  };
}

function readStoredPosition(): Point | null {
  try {
    const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Point>;
    if (typeof parsed?.x !== "number" || typeof parsed?.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

/** 기본 자리: 오른쪽 아래, 바텀 네비 위. 엄지로 닿고 페이지 헤더를 가리지 않는다. */
function defaultPosition(): Point {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return {
    x: window.innerWidth - 108,
    y: window.innerHeight - 180,
  };
}

export function V2ImpersonationDock() {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [position, setPosition] = useState<Point | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  // 드래그 핸들러는 window에 붙어 클로저가 낡는다 — 최신 위치를 ref로 따로 들고 본다.
  const positionRef = useRef<Point | null>(null);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as MeResponse;
        if (!cancelled && body.user?.impersonating) {
          setEmail(body.user.email);
          // **이미 자리가 정해졌으면 덮지 않는다.** 이 효과는 두 번 돌 수 있고(dev의
          // StrictMode 이중 실행, 재마운트), 두 번째 응답이 드래그 뒤에 도착하면 방금
          // 끌어 둔 위치를 기본값으로 되돌린다.
          setPosition((prev) => prev ?? readStoredPosition() ?? defaultPosition());
          setVisible(true);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 회전·리사이즈로 화면이 좁아지면 알약이 밖으로 나가 손이 닿지 않는다 — 다시 안으로 넣는다.
  useEffect(() => {
    if (!visible) return;
    const onResize = () => {
      setPosition((prev) => {
        if (!prev) return prev;
        const rect = rootRef.current?.getBoundingClientRect();
        return clampToViewport(prev, {
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
        });
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [visible]);

  // 펼친 상태에서 바깥을 누르면 접는다.
  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setExpanded(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [expanded]);

  const persistPosition = useCallback((next: Point) => {
    try {
      window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 저장이 막힌 환경에서도 이동 자체는 동작해야 한다.
    }
  }, []);

  /**
   * 드래그 시작. **pointermove/up은 window에 건다.**
   *
   * setPointerCapture에 기대면 커서가 알약을 벗어나는 순간 이벤트가 끊겨 그대로 멈춘다
   * (실측: 캡처가 걸리지 않는 환경에서 한 픽셀도 안 움직였다). window 리스너는 어디로
   * 끌든 따라온다.
   */
  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStateRef.current = {
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      moved: false,
    };

    const onMove = (moveEvent: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      const bounds = rootRef.current?.getBoundingClientRect();
      const next = clampToViewport(
        { x: moveEvent.clientX - drag.dx, y: moveEvent.clientY - drag.dy },
        { width: bounds?.width ?? 0, height: bounds?.height ?? 0 },
      );
      if (!drag.moved) {
        const base = positionRef.current;
        const movedEnough =
          !base ||
          Math.abs(next.x - base.x) > DRAG_THRESHOLD_PX ||
          Math.abs(next.y - base.y) > DRAG_THRESHOLD_PX;
        if (!movedEnough) return;
        drag.moved = true;
      }
      setPosition(next);
    };

    const onUp = () => {
      const drag = dragStateRef.current;
      dragStateRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (!drag) return;
      if (drag.moved) {
        // 움직였으면 그 자리를 저장한다 — 탭으로 오해해 패널을 펼치지 않는다.
        if (positionRef.current) persistPosition(positionRef.current);
        return;
      }
      setExpanded((prev) => !prev);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const goBack = async () => {
    if (returning) return;
    setReturning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/impersonate/return", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? (ko ? "복귀에 실패했습니다." : "Failed to return."));
        setReturning(false);
        return;
      }
      // 계정이 바뀌므로 이전 계정의 캐시를 **끝까지 지운 뒤** 리로드한다.
      await clearClientStateForAccountSwitch();
      window.location.href = "/";
    } catch (err) {
      setError(errorMessage(err) ?? (ko ? "네트워크 오류" : "Network error"));
      setReturning(false);
    }
  };

  if (!visible || !position) return null;

  const openLabel = ko ? "테스트 계정 메뉴 열기" : "Open test account menu";
  // 화면 오른쪽 절반에 있으면 패널을 왼쪽으로 편다 — 그래야 밖으로 나가지 않는다.
  const anchorRight =
    typeof window !== "undefined" && position.x > window.innerWidth / 2;

  return (
    <div
      ref={rootRef}
      role="status"
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        // 온보딩이 position:fixed·z-index:90 오버레이라 그 위로 올라와야 눌린다.
        zIndex: 100,
        touchAction: "none",
      }}
    >
      {expanded ? (
        <div
          style={{
            width: "min(78vw, 320px)",
            padding: "var(--v2-s-3) var(--v2-s-4)",
            borderRadius: "var(--v2-r-2)",
            background: "color-mix(in srgb, var(--v2-c-danger) 14%, var(--v2-paper))",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.18)",
            color: "var(--v2-ink)",
            transform: anchorRight ? "translateX(calc(-100% + var(--v2-s-9)))" : undefined,
          }}
        >
          {/* 이 줄이 드래그 손잡이다 — 패널을 펼친 채로도 옮길 수 있다. */}
          <div
            style={{ display: "flex", alignItems: "center", gap: "var(--v2-s-2)" }}
            onPointerDown={handlePointerDown}
          >
            <V2Icon
              name="science"
              style={{ color: "var(--v2-c-danger)", fontSize: "var(--v2-t-20)" }}
            />
            <div
              className="v2-font-display"
              style={{ flex: 1, fontSize: "var(--v2-t-small)", fontWeight: 700 }}
            >
              {ko ? "테스트 계정 사용 중" : "Using a test account"}
            </div>
            <V2Icon
              name="drag_indicator"
              style={{ color: "var(--v2-ink-3)", fontSize: "var(--v2-t-18)" }}
            />
          </div>

          <div
            className="v2-small"
            style={{
              color: error ? "var(--v2-c-danger)" : "var(--v2-ink-2)",
              marginTop: 2,
              fontSize: "var(--v2-t-12)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {error ?? email ?? (ko ? "테스트 계정" : "Test account")}
          </div>

          <button
            type="button"
            onClick={goBack}
            disabled={returning}
            className="v2-font-display"
            style={{
              marginTop: "var(--v2-s-3)",
              width: "100%",
              minHeight: "var(--v2-touch)",
              border: "none",
              borderRadius: "var(--v2-r-1)",
              background: "var(--v2-c-danger)",
              color: "var(--v2-ink-on-accent)",
              fontSize: "var(--v2-t-small)",
              fontWeight: 800,
              cursor: returning ? "default" : "pointer",
            }}
          >
            {returning
              ? ko
                ? "복귀 중"
                : "Returning"
              : ko
                ? "관리자로 돌아가기"
                : "Return to admin"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-label={openLabel}
          title={openLabel}
          onPointerDown={handlePointerDown}
          className="v2-font-display"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--v2-s-1)",
            minHeight: "var(--v2-touch)",
            padding: "0 var(--v2-s-3)",
            border: "none",
            borderRadius: "var(--v2-r-pill)",
            background: "var(--v2-c-danger)",
            color: "var(--v2-ink-on-accent)",
            fontSize: "var(--v2-t-12)",
            fontWeight: 800,
            boxShadow: "0 6px 18px rgba(0, 0, 0, 0.2)",
            cursor: "pointer",
            touchAction: "none",
          }}
        >
          <V2Icon name="science" style={{ fontSize: "var(--v2-t-18)" }} />
          TEST
        </button>
      )}
    </div>
  );
}
