"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/locale-provider";

type MeResponse = {
  user:
    | null
    | {
        email: string | null;
        emailVerifiedAt: string | null;
        fallback?: boolean;
      };
};

export function V2EmailVerificationBanner() {
  const { locale } = useLocale();
  const [visible, setVisible] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as MeResponse;
        const user = body.user;
        if (!cancelled && user?.email && !user.emailVerifiedAt && !user.fallback) {
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

  const resend = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/email/verification/request", {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Failed");
        return;
      }
      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="status"
      style={{
        margin: "12px 12px 0",
        padding: "12px 14px",
        borderRadius: 14,
        background: "color-mix(in srgb, var(--v2-accent) 12%, var(--v2-paper))",
        color: "var(--v2-ink)",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span className="material-symbols-outlined" style={{ color: "var(--v2-accent)" }} aria-hidden>
        mark_email_unread
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--v2-f-display)", fontSize: 13, fontWeight: 700 }}>
          {locale === "ko" ? "이메일 인증이 필요합니다" : "Email verification needed"}
        </div>
        <div className="v2-mono-label" style={{ color: error ? "var(--v2-c-danger)" : "var(--v2-ink-3)", marginTop: 2 }}>
          {error
            ? error
            : sent
              ? locale === "ko"
                ? "인증 메일을 다시 보냈습니다."
                : "Verification email sent."
              : locale === "ko"
                ? "계정 복구를 위해 이메일을 인증하세요."
                : "Verify your email for account recovery."}
        </div>
      </div>
      <button
        type="button"
        onClick={resend}
        disabled={sending}
        style={{
          border: "none",
          borderRadius: 12,
          background: "var(--v2-accent)",
          color: "var(--v2-ink-on-accent)",
          padding: "9px 12px",
          fontFamily: "var(--v2-f-display)",
          fontSize: 12,
          fontWeight: 700,
          cursor: sending ? "default" : "pointer",
        }}
      >
        {sending
          ? locale === "ko"
            ? "발송 중"
            : "Sending"
          : locale === "ko"
            ? "다시 받기"
            : "Resend"}
      </button>
    </div>
  );
}
