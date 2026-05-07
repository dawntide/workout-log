"use client";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import { V2PrimaryBtn } from "../primitives";

export function V2ForgotPasswordForm() {
  const { locale } = useLocale();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password/reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Failed");
        return;
      }
      setDone(true);
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFrame
      title={locale === "ko" ? "비밀번호 재설정" : "Reset password"}
      subtitle={
        locale === "ko"
          ? "계정 이메일로 1시간 동안 유효한 재설정 링크를 보냅니다."
          : "Send a reset link that is valid for 1 hour."
      }
    >
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="v2-label">{locale === "ko" ? "이메일" : "Email"}</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
        </label>
        {error && <Status tone="danger">{error}</Status>}
        {done && (
          <Status tone="success">
            {locale === "ko"
              ? "계정이 존재하면 재설정 메일이 발송됩니다."
              : "If an account exists, a reset email will be sent."}
          </Status>
        )}
        <div style={{ marginTop: 18 }}>
          <V2PrimaryBtn full type="submit" icon="mail" disabled={submitting}>
            {submitting
              ? locale === "ko"
                ? "발송 중…"
                : "Sending…"
              : locale === "ko"
                ? "재설정 링크 받기"
                : "Send reset link"}
          </V2PrimaryBtn>
        </div>
      </form>
      <FooterLink href="/login">
        {locale === "ko" ? "로그인으로 돌아가기" : "Back to sign in"}
      </FooterLink>
    </AuthFrame>
  );
}

function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        display: "flex",
        flexDirection: "column",
        background: "var(--v2-bg)",
        color: "var(--v2-ink)",
      }}
    >
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "calc(env(safe-area-inset-top, 0px) + 32px) 24px 24px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: 480,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            background: "var(--v2-accent-weak)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 30, color: "var(--v2-accent)" }} aria-hidden>
            lock_reset
          </span>
        </div>
        <h1 className="v2-display" style={{ fontSize: 40 }}>
          {title}
        </h1>
        <p className="v2-body" style={{ marginTop: 10, color: "var(--v2-ink-2)", fontSize: 15 }}>
          {subtitle}
        </p>
        <div style={{ marginTop: 28 }}>{children}</div>
      </div>
    </div>
  );
}

export function FooterLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <p className="v2-small" style={{ marginTop: 24, textAlign: "center" }}>
      <Link
        href={href}
        style={{
          color: "var(--v2-accent)",
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        {children}
      </Link>
    </p>
  );
}

export function Status({
  tone,
  children,
}: {
  tone: "danger" | "success";
  children: ReactNode;
}) {
  const color = tone === "danger" ? "var(--v2-c-danger)" : "var(--v2-c-success)";
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      style={{
        marginTop: 8,
        padding: "10px 14px",
        borderRadius: 12,
        background: `color-mix(in srgb, ${color} 14%, var(--v2-paper))`,
        color,
        fontSize: 13,
        fontFamily: "var(--v2-f-display)",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

export const inputStyle: CSSProperties = {
  minHeight: 48,
  padding: "12px 14px",
  borderRadius: 12,
  background: "var(--v2-paper-2)",
  border: "none",
  outline: "none",
  fontFamily: "var(--v2-f-text)",
  fontSize: 16,
  color: "var(--v2-ink)",
};
