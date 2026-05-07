"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { V2PrimaryBtn } from "../primitives";
import { FooterLink, Status, inputStyle } from "./v2-forgot-password-form";

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
          padding: "calc(env(safe-area-inset-top, 0px) + 32px) 24px 24px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: 480,
          margin: "0 auto",
          width: "100%",
        }}
      >
        <h1 className="v2-display" style={{ fontSize: 40 }}>
          {locale === "ko" ? "새 비밀번호" : "New password"}
        </h1>
        <p className="v2-body" style={{ marginTop: 10, color: "var(--v2-ink-2)", fontSize: 15 }}>
          {locale === "ko"
            ? "새 비밀번호를 설정하면 기존 세션은 모두 종료됩니다."
            : "Set a new password and sign out all previous sessions."}
        </p>
        <form onSubmit={onSubmit} style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 10 }}>
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
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="v2-label">{label}</span>
      <input
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={8}
        style={inputStyle}
      />
    </label>
  );
}
