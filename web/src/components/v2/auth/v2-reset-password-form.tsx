"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { V2Icon } from "@/components/v2/primitives/v2-icon";
import { V2PrimaryBtn } from "../primitives";
import { FooterLink, Status, inputShellStyle, inputStyle } from "./v2-forgot-password-form";

export function V2ResetPasswordForm() {
  const { locale } = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "Missing reset token");

  const onSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (password.length < 8) {
      setError(locale === "ko" ? "비밀번호는 최소 8자" : "Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError(locale === "ko" ? "비밀번호가 일치하지 않습니다" : "Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/password/reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Failed");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  };

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
          {locale === "ko" ? (
            <>
              새 비밀번호
              <br />
              설정.
            </>
          ) : (
            <>
              Set new
              <br />
              password.
            </>
          )}
        </h1>
        <p className="v2-body" style={{ marginTop: 10, color: "var(--v2-ink-2)", fontSize: "var(--v2-t-14)" }}>
          {locale === "ko"
            ? "앞으로 이 비밀번호로 로그인할 수 있어요. 다른 사이트와 다르게 만드세요."
            : "Use this password from now on. Make it different from other sites."}
        </p>
        <form onSubmit={onSubmit} style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: "var(--v2-s-4)" }}>
          <PwField
            label={locale === "ko" ? "새 비밀번호" : "New password"}
            value={password}
            onChange={setPassword}
          />
          <PwField
            label={locale === "ko" ? "새 비밀번호 확인" : "Confirm new password"}
            value={confirm}
            onChange={setConfirm}
          />
          {error && <Status tone="danger">{error}</Status>}
          <div style={{ marginTop: 18 }}>
            <V2PrimaryBtn full type="submit" icon="lock_reset" disabled={submitting || !token}>
              {submitting
                ? locale === "ko"
                  ? "변경 중…"
                  : "Updating…"
                : locale === "ko"
                  ? "비밀번호 변경"
                  : "Update password"}
            </V2PrimaryBtn>
          </div>
        </form>
        <FooterLink href="/login">
          {locale === "ko" ? "로그인으로 돌아가기" : "Back to sign in"}
        </FooterLink>
      </div>
    </div>
  );
}

function PwField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
      <span className="v2-label">{label}</span>
      <span style={inputShellStyle}>
        <V2Icon name="lock" style={{ color: "var(--v2-ink-3)", fontSize: "var(--v2-t-20)" }} />
        <input
          type="password"
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={8}
          className="v2-font-text"
          style={inputStyle}
        />
      </span>
    </label>
  );
}
