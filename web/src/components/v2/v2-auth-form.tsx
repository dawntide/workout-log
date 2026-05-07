"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import { V2PrimaryBtn } from "./primitives";

type Mode = "login" | "signup";

export function V2AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams?.get("next") || "/";
  const { locale } = useLocale();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [claimDevData, setClaimDevData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  const onSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const endpoint = isSignup ? "/api/auth/signup" : "/api/auth/login";
      const payload: Record<string, unknown> = { email, password };
      if (isSignup && displayName.trim())
        payload.displayName = displayName.trim();
      if (isSignup && claimDevData) payload.claimDevData = true;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Failed");
        return;
      }
      // 성공 → next로 이동
      router.replace(next);
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
          padding:
            "calc(env(safe-area-inset-top, 0px) + 32px) 24px 24px",
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
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 30,
              color: "var(--v2-accent)",
              fontVariationSettings: "'FILL' 1, 'wght' 600",
            }}
            aria-hidden
          >
            fitness_center
          </span>
        </div>
        <h1 className="v2-display" style={{ fontSize: 40 }}>
          {isSignup
            ? locale === "ko"
              ? "시작하기"
              : "Get started"
            : locale === "ko"
              ? "다시 만나요"
              : "Welcome back"}
        </h1>
        <p
          className="v2-body"
          style={{
            marginTop: 10,
            color: "var(--v2-ink-2)",
            fontSize: 15,
          }}
        >
          {isSignup
            ? locale === "ko"
              ? "이메일과 비밀번호로 계정을 만들어 운동 기록을 시작하세요."
              : "Create an account with your email to start logging workouts."
            : locale === "ko"
              ? "이메일과 비밀번호로 로그인하세요."
              : "Sign in with your email and password."}
        </p>

        <form
          onSubmit={onSubmit}
          style={{
            marginTop: 28,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <Field
            label={locale === "ko" ? "이메일" : "Email"}
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            required
          />
          <Field
            label={locale === "ko" ? "비밀번호" : "Password"}
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={setPassword}
            required
            minLength={8}
            help={
              isSignup
                ? locale === "ko"
                  ? "최소 8자"
                  : "At least 8 characters"
                : undefined
            }
          />
          {isSignup && (
            <Field
              label={locale === "ko" ? "이름 (선택)" : "Display name (optional)"}
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={setDisplayName}
            />
          )}

          {isSignup && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 8,
                padding: "10px 14px",
                background: "var(--v2-paper-2)",
                borderRadius: 12,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={claimDevData}
                onChange={(e) => setClaimDevData(e.target.checked)}
                style={{
                  width: 18,
                  height: 18,
                  accentColor: "var(--v2-accent)",
                  cursor: "pointer",
                }}
              />
              <span style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: "var(--v2-f-display)",
                    fontWeight: 600,
                    fontSize: 13,
                    color: "var(--v2-ink)",
                  }}
                >
                  {locale === "ko"
                    ? "기존 dev 데이터 가져오기"
                    : "Import existing dev data"}
                </div>
                <div
                  className="v2-mono-label"
                  style={{ color: "var(--v2-ink-3)", marginTop: 2 }}
                >
                  {locale === "ko"
                    ? "WORKOUT_AUTH_USER_ID 데이터를 이 계정으로 옮김"
                    : "Move WORKOUT_AUTH_USER_ID data into this account"}
                </div>
              </span>
            </label>
          )}

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 8,
                padding: "10px 14px",
                borderRadius: 12,
                background:
                  "color-mix(in srgb, var(--v2-c-danger) 14%, var(--v2-paper))",
                color: "var(--v2-c-danger)",
                fontSize: 13,
                fontFamily: "var(--v2-f-display)",
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}

          {!isSignup && (
            <Link
              href="/forgot-password"
              style={{
                alignSelf: "flex-end",
                color: "var(--v2-accent)",
                fontFamily: "var(--v2-f-display)",
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
                marginTop: 4,
              }}
            >
              {locale === "ko" ? "비밀번호를 잊으셨나요?" : "Forgot password?"}
            </Link>
          )}

          <div style={{ marginTop: 18 }}>
            <V2PrimaryBtn
              full
              type="submit"
              icon={isSignup ? "rocket_launch" : "login"}
              disabled={submitting}
            >
              {submitting
                ? locale === "ko"
                  ? "처리 중…"
                  : "Working…"
                : isSignup
                  ? locale === "ko"
                    ? "계정 만들기"
                    : "Create account"
                  : locale === "ko"
                    ? "로그인"
                    : "Sign in"}
            </V2PrimaryBtn>
          </div>
        </form>

        <p
          className="v2-small"
          style={{
            marginTop: 24,
            textAlign: "center",
            color: "var(--v2-ink-2)",
          }}
        >
          {isSignup ? (
            <>
              {locale === "ko" ? "이미 계정이 있나요? " : "Already have an account? "}
              <Link
                href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
                style={{
                  color: "var(--v2-accent)",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                {locale === "ko" ? "로그인" : "Sign in"}
              </Link>
            </>
          ) : (
            <>
              {locale === "ko" ? "계정이 없나요? " : "Don't have an account? "}
              <Link
                href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
                style={{
                  color: "var(--v2-accent)",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                {locale === "ko" ? "가입하기" : "Sign up"}
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
  help,
}: {
  label: string;
  type: "email" | "password" | "text";
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  help?: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <span className="v2-label">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        style={{
          minHeight: 48,
          padding: "12px 14px",
          borderRadius: 12,
          background: "var(--v2-paper-2)",
          border: "none",
          outline: "none",
          fontFamily: "var(--v2-f-text)",
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
