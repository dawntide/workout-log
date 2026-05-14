"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  const [email, setEmail] = useState<string | null>(null);
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
          setEmail(user.email);
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
        borderRadius: "var(--v2-r-2)",
        background: "color-mix(in srgb, var(--v2-c-warning) 14%, var(--v2-paper))",
        color: "var(--v2-ink)",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ color: "var(--v2-c-warning)", fontSize: 20, marginTop: 1 }}
        aria-hidden
      >
        mark_email_unread
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="v2-font-display" style={{ fontSize: 13, fontWeight: 700 }}>
          {locale === "ko" ? "이메일 인증을 완료해 주세요" : "Complete email verification"}
        </div>
        <div
          className="v2-small"
          style={{
            color: error ? "var(--v2-c-danger)" : "var(--v2-ink-2)",
            marginTop: 2,
            fontSize: 12,
          }}
        >
          {error ? (
            error
          ) : sent ? (
            locale === "ko" ? (
              "인증 메일을 다시 보냈습니다."
            ) : (
              "Verification email sent."
            )
          ) : locale === "ko" ? (
            <>
              {email} 으로 보낸 링크를 눌러 주세요.{" "}
              <InlineAction onClick={resend} disabled={sending}>
                {sending ? "발송 중" : "다시 보내기"}
              </InlineAction>
            </>
          ) : (
            <>
              Open the link sent to {email}.{" "}
              <InlineAction onClick={resend} disabled={sending}>
                {sending ? "Sending" : "Resend"}
              </InlineAction>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label={locale === "ko" ? "인증 배너 닫기" : "Dismiss verification banner"}
        style={{
          border: "none",
          borderRadius: "var(--v2-r-1)",
          background: "transparent",
          color: "var(--v2-ink-3)",
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }} aria-hidden>
          close
        </span>
      </button>
    </div>
  );
}

function InlineAction({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="v2-font-display"
      style={{
        border: "none",
        background: "transparent",
        color: "var(--v2-accent-ink)",
        padding: 0,
        fontSize: 12,
        fontWeight: 800,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
