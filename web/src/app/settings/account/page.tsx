"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { useLocale } from "@/components/locale-provider";
import { NoticeStateRows } from "@/components/ui/settings-state";
import {
  V2NavRow,
  V2PrimaryBtn,
  V2SecondaryBtn,
} from "@/components/v2/primitives";
import {
  V2SettingsFootnote,
  V2SettingsGroup,
  V2SettingsSection,
} from "@/components/v2/settings/section";
import { apiInvalidateCache } from "@/lib/api";
import { isEmailRecoveryEnabled } from "@/lib/feature-flags";

type SessionItem = {
  tokenMask: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
  isExpired: boolean;
};

type MeResponse = {
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
    emailVerifiedAt: string | null;
    fallback: boolean;
  } | null;
};

type SessionListResponse = {
  items: SessionItem[];
};

type OAuthAccountItem = {
  id: string;
  provider: string;
  providerSubjectMasked: string;
  email: string | null;
  emailVerified: boolean;
  createdAt: string;
};

type OAuthAccountsResponse = {
  hasPassword: boolean;
  items: OAuthAccountItem[];
};

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
};

function formatDateTime(value: string, locale: "ko" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function SettingsAccountPage() {
  const { locale } = useLocale();
  const { confirm, alert } = useAppDialog();
  const router = useRouter();

  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [oauthAccounts, setOauthAccounts] = useState<OAuthAccountItem[] | null>(
    null,
  );
  const [hasPassword, setHasPassword] = useState<boolean>(false);
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [settingUpPassword, setSettingUpPassword] = useState(false);
  const [me, setMe] = useState<MeResponse["user"] | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as MeResponse;
      setMe(payload.user ?? null);
    } catch {
      setMe(null);
    }
  }, []);

  const runResendVerification = async () => {
    try {
      setResendingVerification(true);
      setError(null);
      setNotice(null);
      const response = await fetch("/api/auth/email/verification/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        alreadyVerified?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? `failed (${response.status})`);
      }
      if (payload.alreadyVerified) {
        setNotice(
          locale === "ko"
            ? "이메일이 이미 인증되어 있습니다."
            : "Email is already verified.",
        );
      } else {
        setNotice(
          locale === "ko"
            ? "인증 메일을 발송했습니다. 메일함을 확인하세요."
            : "Verification email sent. Check your inbox.",
        );
      }
      void loadMe();
    } catch (e: any) {
      setError(
        e?.message ??
          (locale === "ko"
            ? "인증 메일 발송에 실패했습니다."
            : "Failed to send verification email."),
      );
    } finally {
      setResendingVerification(false);
    }
  };

  const loadOauthAccounts = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/oauth/accounts", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<
        OAuthAccountsResponse & { error?: string }
      >;
      if (!response.ok) {
        throw new Error(payload.error ?? `failed (${response.status})`);
      }
      setOauthAccounts(payload.items ?? []);
      setHasPassword(Boolean(payload.hasPassword));
    } catch (e: any) {
      setError(
        e?.message ??
          (locale === "ko"
            ? "연결된 계정을 불러오지 못했습니다."
            : "Failed to load connected accounts."),
      );
    }
  }, [locale]);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/auth/sessions", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<
        SessionListResponse & { error?: string }
      >;
      if (!response.ok) {
        throw new Error(payload.error ?? `failed (${response.status})`);
      }
      setSessions(payload.items ?? []);
    } catch (e: any) {
      setError(
        e?.message ??
          (locale === "ko"
            ? "세션 목록을 불러오지 못했습니다."
            : "Failed to load sessions."),
      );
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void loadSessions();
    void loadOauthAccounts();
    void loadMe();
  }, [loadSessions, loadOauthAccounts, loadMe]);

  const runSetupPassword = async () => {
    if (setupPassword.length < 8) {
      setError(
        locale === "ko"
          ? "비밀번호는 최소 8자 이상이어야 합니다."
          : "Password must be at least 8 characters.",
      );
      return;
    }
    if (setupPassword !== setupConfirm) {
      setError(
        locale === "ko"
          ? "비밀번호 확인이 일치하지 않습니다."
          : "Password confirmation does not match.",
      );
      return;
    }
    try {
      setSettingUpPassword(true);
      setError(null);
      setNotice(null);
      const response = await fetch("/api/auth/password/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword: setupPassword }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? `failed (${response.status})`);
      }
      setNotice(
        locale === "ko"
          ? "비밀번호를 설정했습니다. 이제 비밀번호로도 로그인할 수 있습니다."
          : "Password is set. You can now sign in with your password.",
      );
      setSetupPassword("");
      setSetupConfirm("");
      void loadOauthAccounts();
    } catch (e: any) {
      setError(
        e?.message ??
          (locale === "ko" ? "비밀번호 설정에 실패했습니다." : "Failed to set password."),
      );
    } finally {
      setSettingUpPassword(false);
    }
  };

  const runUnlink = async (provider: string) => {
    if (!hasPassword) {
      await alert({
        title: locale === "ko" ? "비밀번호 필요" : "Password Required",
        message:
          locale === "ko"
            ? "연동을 해제하기 전에 먼저 비밀번호를 설정해야 합니다. 비밀번호 재설정 메일을 받아 새 비밀번호를 만든 뒤 다시 시도하세요."
            : "Set a password before unlinking your only sign-in method. Use the password-reset email flow first.",
        tone: "danger",
      });
      return;
    }
    const providerLabel = PROVIDER_LABEL[provider] ?? provider;
    const confirmed = await confirm({
      title:
        locale === "ko" ? `${providerLabel} 연결 해제` : `Disconnect ${providerLabel}`,
      message:
        locale === "ko"
          ? `이 계정에서 ${providerLabel} 로그인을 해제합니다. 이후엔 비밀번호로만 로그인할 수 있습니다.`
          : `${providerLabel} sign-in will be removed from this account. You can still sign in with your password.`,
      confirmText: locale === "ko" ? "해제" : "Disconnect",
      cancelText: locale === "ko" ? "취소" : "Cancel",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      setUnlinkingProvider(provider);
      setError(null);
      setNotice(null);
      const response = await fetch(
        `/api/auth/oauth/accounts/${encodeURIComponent(provider)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? `failed (${response.status})`);
      }
      setNotice(
        locale === "ko"
          ? `${providerLabel} 연결을 해제했습니다.`
          : `Disconnected ${providerLabel}.`,
      );
      void loadOauthAccounts();
    } catch (e: any) {
      setError(
        e?.message ??
          (locale === "ko" ? "연결 해제에 실패했습니다." : "Failed to disconnect."),
      );
    } finally {
      setUnlinkingProvider(null);
    }
  };

  const otherSessionCount = sessions
    ? sessions.filter((s) => !s.isCurrent && !s.isExpired).length
    : 0;

  const runRevokeOthers = async () => {
    const confirmed = await confirm({
      title: locale === "ko" ? "다른 세션 종료" : "Revoke Other Sessions",
      message:
        locale === "ko"
          ? `현재 기기를 제외한 활성 세션 ${otherSessionCount}개를 즉시 종료합니다. 다른 기기에서는 다시 로그인해야 합니다.`
          : `${otherSessionCount} active sessions on other devices will be terminated immediately. Those devices must sign in again.`,
      confirmText: locale === "ko" ? "종료" : "Revoke",
      cancelText: locale === "ko" ? "취소" : "Cancel",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      setRevoking(true);
      setError(null);
      setNotice(null);
      const response = await fetch("/api/auth/sessions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        revoked?: number | null;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? `failed (${response.status})`);
      }
      setNotice(
        locale === "ko"
          ? `다른 세션 ${payload.revoked ?? 0}개를 종료했습니다.`
          : `Revoked ${payload.revoked ?? 0} other sessions.`,
      );
      void loadSessions();
    } catch (e: any) {
      setError(
        e?.message ??
          (locale === "ko" ? "세션 종료에 실패했습니다." : "Failed to revoke sessions."),
      );
    } finally {
      setRevoking(false);
    }
  };

  const runDeleteAccount = async () => {
    if (!deletePassword) {
      setError(
        locale === "ko"
          ? "비밀번호를 입력하세요."
          : "Enter your password.",
      );
      return;
    }
    const confirmed = await confirm({
      title: locale === "ko" ? "계정 삭제" : "Delete Account",
      message:
        locale === "ko"
          ? "계정과 운동 기록, 세트, 플랜, 커스텀 템플릿이 영구 삭제됩니다.\n\n이 작업은 복구할 수 없습니다. 계속하시겠습니까?"
          : "Your account and all logs, sets, plans, and custom templates will be permanently deleted.\n\nThis action cannot be undone. Continue?",
      confirmText: locale === "ko" ? "삭제" : "Delete",
      cancelText: locale === "ko" ? "취소" : "Cancel",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      setDeleting(true);
      setError(null);
      setNotice(null);
      const response = await fetch("/api/auth/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmToken: "DELETE_MY_ACCOUNT",
          password: deletePassword,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? `failed (${response.status})`);
      }
      apiInvalidateCache();
      await alert({
        title: locale === "ko" ? "삭제 완료" : "Deleted",
        message:
          locale === "ko"
            ? "계정이 삭제되었습니다. 로그인 화면으로 이동합니다."
            : "Your account has been deleted. Returning to the sign-in screen.",
      });
      router.replace("/login");
    } catch (e: any) {
      setError(
        e?.message ??
          (locale === "ko" ? "계정 삭제에 실패했습니다." : "Failed to delete account."),
      );
      await alert({
        title: locale === "ko" ? "삭제 실패" : "Delete Failed",
        message:
          e?.message ??
          (locale === "ko"
            ? "계정 삭제에 실패했습니다."
            : "Failed to delete the account."),
        tone: "danger",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <NoticeStateRows
        message={notice}
        label={locale === "ko" ? "완료" : "Done"}
      />
      <NoticeStateRows
        message={error}
        label={locale === "ko" ? "오류" : "Error"}
      />

      {isEmailRecoveryEnabled() && me && me.email && !me.fallback ? (
        <section>
          <V2SettingsSection
            title={locale === "ko" ? "이메일 인증" : "Email Verification"}
            description={
              locale === "ko"
                ? "이 계정의 이메일이 인증되어 있는지 확인하고 필요 시 재발송합니다. 인증된 이메일은 비밀번호 재설정 등 복구 흐름에 사용됩니다."
                : "Check whether this account's email is verified and resend the email if needed. The verified email is used for recovery flows like password reset."
            }
          />
          <V2SettingsGroup
            ariaLabel={
              locale === "ko" ? "이메일 인증 상태" : "Email verification status"
            }
          >
            <V2NavRow
              label={me.email}
              description={
                me.emailVerifiedAt
                  ? locale === "ko"
                    ? `인증 완료: ${formatDateTime(me.emailVerifiedAt, locale)}`
                    : `Verified: ${formatDateTime(me.emailVerifiedAt, locale)}`
                  : locale === "ko"
                    ? "아직 인증되지 않았습니다."
                    : "Not verified yet."
              }
              value={
                me.emailVerifiedAt
                  ? locale === "ko"
                    ? "인증됨"
                    : "Verified"
                  : locale === "ko"
                    ? "미인증"
                    : "Unverified"
              }
            />
          </V2SettingsGroup>
          {!me.emailVerifiedAt ? (
            <V2SecondaryBtn
              full
              style={{ marginTop: "var(--v2-s-2)" }}
              onClick={() => {
                void runResendVerification();
              }}
              disabled={resendingVerification}
            >
              {resendingVerification
                ? locale === "ko"
                  ? "발송 중..."
                  : "Sending..."
                : locale === "ko"
                  ? "인증 메일 재발송"
                  : "Resend Verification Email"}
            </V2SecondaryBtn>
          ) : null}
          <V2SettingsFootnote>
            {locale === "ko"
              ? "메일이 도착하지 않으면 스팸함을 확인하세요. 시간당 최대 3회까지 재발송할 수 있습니다."
              : "If the email doesn't arrive, check your spam folder. You can request up to 3 resends per hour."}
          </V2SettingsFootnote>
        </section>
      ) : null}

      <section>
        <V2SettingsSection
          title={locale === "ko" ? "활성 세션" : "Active Sessions"}
          description={
            locale === "ko"
              ? "현재 계정에 로그인된 기기/브라우저 목록입니다. 의심스러운 세션이 있으면 다른 세션을 모두 종료하세요."
              : "Devices and browsers currently signed in to your account. If you see anything suspicious, revoke all other sessions."
          }
        />
        {loading && !sessions ? (
          <V2SettingsFootnote>
            {locale === "ko" ? "불러오는 중..." : "Loading..."}
          </V2SettingsFootnote>
        ) : null}
        {sessions && sessions.length > 0 ? (
          <V2SettingsGroup
            ariaLabel={locale === "ko" ? "세션 목록" : "Session list"}
          >
            {sessions.map((session) => (
              <V2NavRow
                key={session.tokenMask + session.createdAt}
                label={
                  session.isCurrent
                    ? locale === "ko"
                      ? "현재 세션"
                      : "Current session"
                    : session.tokenMask
                }
                description={
                  locale === "ko"
                    ? `생성: ${formatDateTime(session.createdAt, locale)} · 만료: ${formatDateTime(session.expiresAt, locale)}`
                    : `Created: ${formatDateTime(session.createdAt, locale)} · Expires: ${formatDateTime(session.expiresAt, locale)}`
                }
                value={
                  session.isExpired
                    ? locale === "ko"
                      ? "만료됨"
                      : "Expired"
                    : session.isCurrent
                      ? locale === "ko"
                        ? "현재"
                        : "Current"
                      : locale === "ko"
                        ? "활성"
                        : "Active"
                }
              />
            ))}
          </V2SettingsGroup>
        ) : sessions && sessions.length === 0 ? (
          <V2SettingsFootnote>
            {locale === "ko"
              ? "활성 세션이 없습니다."
              : "No active sessions."}
          </V2SettingsFootnote>
        ) : null}
        <V2SecondaryBtn
          full
          style={{ marginTop: "var(--v2-s-2)" }}
          onClick={() => {
            void runRevokeOthers();
          }}
          disabled={revoking || otherSessionCount === 0}
        >
          {revoking
            ? locale === "ko"
              ? "종료 중..."
              : "Revoking..."
            : otherSessionCount > 0
              ? locale === "ko"
                ? `다른 세션 모두 종료 (${otherSessionCount})`
                : `Revoke All Other Sessions (${otherSessionCount})`
              : locale === "ko"
                ? "다른 세션 없음"
                : "No Other Sessions"}
        </V2SecondaryBtn>
        <V2SettingsFootnote>
          {locale === "ko"
            ? "현재 기기의 세션은 유지되며, 다른 기기에서는 다시 로그인이 필요합니다."
            : "Your current session is preserved; other devices must sign in again."}
        </V2SettingsFootnote>
      </section>

      {oauthAccounts && oauthAccounts.length > 0 && !hasPassword ? (
        <section className="v2-font-display">
          <V2SettingsSection
            title={locale === "ko" ? "비밀번호 설정" : "Set Password"}
            description={
              locale === "ko"
                ? "현재는 외부 로그인(Google 등)으로만 접속할 수 있습니다. 비밀번호를 추가하면 이메일/비밀번호 로그인도 사용할 수 있고, 외부 계정 연결 해제도 가능해집니다."
                : "You currently can sign in only via external providers. Add a password to unlock email/password sign-in and to allow disconnecting external accounts."
            }
          />
          <div
            style={{
              display: "grid",
              gap: "var(--v2-s-3)",
              padding: "var(--v2-s-3) 0px",
            }}
          >
            <label
              style={{
                display: "block",
                fontSize: "var(--v2-t-small)",
                color: "var(--v2-ink-2)",
              }}
            >
              {locale === "ko" ? "새 비밀번호 (최소 8자)" : "New password (min 8 chars)"}
              <input
                type="password"
                autoComplete="new-password"
                value={setupPassword}
                onChange={(e) => setSetupPassword(e.target.value)}
                minLength={8}
                placeholder={locale === "ko" ? "비밀번호" : "Password"}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 6,
                  padding: "var(--v2-s-3) var(--v2-s-3)",
                  borderRadius: "var(--v2-r-2)",
                  border: "none",
                  background: "var(--v2-paper-2)",
                  color: "var(--v2-ink)",
                  fontFamily: "inherit",
                  fontSize: "var(--v2-t-16)",
                  boxSizing: "border-box",
                }}
              />
            </label>
            <label
              style={{
                display: "block",
                fontSize: "var(--v2-t-small)",
                color: "var(--v2-ink-2)",
              }}
            >
              {locale === "ko" ? "비밀번호 확인" : "Confirm password"}
              <input
                type="password"
                autoComplete="new-password"
                value={setupConfirm}
                onChange={(e) => setSetupConfirm(e.target.value)}
                minLength={8}
                placeholder={locale === "ko" ? "비밀번호 다시 입력" : "Repeat password"}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 6,
                  padding: "var(--v2-s-3) var(--v2-s-3)",
                  borderRadius: "var(--v2-r-2)",
                  border: "none",
                  background: "var(--v2-paper-2)",
                  color: "var(--v2-ink)",
                  fontFamily: "inherit",
                  fontSize: "var(--v2-t-16)",
                  boxSizing: "border-box",
                }}
              />
            </label>
            <V2PrimaryBtn
              full
              onClick={() => {
                void runSetupPassword();
              }}
              disabled={
                settingUpPassword ||
                setupPassword.length < 8 ||
                setupPassword !== setupConfirm
              }
            >
              {settingUpPassword
                ? locale === "ko"
                  ? "설정 중..."
                  : "Setting..."
                : locale === "ko"
                  ? "비밀번호 설정"
                  : "Set password"}
            </V2PrimaryBtn>
          </div>
        </section>
      ) : null}

      <section>
        <V2SettingsSection
          title={locale === "ko" ? "연결된 계정" : "Connected Accounts"}
          description={
            locale === "ko"
              ? "외부 로그인(Google 등)을 이 계정과 연결한 내역입니다. 연결 해제 후에도 비밀번호로 계속 로그인할 수 있습니다."
              : "External sign-in providers linked to this account. You can still sign in with your password after disconnecting."
          }
        />
        {oauthAccounts && oauthAccounts.length > 0 ? (
          <V2SettingsGroup
            ariaLabel={
              locale === "ko" ? "연결된 외부 계정" : "Linked external accounts"
            }
          >
            {oauthAccounts.map((account) => {
              const providerLabel = PROVIDER_LABEL[account.provider] ?? account.provider;
              return (
                <V2NavRow
                  key={account.id}
                  label={providerLabel}
                  description={
                    [
                      account.email ?? account.providerSubjectMasked,
                      locale === "ko"
                        ? `연결: ${formatDateTime(account.createdAt, locale)}`
                        : `Linked: ${formatDateTime(account.createdAt, locale)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  }
                  value={
                    unlinkingProvider === account.provider
                      ? locale === "ko"
                        ? "해제 중..."
                        : "..."
                      : locale === "ko"
                        ? "해제"
                        : "Disconnect"
                  }
                  onClick={() => {
                    void runUnlink(account.provider);
                  }}
                  disabled={unlinkingProvider === account.provider}
                  trailing="none"
                />
              );
            })}
          </V2SettingsGroup>
        ) : oauthAccounts && oauthAccounts.length === 0 ? (
          <V2SettingsFootnote>
            {locale === "ko"
              ? "외부 계정으로 연결된 로그인 방법이 없습니다."
              : "No external sign-in providers are linked."}
          </V2SettingsFootnote>
        ) : null}
        {oauthAccounts && oauthAccounts.length > 0 && !hasPassword ? (
          <V2SettingsFootnote>
            {locale === "ko"
              ? "비밀번호가 설정되어 있지 않습니다. 연결 해제 전에 비밀번호 재설정 메일로 새 비밀번호를 만들어 두세요."
              : "No password is set. Run password-reset to create one before disconnecting your only sign-in method."}
          </V2SettingsFootnote>
        ) : null}
      </section>

      <section className="v2-font-display">
        <V2SettingsSection
          title={locale === "ko" ? "계정 삭제" : "Delete Account"}
          description={
            locale === "ko"
              ? "계정과 본인 데이터를 영구 삭제합니다. 공용 운동 카탈로그는 보존됩니다."
              : "Permanently delete your account and personal data. The shared exercise catalog is preserved."
          }
        />
        <V2SettingsGroup
          ariaLabel={locale === "ko" ? "삭제 범위" : "Deletion scope"}
        >
          <V2NavRow
            label={
              locale === "ko" ? "삭제되는 데이터" : "Data Removed"
            }
            description={
              locale === "ko"
                ? "운동 기록, 세트, 플랜, 커스텀 템플릿, 인증 토큰, 비밀번호 재설정 토큰, 이메일 인증 토큰"
                : "Workout logs, sets, plans, custom templates, auth sessions, reset and verification tokens"
            }
            value={locale === "ko" ? "전체" : "All"}
          />
          <V2NavRow
            label={locale === "ko" ? "보존되는 데이터" : "Data Preserved"}
            description={
              locale === "ko"
                ? "공용 운동 카탈로그, 다른 사용자의 데이터"
                : "Shared exercise catalog, other users' data"
            }
            value={locale === "ko" ? "공용" : "Shared"}
          />
        </V2SettingsGroup>
        <label
          style={{
            display: "block",
            marginTop: "var(--v2-s-2)",
            fontSize: "var(--v2-t-small)",
            color: "var(--v2-ink-2)",
          }}
        >
          {locale === "ko"
            ? "본인 확인용 현재 비밀번호"
            : "Current password (required)"}
          <input
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            placeholder={locale === "ko" ? "비밀번호" : "Password"}
            style={{
              display: "block",
              width: "100%",
              marginTop: 6,
              padding: "var(--v2-s-3) var(--v2-s-3)",
              borderRadius: "var(--v2-r-2)",
              border: "none",
              background: "var(--v2-paper-2)",
              color: "var(--v2-ink)",
              fontFamily: "inherit",
              fontSize: "var(--v2-t-16)",
              boxSizing: "border-box",
            }}
          />
        </label>
        <V2SecondaryBtn
          full
          tone="danger"
          style={{ marginTop: "var(--v2-s-2)" }}
          onClick={() => {
            void runDeleteAccount();
          }}
          disabled={deleting || !deletePassword}
        >
          {deleting
            ? locale === "ko"
              ? "삭제 중..."
              : "Deleting..."
            : locale === "ko"
              ? "계정 삭제"
              : "Delete Account"}
        </V2SecondaryBtn>
        <V2SettingsFootnote>
          {locale === "ko"
            ? "이 작업은 복구할 수 없습니다. 비밀번호 재확인 후에만 진행됩니다."
            : "This action cannot be undone. You will be asked to re-enter your password."}
        </V2SettingsFootnote>
      </section>
    </div>
  );
}
