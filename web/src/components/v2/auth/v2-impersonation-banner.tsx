"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { V2Icon } from "@/components/v2/primitives/v2-icon";
import { errorMessage } from "@/lib/error-message";
import { clearClientStateForAccountSwitch } from "@/lib/local-app-state";

type MeResponse = {
  user: null | { email: string | null; impersonating?: boolean };
};

/**
 * 테스트 계정으로 전환 중임을 알리는 상시 배너.
 *
 * **닫을 수 없다.** 다른 배너와 다른 유일한 점이고, 의도적이다 — 지금 보고 있는 것이
 * 실데이터인지 아닌지를 잊는 순간이 이 기능의 유일한 위험이다. 복귀 버튼도 여기 있다:
 * 전환 중에는 role이 test라 관리자 화면(/settings/debug)이 404가 되므로, 돌아갈 길이
 * 그 페이지에만 있으면 갇힌다.
 */
export function V2ImpersonationBanner() {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as MeResponse;
        if (!cancelled && body.user?.impersonating) {
          setEmail(body.user.email);
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

  if (!visible) return null;

  const goBack = async () => {
    if (returning) return;
    setReturning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/impersonate/return", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? (ko ? "복귀에 실패했습니다." : "Failed to return."));
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

  return (
    <div
      role="status"
      style={{
        // sticky + z-index는 장식이 아니라 기능이다. 온보딩 화면은 position:fixed·z-index:90
        // 오버레이라, 흐름에 그냥 놓으면 배너가 **렌더는 되는데 가려진다** — 돌아가기 버튼이
        // 눌리지 않는다(실측). 스크롤해도 따라와 "지금 테스트 계정"이라는 사실이 유지된다.
        position: "sticky",
        top: 0,
        zIndex: 100,
        margin: "12px 12px 0",
        padding: "var(--v2-s-3) var(--v2-s-4)",
        borderRadius: "var(--v2-r-2)",
        background: "color-mix(in srgb, var(--v2-c-danger) 14%, var(--v2-paper))",
        color: "var(--v2-ink)",
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--v2-s-3)",
      }}
    >
      <V2Icon
        name="science"
        style={{ color: "var(--v2-c-danger)", fontSize: "var(--v2-t-20)", marginTop: 1 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="v2-font-display" style={{ fontSize: "var(--v2-t-small)", fontWeight: 700 }}>
          {ko ? "테스트 계정 사용 중" : "Using a test account"}
        </div>
        <div
          className="v2-small"
          style={{
            color: error ? "var(--v2-c-danger)" : "var(--v2-ink-2)",
            marginTop: 2,
            fontSize: "var(--v2-t-12)",
          }}
        >
          {error
            ? error
            : ko
              ? `지금 보이는 기록은 ${email ?? "테스트 계정"}의 것입니다.`
              : `You are seeing data for ${email ?? "the test account"}.`}
        </div>
      </div>
      <button
        type="button"
        onClick={goBack}
        disabled={returning}
        className="v2-font-display"
        style={{
          border: "none",
          borderRadius: "var(--v2-r-1)",
          background: "transparent",
          color: "var(--v2-c-danger)",
          minHeight: "var(--v2-touch)",
          padding: "0 var(--v2-s-2)",
          fontSize: "var(--v2-t-12)",
          fontWeight: 800,
          cursor: returning ? "default" : "pointer",
          flexShrink: 0,
        }}
      >
        {returning ? (ko ? "복귀 중" : "Returning") : ko ? "돌아가기" : "Return"}
      </button>
    </div>
  );
}
