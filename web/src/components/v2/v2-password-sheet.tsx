"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { V2PrimaryBtn, V2Sheet } from "./primitives";

export function V2PasswordSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 시트 닫힐 때 reset
  useEffect(() => {
    if (open) return;
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    setSuccess(false);
    setSubmitting(false);
  }, [open]);

  const onSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSuccess(false);

    if (next.length < 8) {
      setError(
        locale === "ko"
          ? "새 비밀번호는 최소 8자"
          : "New password must be at least 8 characters",
      );
      return;
    }
    if (next !== confirm) {
      setError(
        locale === "ko"
          ? "새 비밀번호가 일치하지 않습니다"
          : "New passwords do not match",
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Failed");
        return;
      }
      setSuccess(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err: any) {
      setError(err?.message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <V2Sheet
      open={open}
      onClose={onClose}
      height="78%"
      ariaLabel={locale === "ko" ? "비밀번호 변경" : "Change password"}
    >
      <div style={{ padding: "8px 24px 12px" }}>
        <p className="v2-eyebrow">
          {locale === "ko" ? "보안" : "SECURITY"}
        </p>
        <h1 className="v2-h1 v2-font-display" style={{ marginTop: 6 }}>
          {locale === "ko" ? "비밀번호 변경" : "Change password"}
        </h1>
        <p
          className="v2-small"
          style={{ marginTop: 6, color: "var(--v2-ink-2)" }}
        >
          {locale === "ko"
            ? "변경 후 다른 기기의 모든 세션은 자동 로그아웃됩니다."
            : "After change, all other sessions are signed out."}
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        style={{
          padding: "0 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <PwField
          label={locale === "ko" ? "현재 비밀번호" : "Current password"}
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
        />
        <PwField
          label={locale === "ko" ? "새 비밀번호" : "New password"}
          autoComplete="new-password"
          value={next}
          onChange={setNext}
          help={locale === "ko" ? "최소 8자" : "At least 8 characters"}
        />
        <PwField
          label={
            locale === "ko" ? "새 비밀번호 확인" : "Confirm new password"
          }
          autoComplete="new-password"
          value={confirm}
          onChange={setConfirm}
        />

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 8,
              padding: "10px 14px",
              borderRadius: "var(--v2-r-2)",
              background:
                "color-mix(in srgb, var(--v2-c-danger) 14%, var(--v2-paper))",
              color: "var(--v2-c-danger)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}
        {success && (
          <div
            role="status"
            style={{
              marginTop: 8,
              padding: "10px 14px",
              borderRadius: "var(--v2-r-2)",
              background:
                "color-mix(in srgb, var(--v2-c-success) 14%, var(--v2-paper))",
              color: "var(--v2-c-success)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {locale === "ko"
              ? "비밀번호가 변경되었습니다."
              : "Password changed."}
          </div>
        )}

        <div style={{ marginTop: 18, display: "flex", gap: 8 }}>
          <V2PrimaryBtn
            full
            type="submit"
            icon="lock"
            disabled={submitting}
          >
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
    </V2Sheet>
  );
}

function PwField({
  label,
  value,
  onChange,
  autoComplete,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  help?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="v2-label v2-font-text">{label}</span>
      <input
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={8}
        style={{
          minHeight: 48,
          padding: "12px 14px",
          borderRadius: "var(--v2-r-2)",
          background: "var(--v2-paper-2)",
          border: "none",
          outline: "none",
          fontSize: 16,
          color: "var(--v2-ink)",
        }}
      />
      {help && (
        <span
          className="v2-mono-label"
          style={{ color: "var(--v2-ink-3)" }}
        >
          {help}
        </span>
      )}
    </label>
  );
}
