"use client";
import { errorMessage } from "@/lib/error-message";

import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import { V2Icon } from "@/components/v2/primitives/v2-icon";
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
    } catch (err) {
      setError(errorMessage(err) ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFrame
      title={
        locale === "ko" ? (
          <>
            비밀번호를
            <br />
            잊으셨어요?
          </>
        ) : (
          <>
            Forgot
            <br />
            password?
          </>
        )
      }
      subtitle={
        locale === "ko"
          ? "가입하신 이메일로 재설정 링크를 보내드릴게요. 5분 안에 도착해요."
          : "Send a reset link to the email used for this account."
      }
    >
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-4)" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
          <span className="v2-label">{locale === "ko" ? "이메일" : "Email"}</span>
          <span style={inputShellStyle}>
            <V2Icon name="mail" style={{ color: "var(--v2-ink-3)", fontSize: "var(--v2-t-20)" }} />
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="v2-font-text"
              style={inputStyle}
            />
          </span>
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
  title: ReactNode;
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
          padding: "calc(env(safe-area-inset-top, 0px) + 40px) var(--v2-s-4) 28px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: 440,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "var(--v2-r-3)",
            background: "var(--v2-accent-weak)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          <V2Icon name="lock_reset" style={{ fontSize: "var(--v2-t-h1)", color: "var(--v2-accent)" }} />
        </div>
        <h1 className="v2-display" style={{ fontSize: "var(--v2-t-h1)", lineHeight: 1.08 }}>
          {title}
        </h1>
        <p className="v2-body" style={{ marginTop: 10, color: "var(--v2-ink-2)", fontSize: "var(--v2-t-14)" }}>
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
      className="v2-font-display"
      style={{
        marginTop: 8,
        padding: "var(--v2-s-3) var(--v2-s-4)",
        borderRadius: "var(--v2-r-2)",
        background: `color-mix(in srgb, ${color} 14%, var(--v2-paper))`,
        color,
        fontSize: "var(--v2-t-small)",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

export const inputStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  fontSize: "var(--v2-t-16)",
  color: "var(--v2-ink)",
};

export const inputShellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--v2-s-3)",
  minHeight: "var(--v2-s-8)",
  padding: "var(--v2-s-2) var(--v2-s-4)",
  borderRadius: "var(--v2-r-2)",
  background: "var(--v2-paper-2)",
};
