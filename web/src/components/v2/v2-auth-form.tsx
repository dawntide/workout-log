"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { V2Icon } from "@/components/v2/primitives/v2-icon";
import { isEmailRecoveryEnabled } from "@/lib/feature-flags";
import { V2PrimaryBtn, V2SecondaryBtn, V2TextField } from "./primitives";

type Mode = "login" | "signup";

const OAUTH_ERROR_TO_MESSAGE: Record<string, { ko: string; en: string }> = {
  state_mismatch: {
    ko: "OAuth 보안 검증에 실패했습니다. 다시 시도해 주세요.",
    en: "OAuth security check failed. Please try again.",
  },
  missing_params: {
    ko: "OAuth 응답이 잘못되었습니다.",
    en: "OAuth response was malformed.",
  },
  not_configured: {
    ko: "Google 로그인이 서버에 설정되어 있지 않습니다.",
    en: "Google sign-in is not configured on this server.",
  },
  token_exchange_failed: {
    ko: "Google 토큰 교환에 실패했습니다. 다시 시도해 주세요.",
    en: "Google token exchange failed. Please try again.",
  },
  userinfo_failed: {
    ko: "Google 사용자 정보 조회에 실패했습니다.",
    en: "Failed to load Google profile.",
  },
  access_denied: {
    ko: "Google 로그인을 취소했습니다.",
    en: "Google sign-in was cancelled.",
  },
};

function passwordStrength(password: string): number {
  if (!password) return 0;
  let score = password.length >= 8 ? 1 : 0;
  if (password.length >= 12) score += 1;
  if (/[0-9]/.test(password) && /[A-Za-z]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(4, score);
}

function strengthLabel(score: number, locale: "ko" | "en") {
  const ko = ["", "약함", "중간", "강함", "매우 강함"];
  const en = ["", "Weak", "Medium", "Strong", "Very strong"];
  return locale === "ko" ? ko[score] : en[score];
}

function friendlyAuthError(
  message: string,
  isSignup: boolean,
  locale: "ko" | "en",
) {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("invalid") ||
    normalized.includes("credential") ||
    normalized.includes("password")
  ) {
    return locale === "ko"
      ? "이메일 또는 비밀번호가 일치하지 않아요."
      : "Email or password does not match.";
  }
  if (isSignup && normalized.includes("already")) {
    return locale === "ko"
      ? "이미 가입된 이메일입니다. 로그인으로 이어가세요."
      : "This email is already registered. Sign in instead.";
  }
  return message;
}

export function V2AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams?.get("next") || "/";
  const oauthError = searchParams?.get("oauth_error") || null;
  const { locale } = useLocale();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [claimDevData, setClaimDevData] = useState(false);
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);

  const isSignup = mode === "signup";
  const strength = useMemo(() => passwordStrength(password), [password]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/oauth/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { google: false }))
      .then((data: { google?: boolean }) => {
        if (!cancelled) setGoogleAvailable(Boolean(data?.google));
      })
      .catch(() => {
        if (!cancelled) setGoogleAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!oauthError) return;
    const mapped = OAUTH_ERROR_TO_MESSAGE[oauthError];
    setError(
      mapped
        ? locale === "ko"
          ? mapped.ko
          : mapped.en
        : `OAuth error: ${oauthError}`,
    );
  }, [oauthError, locale]);

  const onGoogleSignIn = () => {
    const target = `/api/auth/google/start?next=${encodeURIComponent(next)}`;
    window.location.assign(target);
  };

  const onSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const endpoint = isSignup ? "/api/auth/signup" : "/api/auth/login";
      const payload: Record<string, unknown> = { email, password };
      if (isSignup && displayName.trim()) {
        payload.displayName = displayName.trim();
      }
      if (isSignup && claimDevData) payload.claimDevData = true;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const raw = String(body?.error ?? "Failed");
        setError(friendlyAuthError(raw, isSignup, locale));
        return;
      }
      void remember;
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
            "calc(env(safe-area-inset-top, 0px) + 40px) var(--v2-s-4) 28px",
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
            display: "flex",
            alignItems: "center",
            gap: "var(--v2-s-3)",
            marginBottom: 32,
          }}
        >
          <div
            aria-hidden
            className="v2-font-display"
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--v2-r-2)",
              background: "var(--v2-accent)",
              color: "var(--v2-ink-on-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "var(--v2-t-16)",
              letterSpacing: "-0.05em",
            }}
          >
            IG
          </div>
          <div
            className="v2-font-display"
            style={{
              fontWeight: 760,
              fontSize: "var(--v2-t-18)",
              letterSpacing: "-0.02em",
            }}
          >
            IronGraph
          </div>
        </div>

        <h1 className="v2-display" style={{ fontSize: "var(--v2-t-h1)", lineHeight: 1.08 }}>
          {isSignup ? (
            locale === "ko" ? (
              <>
                1RM부터
                <br />
                그래프까지.
              </>
            ) : (
              <>
                From 1RM
                <br />
                to graphs.
              </>
            )
          ) : locale === "ko" ? (
            <>
              다시 만나서
              <br />
              반가워요.
            </>
          ) : (
            <>
              Welcome
              <br />
              back.
            </>
          )}
        </h1>
        <p
          className="v2-body"
          style={{
            marginTop: 10,
            color: "var(--v2-ink-2)",
            fontSize: "var(--v2-t-14)",
          }}
        >
          {isSignup
            ? locale === "ko"
              ? "이메일 하나면 충분해요. 첫 세션은 1분 안에 시작할 수 있어요."
              : "One email is enough. Start the first session in under a minute."
            : locale === "ko"
              ? "계속 기록을 이어가요. 어제 했던 운동이 기다리고 있어요."
              : "Keep the log moving. Yesterday's work is waiting."}
        </p>

        {googleAvailable ? (
          <div style={{ marginTop: "var(--v2-s-6)", display: "grid", gap: "var(--v2-s-2)" }}>
            <V2SecondaryBtn full onClick={onGoogleSignIn}>
              <GoogleIcon />
              <span>
                {locale === "ko" ? "Google로 계속하기" : "Continue with Google"}
              </span>
            </V2SecondaryBtn>
            <Divider label={locale === "ko" ? "또는" : "OR"}/>
          </div>
        ) : null}

        <form
          onSubmit={onSubmit}
          style={{
            marginTop: googleAvailable ? 14 : 28,
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-4)",
          }}
        >
          <Field
            label={locale === "ko" ? "이메일" : "Email"}
            icon="mail"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            required
          />
          <Field
            label={locale === "ko" ? "비밀번호" : "Password"}
            icon="lock"
            type={showPassword ? "text" : "password"}
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={setPassword}
            required
            minLength={8}
            trailing={(
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword
                    ? locale === "ko"
                      ? "비밀번호 숨기기"
                      : "Hide password"
                    : locale === "ko"
                      ? "비밀번호 보기"
                      : "Show password"
                }
                style={{
                  width: 36,
                  height: 36,
                  border: "none",
                  borderRadius: "var(--v2-r-2)",
                  background: "transparent",
                  color: "var(--v2-ink-3)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
              >
                <V2Icon name={showPassword ? "visibility_off" : "visibility"} style={{ fontSize: "var(--v2-t-18)" }} />
              </button>
            )}
          />

          {isSignup ? (
            <>
              <StrengthMeter
                score={strength}
                label={
                  strength > 0
                    ? strengthLabel(strength, locale)
                    : locale === "ko"
                      ? "8자 이상, 숫자·기호 포함 권장"
                      : "8+ characters with numbers and symbols recommended"
                }
              />
              <Field
                label={locale === "ko" ? "이름 (선택)" : "Display name (optional)"}
                icon="badge"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={setDisplayName}
              />
              <CheckboxRow
                checked={claimDevData}
                onChange={setClaimDevData}
                title={
                  locale === "ko"
                    ? "기존 dev 데이터 가져오기"
                    : "Import existing dev data"
                }
                description={
                  locale === "ko"
                    ? "WORKOUT_AUTH_USER_ID 데이터를 이 계정으로 옮김"
                    : "Move WORKOUT_AUTH_USER_ID data into this account"
                }
              />
            </>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--v2-s-3)",
                marginTop: -4,
              }}
            >
              <CheckboxRow
                compact
                checked={remember}
                onChange={setRemember}
                title={locale === "ko" ? "로그인 유지" : "Keep me signed in"}
              />
              {isEmailRecoveryEnabled() && (
                <Link
                  href="/forgot-password"
                  className="v2-font-display"
                  style={{
                    color: "var(--v2-accent-ink)",
                    fontSize: "var(--v2-t-small)",
                    fontWeight: 700,
                    textDecoration: "none",
                    padding: "var(--v2-s-2) 0px",
                    flexShrink: 0,
                  }}
                >
                  {locale === "ko" ? "비밀번호 잊음" : "Forgot password"}
                </Link>
              )}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="v2-font-display"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--v2-s-1)",
                marginTop: 2,
                padding: "var(--v2-s-3) var(--v2-s-4)",
                borderRadius: "var(--v2-r-2)",
                background:
                  "color-mix(in srgb, var(--v2-c-danger) 14%, var(--v2-paper))",
                color: "var(--v2-c-danger)",
                fontSize: "var(--v2-t-small)",
                fontWeight: 700,
              }}
            >
              <V2Icon name="error" style={{ fontSize: "var(--v2-t-16)" }} />
              {error}
            </div>
          )}

          <div style={{ marginTop: 6 }}>
            <V2PrimaryBtn
              full
              type="submit"
              icon={isSignup ? "arrow_forward" : "arrow_forward"}
              disabled={submitting}
              style={{ borderRadius: "var(--v2-r-2)", minHeight: "var(--v2-s-8)" }}
            >
              {submitting
                ? locale === "ko"
                  ? "처리 중..."
                  : "Working..."
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
              {locale === "ko" ? "이미 계정이 있으세요? " : "Already have an account? "}
              <AuthLink href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
                {locale === "ko" ? "로그인" : "Sign in"}
              </AuthLink>
            </>
          ) : (
            <>
              {locale === "ko" ? "처음이세요? " : "New here? "}
              <AuthLink href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
                {locale === "ko" ? "회원가입" : "Sign up"}
              </AuthLink>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function AuthLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        color: "var(--v2-accent-ink)",
        fontWeight: 800,
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}

function Field({
  label,
  icon,
  type,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
  trailing,
}: {
  label: string;
  icon: string;
  type: "email" | "password" | "text";
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  trailing?: ReactNode;
}) {
  return (
    <V2TextField
      label={label}
      icon={icon}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete={autoComplete}
      required={required}
      minLength={minLength}
      trailing={trailing}
    />
  );
}

function StrengthMeter({ score, label }: { score: number; label: string }) {
  return (
    <div style={{ display: "grid", gap: "var(--v2-s-2)", marginTop: -4 }}>
      <div style={{ display: "flex", gap: "var(--v2-s-1)" }}>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            aria-hidden
            style={{
              flex: 1,
              height: 3,
              borderRadius: "var(--v2-r-pill)",
              background:
                score >= i
                  ? score <= 1
                    ? "var(--v2-c-danger)"
                    : score === 2
                      ? "var(--v2-c-warning)"
                      : "var(--v2-c-success)"
                  : "var(--v2-paper-3)",
            }}
          />
        ))}
      </div>
      <div className="v2-mono-label" style={{ color: "var(--v2-ink-3)" }}>
        {label}
      </div>
    </div>
  );
}

function CheckboxRow({
  checked,
  onChange,
  title,
  description,
  compact = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  title: string;
  description?: string;
  compact?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--v2-s-3)",
        minHeight: compact ? 36 : 44,
        padding: compact ? "6px 4px" : "10px 4px",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden
        style={{
          width: 20,
          height: 20,
          marginTop: 1,
          borderRadius: "var(--v2-r-0)",
          background: checked ? "var(--v2-accent)" : "transparent",
          boxShadow: checked
            ? "none"
            : "inset 0 0 0 2px var(--v2-paper-4)",
          color: "var(--v2-ink-on-accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {checked ? (
          <V2Icon name="check" style={{ fontSize: "var(--v2-t-14)" }} />
        ) : null}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          className="v2-font-text"
          style={{
            display: "block",
            fontSize: compact ? 12 : 13,
            fontWeight: compact ? 600 : 500,
            lineHeight: 1.45,
            color: "var(--v2-ink-2)",
          }}
        >
          {title}
        </span>
        {description ? (
          <span
            className="v2-mono-label"
            style={{ display: "block", color: "var(--v2-ink-3)", marginTop: 2 }}
          >
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div
      className="v2-font-num"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--v2-s-3)",
        color: "var(--v2-ink-3)",
        fontSize: "var(--v2-t-label)",
        fontWeight: 700,
        letterSpacing: "0.08em",
      }}
    >
      <div style={{ flex: 1, height: 1, background: "var(--v2-hairline)" }} />
      {label}
      <div style={{ flex: 1, height: 1, background: "var(--v2-hairline)" }} />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg
      className="v2-google-icon"
      viewBox="0 0 18 18"
      width={18}
      height={18}
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961l3.007 2.332C4.672 5.166 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
