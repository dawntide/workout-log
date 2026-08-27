"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { useLocale } from "@/components/locale-provider";
import { V2Icon } from "@/components/v2/primitives/v2-icon";
import { errorMessage } from "@/lib/error-message";
import { clearClientStateForAccountSwitch } from "@/lib/local-app-state";
import {
  isNextSaveFailureArmed,
  setNextSaveFailureArmed,
  subscribeDebugFlags,
} from "@/lib/debug-flags";
import {
  getApiRequestLog,
  subscribeApiRequestLog,
  type ApiRequestLogEntry,
} from "@/lib/api-request-log";

type MeResponse = {
  user: null | { id: string; email: string | null; impersonating?: boolean };
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

/** 접힌 원의 지름. --v2-touch(44px)와 같아야 하고, 첫 배치 계산에만 쓴다. */
const COLLAPSED_SIZE_PX = 44;

/** 기본 자리: 오른쪽 아래, 바텀 네비 위. 엄지로 닿고 페이지 헤더를 가리지 않는다. */
function defaultPosition(): Point {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return {
    x: window.innerWidth - COLLAPSED_SIZE_PX - EDGE_MARGIN_PX,
    y: window.innerHeight - 180,
  };
}

export function V2ImpersonationDock() {
  const { locale } = useLocale();
  const { confirm } = useAppDialog();
  const ko = locale === "ko";
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  /** 한 번에 하나만 돈다 — 시드 도중 초기화가 끼어들면 결과가 뒤섞인다. */
  const [busy, setBusy] = useState<null | "seed" | "reset" | "cache" | "copy">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [saveFailArmed, setSaveFailArmed] = useState(false);
  const [log, setLog] = useState<ApiRequestLogEntry[]>([]);
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
          setUserId(body.user.id);
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

  // 펼치면 패널이 알약보다 훨씬 높아진다 — 하단 근처에서 열면 아래로 잘려 초기화·돌아가기
  // 버튼이 화면 밖으로 나간다(실측). 열리는 순간 세로만 다시 안으로 밀어 넣는다.
  //
  // 가로는 건드리지 않는다. 오른쪽 절반에서는 패널을 translateX로 이미 왼쪽으로 펴므로,
  // 변환 전 좌표까지 클램프하면 알약이 화면 왼쪽으로 크게 튄다.
  useEffect(() => {
    if (!expanded) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition((prev) => {
      if (!prev) return prev;
      const maxY = Math.max(EDGE_MARGIN_PX, window.innerHeight - rect.height - EDGE_MARGIN_PX);
      const nextY = Math.min(prev.y, maxY);
      return nextY === prev.y ? prev : { x: prev.x, y: nextY };
    });
  }, [expanded]);

  // 호출 로그는 **열어 둔 동안만** 구독한다. 링 버퍼는 항상 쌓이지만, 닫힌 패널이
  // 매 요청마다 리렌더할 이유는 없다.
  useEffect(() => {
    if (!expanded || !logOpen) return;
    setLog(getApiRequestLog());
    return subscribeApiRequestLog(() => setLog(getApiRequestLog()));
  }, [expanded, logOpen]);

  // 저장이 플래그를 소비하면 스스로 꺼지므로, 패널이 열려 있는 동안 그 변화를 따라간다.
  useEffect(() => {
    if (!expanded) return;
    setSaveFailArmed(isNextSaveFailureArmed());
    return subscribeDebugFlags(() => setSaveFailArmed(isNextSaveFailureArmed()));
  }, [expanded]);

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

  /**
   * 전환 중에는 role이 test라 /settings/debug도 /settings/data의 관리자용 항목도 닿지
   * 않는다. 테스트 세션에서 실제로 필요한 도구는 그래서 여기 있어야 한다.
   */
  const runAction = async (
    kind: "seed" | "reset" | "cache",
    request: () => Promise<void>,
    doneMessage: string,
  ) => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      await request();
      // 데이터가 바뀌었으니 이전 캐시를 끝까지 지운 뒤 다시 그린다 — 안 그러면 웜업이
      // 옛 화면을 복원해 방금 한 일이 안 보인다.
      await clearClientStateForAccountSwitch();
      setNotice(doneMessage);
      window.location.reload();
    } catch (err) {
      setError(errorMessage(err) ?? (ko ? "실패했습니다." : "Failed."));
      setBusy(null);
    }
  };

  const seedDemoData = () =>
    runAction(
      "seed",
      async () => {
        const res = await fetch("/api/settings/seed-demo-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!res.ok) throw new Error(ko ? "데모 시드에 실패했습니다." : "Seeding failed.");
      },
      ko ? "데모 데이터를 시드했습니다." : "Demo data seeded.",
    );

  const resetAppData = async () => {
    if (busy) return;
    // 되돌릴 수 없다. 테스트 계정에만 작용하지만 그 계정의 기록도 사라지므로 확인을 받는다.
    const confirmed = await confirm({
      title: ko ? "앱 데이터 초기화" : "Reset app data",
      message: ko
        ? "이 테스트 계정의 기록·플랜·설정을 지웁니다. 되돌릴 수 없습니다."
        : "This clears this test account's logs, plans, and settings. It cannot be undone.",
      confirmText: ko ? "초기화" : "Reset",
      cancelText: ko ? "취소" : "Cancel",
      tone: "danger",
    });
    if (!confirmed) return;
    await runAction(
      "reset",
      async () => {
        const res = await fetch("/api/settings/app-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmToken: "RESET_APP_DATA" }),
        });
        if (!res.ok) throw new Error(ko ? "초기화에 실패했습니다." : "Reset failed.");
      },
      ko ? "초기화했습니다." : "Reset complete.",
    );
  };

  const clearCaches = () =>
    runAction(
      "cache",
      async () => {},
      ko ? "캐시를 비웠습니다." : "Caches cleared.",
    );

  /** uuid는 DB·로그와 대조할 때 필요하다 — 화면에는 앞 8자만, 복사는 전체를 준다. */
  const copyUserId = async () => {
    if (!userId || busy) return;
    setBusy("copy");
    try {
      await navigator.clipboard.writeText(userId);
      setNotice(ko ? "사용자 ID를 복사했습니다." : "User ID copied.");
    } catch {
      setError(ko ? "복사할 수 없습니다." : "Copy is unavailable.");
    } finally {
      setBusy(null);
    }
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

          {/* 신원 — 탭하면 uuid 전체가 복사된다(DB·로그 대조용). */}
          <button
            type="button"
            onClick={copyUserId}
            disabled={!userId || busy !== null}
            className="v2-small"
            style={{
              marginTop: 2,
              width: "100%",
              border: "none",
              background: "transparent",
              padding: 0,
              textAlign: "left",
              color: "var(--v2-ink-2)",
              fontSize: "var(--v2-t-12)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              cursor: userId ? "pointer" : "default",
            }}
          >
            {email ?? (ko ? "테스트 계정" : "Test account")}
            {userId ? ` · ${userId.slice(0, 8)}` : ""}
          </button>

          <div style={{ marginTop: "var(--v2-s-3)", display: "grid", gap: "var(--v2-s-1)" }}>
            <DockAction
              icon="science"
              label={busy === "seed" ? (ko ? "시드 중…" : "Seeding…") : ko ? "데모 데이터 시드" : "Seed demo data"}
              disabled={busy !== null}
              onClick={() => {
                void seedDemoData();
              }}
            />
            <DockAction
              icon="cached"
              label={busy === "cache" ? (ko ? "비우는 중…" : "Clearing…") : ko ? "캐시 비우고 새로고침" : "Clear caches & reload"}
              disabled={busy !== null}
              onClick={() => {
                void clearCaches();
              }}
            />
            <DockAction
              icon={saveFailArmed ? "bolt" : "error_outline"}
              label={
                saveFailArmed
                  ? ko
                    ? "다음 저장 1회 실패 — 무장됨"
                    : "Next save fails once — armed"
                  : ko
                    ? "다음 저장 1회 실패"
                    : "Fail next save once"
              }
              tone={saveFailArmed ? "danger" : undefined}
              onClick={() => setNextSaveFailureArmed(!saveFailArmed)}
            />
            <DockAction
              icon="delete_sweep"
              label={busy === "reset" ? (ko ? "초기화 중…" : "Resetting…") : ko ? "앱 데이터 초기화" : "Reset app data"}
              tone="danger"
              disabled={busy !== null}
              onClick={() => {
                void resetAppData();
              }}
            />
            <DockAction
              icon="network_check"
              label={
                ko
                  ? `최근 API 호출${log.length ? ` (${log.length})` : ""}`
                  : `Recent API calls${log.length ? ` (${log.length})` : ""}`
              }
              onClick={() => setLogOpen((prev) => !prev)}
            />
          </div>

          {logOpen && (
            <div
              style={{
                marginTop: "var(--v2-s-2)",
                // 목록이 화면을 잡아먹지 않게 뷰포트 비율로 묶는다 — 토큰은 4pt 그리드라
                // 이 용도(가변 목록 높이)에 맞는 값이 없다.
                maxHeight: "40vh",
                overflowY: "auto",
                borderRadius: "var(--v2-r-1)",
                background: "var(--v2-paper-2)",
                padding: "var(--v2-s-2)",
              }}
            >
              {log.length === 0 ? (
                <div className="v2-small" style={{ color: "var(--v2-ink-3)", fontSize: "var(--v2-t-12)" }}>
                  {ko ? "기록된 호출이 없습니다." : "No calls recorded yet."}
                </div>
              ) : (
                log.map((entry, index) => (
                  <div
                    key={`${entry.at}-${index}`}
                    className="v2-mono-label"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--v2-s-2)",
                      fontSize: "var(--v2-t-12)",
                      color: entry.ok ? "var(--v2-ink-2)" : "var(--v2-c-danger)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {entry.method} {entry.path}
                    </span>
                    <span>{entry.status ?? (ko ? "실패" : "ERR")}</span>
                    <span style={{ color: "var(--v2-ink-3)" }}>{entry.durationMs}ms</span>
                  </div>
                ))
              )}
            </div>
          )}

          {(error || notice) && (
            <div
              className="v2-small"
              style={{
                marginTop: "var(--v2-s-2)",
                color: error ? "var(--v2-c-danger)" : "var(--v2-ink-2)",
                fontSize: "var(--v2-t-12)",
              }}
            >
              {error ?? notice}
            </div>
          )}

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
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            // 정사각 + pill 반경 = 원. 한 변을 --v2-touch로 두어 아이콘만 남겨도
            // 44×44 터치 영역이 유지된다.
            width: "var(--v2-touch)",
            height: "var(--v2-touch)",
            padding: 0,
            // 아이콘 폰트가 아직/영영 안 실리면 ligature 문자열("science")이 그대로 그려져
            // 원 밖으로 삐져나온다 — 원형이라 클리핑이 곧 모양 보증이다.
            overflow: "hidden",
            border: "none",
            borderRadius: "var(--v2-r-pill)",
            background: "var(--v2-c-danger)",
            color: "var(--v2-ink-on-accent)",
            boxShadow: "0 6px 18px rgba(0, 0, 0, 0.2)",
            cursor: "pointer",
            touchAction: "none",
          }}
        >
          {/* 아이콘만 남으므로 이름은 aria-label이 진다(위). */}
          <V2Icon name="science" style={{ fontSize: "var(--v2-t-20)" }} />
        </button>
      )}
    </div>
  );
}

/** 패널 안의 한 줄짜리 도구 항목. 앞으로 도구가 늘어도 같은 모양으로 붙는다. */
function DockAction({
  icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="v2-font-display"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--v2-s-2)",
        width: "100%",
        minHeight: "var(--v2-touch)",
        padding: "0 var(--v2-s-2)",
        border: "none",
        borderRadius: "var(--v2-r-1)",
        background: "var(--v2-paper-2)",
        color: tone === "danger" ? "var(--v2-c-danger)" : "var(--v2-ink)",
        fontSize: "var(--v2-t-12)",
        fontWeight: 700,
        textAlign: "left",
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <V2Icon name={icon} style={{ fontSize: "var(--v2-t-18)" }} />
      {label}
    </button>
  );
}
