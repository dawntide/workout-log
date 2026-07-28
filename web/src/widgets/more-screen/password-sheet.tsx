"use client";
import { errorMessage } from "@/lib/error-message";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { V2Card } from "@/components/v2/primitives";
import { BottomSheet } from "@/components/ui/bottom-sheet";

export function PasswordSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const formRef = useRef<HTMLFormElement | null>(null);
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
    } catch (err) {
      setError(errorMessage(err) ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={locale === "ko" ? "비밀번호 변경" : "Change password"}
      closeLabel={locale === "ko" ? "닫기" : "Close"}
      // 편집 시트 공통 패턴(헤더 ✓): requestSubmit으로 폼 검증(required·minLength)을 유지한다.
      primaryAction={{
        ariaLabel: submitting
          ? locale === "ko"
            ? "비밀번호 변경 중"
            : "Updating password"
          : locale === "ko"
            ? "비밀번호 변경"
            : "Update password",
        onPress: () => formRef.current?.requestSubmit(),
        disabled: submitting,
      }}
    >
      <form
        ref={formRef}
        onSubmit={onSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-3)",
        }}
      >
        {/*
          이 고지는 시트 description으로 두면 안 된다 — MINIMAL_COPY_MODE가 켜져 있어
          description은 렌더되지 않는다. 다른 기기가 로그아웃된다는 사실은 결과를
          바꾸는 정보라 본문에 항상 보여야 한다.
        */}
        <V2Card tone="inset" padding="var(--v2-s-4)">
          <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-2)" }}>
            {locale === "ko"
              ? "변경 후 다른 기기의 모든 세션은 자동 로그아웃됩니다."
              : "After the change, all sessions on other devices are signed out."}
          </p>
        </V2Card>

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
              marginTop: "var(--v2-s-2)",
              padding: "var(--v2-s-3) var(--v2-s-4)",
              borderRadius: "var(--v2-r-2)",
              background:
                "color-mix(in srgb, var(--v2-c-danger) 14%, var(--v2-paper))",
              color: "var(--v2-c-danger)",
              fontSize: "var(--v2-t-small)",
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
              marginTop: "var(--v2-s-2)",
              padding: "var(--v2-s-3) var(--v2-s-4)",
              borderRadius: "var(--v2-r-2)",
              background:
                "color-mix(in srgb, var(--v2-c-success) 14%, var(--v2-paper))",
              color: "var(--v2-c-success)",
              fontSize: "var(--v2-t-small)",
              fontWeight: 600,
            }}
          >
            {locale === "ko"
              ? "비밀번호가 변경되었습니다."
              : "Password changed."}
          </div>
        )}

        {/* 제출 버튼은 헤더 ✓지만, Enter 암시적 제출은 폼 내 submit 버튼이 있어야 동작한다. */}
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
      </form>
    </BottomSheet>
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
    <label style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
      <span className="v2-label v2-font-text">{label}</span>
      <input
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={8}
        style={{
          minHeight: "var(--v2-s-8)",
          padding: "var(--v2-s-3) var(--v2-s-4)",
          borderRadius: "var(--v2-r-2)",
          background: "var(--v2-paper-2)",
          border: "none",
          outline: "none",
          fontSize: "var(--v2-t-16)",
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
