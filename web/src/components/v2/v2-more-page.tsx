"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useLocale } from "@/components/locale-provider";
import { V2PasswordSheet } from "./v2-password-sheet";

type ShortcutItem = {
  key: string;
  icon: string;
  href: string;
  title: string;
  subtitle: string;
};

type Section = {
  key: string;
  title: string;
  items: ShortcutItem[];
};

type MeResponse = {
  user:
    | null
    | {
        id: string;
        email: string | null;
        displayName: string | null;
        fallback?: boolean;
      };
};

export function V2MorePage() {
  const { locale } = useLocale();
  const headingId = useId();
  const [me, setMe] = useState<MeResponse["user"] | null>(null);
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as MeResponse;
        if (!cancelled) setMe(body.user);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sections: Section[] = [
    {
      key: "progress",
      title: locale === "ko" ? "진행" : "Progress",
      items: [
        {
          key: "stats",
          icon: "insights",
          href: "/stats",
          title: locale === "ko" ? "통계" : "Stats",
          subtitle:
            locale === "ko" ? "1RM · 볼륨 추이" : "1RM · volume trends",
        },
      ],
    },
    {
      key: "account",
      title: locale === "ko" ? "계정" : "Account",
      items: [
        {
          key: "account-settings",
          icon: "manage_accounts",
          href: "/settings/account",
          title: locale === "ko" ? "계정 설정" : "Account Settings",
          subtitle:
            locale === "ko" ? "이메일 · 연결 계정" : "Email · linked accounts",
        },
        {
          key: "data",
          icon: "cloud_sync",
          href: "/settings/data",
          title: locale === "ko" ? "데이터" : "Data",
          subtitle:
            locale === "ko" ? "동기화 · 초기화" : "Sync · reset",
        },
        {
          key: "data-export",
          icon: "cloud_upload",
          href: "/settings/data-export",
          title: locale === "ko" ? "데이터 내보내기" : "Export Data",
          subtitle:
            locale === "ko" ? "JSON · CSV 다운로드" : "JSON · CSV download",
        },
      ],
    },
    {
      key: "training",
      title: locale === "ko" ? "운동 설정" : "Training Settings",
      items: [
        {
          key: "exercise-management",
          icon: "fitness_center",
          href: "/settings/exercise-management",
          title: locale === "ko" ? "운동 관리" : "Manage Exercises",
          subtitle:
            locale === "ko"
              ? "이름·근육군·세트 기본값"
              : "Names, muscles, defaults",
        },
        {
          key: "minimum-plate",
          icon: "straighten",
          href: "/settings/minimum-plate",
          title: locale === "ko" ? "최소 원판" : "Minimum Plate",
          subtitle:
            locale === "ko"
              ? "사용 가능한 가장 작은 원판"
              : "Smallest plate you load",
        },
        {
          key: "bodyweight",
          icon: "monitor_weight",
          href: "/settings/bodyweight",
          title: locale === "ko" ? "체중" : "Bodyweight",
          subtitle:
            locale === "ko" ? "체중 기반 운동 계산용" : "Used for BW exercises",
        },
      ],
    },
    {
      key: "app",
      title: locale === "ko" ? "앱" : "App",
      items: [
        {
          key: "theme",
          icon: "contrast",
          href: "/settings/theme",
          title: locale === "ko" ? "테마" : "Theme",
          subtitle:
            locale === "ko" ? "라이트 / 다크 / 시스템" : "Light / dark / system",
        },
        {
          key: "language",
          icon: "language",
          href: "/settings/language",
          title: locale === "ko" ? "언어" : "Language",
          subtitle: locale === "ko" ? "한국어 / English" : "한국어 / English",
        },
        {
          key: "about",
          icon: "info",
          href: "/settings/about",
          title: locale === "ko" ? "앱 정보" : "About",
          subtitle: "v2",
        },
        {
          key: "onboarding",
          icon: "rocket_launch",
          href: "/onboarding",
          title:
            locale === "ko" ? "환영 투어 다시 보기" : "Replay Welcome Tour",
          subtitle:
            locale === "ko"
              ? "단위·목표·프로그램 추천"
              : "Units, goals, recommended program",
        },
      ],
    },
  ];

  return (
    <div
      style={{
        paddingTop: 16,
        paddingBottom: 24,
        background: "var(--v2-paper)",
        minHeight: "100%",
      }}
    >
      <div style={{ padding: "8px 24px 12px" }}>
        <p className="v2-eyebrow">{locale === "ko" ? "더보기" : "MORE"}</p>
        <h1 id={headingId} className="v2-h1" style={{ marginTop: 6 }}>
          {locale === "ko" ? "계정 · 설정" : "Account · Settings"}
        </h1>
        <p
          className="v2-small"
          style={{ marginTop: 4, color: "var(--v2-ink-2)" }}
        >
          {locale === "ko"
            ? "통계, 계정, 단위, 테마처럼 자주 쓰는 보조 기능만 모았습니다."
            : "Stats, account, units, theme, and supporting app controls."}
        </p>
      </div>

      {me && (
        <div style={{ padding: "0 16px 4px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 16px",
              background: "var(--v2-paper-2)",
              borderRadius: 16,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 9999,
                background: "var(--v2-accent)",
                color: "var(--v2-ink-on-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--v2-f-display)",
                fontWeight: 700,
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              {(me.displayName?.[0] ?? me.email?.[0] ?? "?").toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--v2-f-display)",
                  fontWeight: 700,
                  fontSize: 14,
                  color: "var(--v2-ink)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {me.displayName ||
                  me.email ||
                  (locale === "ko" ? "사용자" : "User")}
              </div>
              <div
                className="v2-mono-label"
                style={{
                  color: "var(--v2-ink-3)",
                  marginTop: 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {me.fallback
                  ? locale === "ko"
                    ? "환경변수 fallback 계정"
                    : "Env fallback account"
                  : (me.email ?? "")}
              </div>
            </div>
            {!me.fallback && me.email && (
              <button
                type="button"
                onClick={() => setPwOpen(true)}
                aria-label={
                  locale === "ko" ? "비밀번호 변경" : "Change password"
                }
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  border: "none",
                  background: "var(--v2-paper-3)",
                  color: "var(--v2-ink-2)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18 }}
                  aria-hidden
                >
                  lock
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {sections.map((sec) => (
        <div key={sec.key} style={{ padding: "12px 16px 0" }}>
          <div className="v2-label" style={{ padding: "0 8px 6px" }}>
            {sec.title}
          </div>
          <div
            style={{
              background: "var(--v2-paper-2)",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            {sec.items.map((it, i, arr) => (
              <Link
                key={it.key}
                href={it.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 16px",
                  borderBottom:
                    i < arr.length - 1
                      ? "1px solid var(--v2-hairline)"
                      : "none",
                  textDecoration: "none",
                  color: "inherit",
                  minHeight: 56,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 22,
                    color: "var(--v2-accent)",
                  }}
                  aria-hidden
                >
                  {it.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--v2-f-display)",
                      fontWeight: 600,
                      fontSize: 14,
                      color: "var(--v2-ink)",
                    }}
                  >
                    {it.title}
                  </div>
                  <div
                    className="v2-mono-label"
                    style={{
                      color: "var(--v2-ink-3)",
                      marginTop: 2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {it.subtitle}
                  </div>
                </div>
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 18,
                    color: "var(--v2-ink-3)",
                  }}
                  aria-hidden
                >
                  chevron_right
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}

      <div
        style={{
          padding: "20px 16px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={async () => {
            try {
              await fetch("/api/auth/logout", { method: "POST" });
            } catch {
              // ignore
            }
            window.location.href = "/login";
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "12px 18px",
            background: "transparent",
            color: "var(--v2-ink-3)",
            borderRadius: 12,
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--v2-f-display)",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18 }}
            aria-hidden
          >
            logout
          </span>
          {locale === "ko" ? "로그아웃" : "Sign out"}
        </button>
      </div>

      <V2PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
