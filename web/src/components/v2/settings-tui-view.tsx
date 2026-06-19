"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useLocale } from "@/components/locale-provider";
import { apiGet } from "@/lib/api";
import { createPersistServerSetting } from "@/lib/settings/settings-api";
import { useSettingRowMutation } from "@/lib/settings/use-setting-row-mutation";
import {
  applyThemeSkinToDocument,
  DEFAULT_THEME_SKIN,
  normalizeThemeSkin,
  SETTINGS_KEYS,
  type ThemeSkin,
} from "@/lib/settings/workout-preferences";
import type { SettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";

// terminal(ironlog) settings 뷰 — paper V2MorePage의 terminal 대응(P4).
// tree + reverse-video. 핵심은 테마 토글(paper/terminal) — 동일 mutation 훅 재사용해
// terminal에서 paper로 복귀 가능. 그 외는 sub-page로 링크(레이아웃이 시트로 표시).
// 인라인 디테일(bodyweight/goal/언어/화면모드)은 후속(P4-b). TermShell ViewPane 안 렌더.

type MeUser = { email: string | null; displayName: string | null; fallback?: boolean };

const NAV: { label: string; href: string }[] = [
  { label: "account", href: "/settings/account" },
  { label: "data", href: "/settings/data" },
  { label: "export", href: "/settings/data-export" },
  { label: "exercises", href: "/exercises" },
  { label: "min plate", href: "/settings/minimum-plate" },
  { label: "debug", href: "/settings/debug" },
];

export function SettingsTuiView() {
  const { locale } = useLocale();
  const [me, setMe] = useState<MeUser | null>(null);
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        if (res.ok && !cancelled) setMe((await res.json()).user ?? null);
      } catch {
        /* ignore */
      }
    })();
    (async () => {
      try {
        const body = await apiGet<{ settings: SettingsSnapshot }>("/api/settings");
        if (!cancelled) setSnapshot(body.settings);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const skin = useSettingRowMutation<string>({
    key: SETTINGS_KEYS.themeSkin,
    fallbackValue: DEFAULT_THEME_SKIN,
    serverValue: normalizeThemeSkin(snapshot?.[SETTINGS_KEYS.themeSkin]),
    persistServer: createPersistServerSetting<string>(),
    successMessage: locale === "ko" ? "테마를 저장했습니다." : "Saved the theme.",
    rollbackNotice:
      locale === "ko" ? "테마 저장에 실패했습니다." : "Failed to save the theme.",
  });
  useEffect(() => {
    applyThemeSkinToDocument(normalizeThemeSkin(skin.value));
  }, [skin.value]);
  const selectedSkin = normalizeThemeSkin(skin.value);
  const skinOptions: { value: ThemeSkin; label: string }[] = [
    { value: "paper", label: "paper" },
    { value: "terminal", label: "terminal" },
  ];

  return (
    <section
      aria-label={locale === "ko" ? "설정" : "Settings"}
      style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-4)" }}
    >
      {/* 로그인 계정 */}
      <div className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
        <span style={{ color: "var(--term-green)" }}>user@</span>
        <span style={{ color: "var(--term-fg)" }}>
          {me?.displayName || me?.email || (locale === "ko" ? "게스트" : "guest")}
        </span>
        {me?.fallback ? (
          <span style={{ color: "var(--term-dim)" }}> (env)</span>
        ) : null}
      </div>

      {/* 테마 토글 (핵심: terminal↔paper) */}
      <div style={PANEL}>
        <div
          className="v2-mono-label"
          style={{ color: "var(--term-dim)", marginBottom: "var(--v2-s-2)" }}
        >
          {locale === "ko" ? "테마" : "theme"}
        </div>
        <div style={{ display: "flex", gap: "var(--v2-s-1)", flexWrap: "wrap" }}>
          {skinOptions.map((o) => {
            const active = o.value === selectedSkin;
            return (
              <button
                key={o.value}
                type="button"
                disabled={skin.pending}
                onClick={() => void skin.commit(o.value)}
                className="v2-mono-label"
                style={{
                  minHeight: "var(--v2-touch)",
                  padding: "0 var(--v2-s-3)",
                  background: active ? "var(--term-sel)" : "transparent",
                  border: "none",
                  boxShadow: active
                    ? "inset var(--v2-s-1) 0 0 var(--term-amber)"
                    : undefined,
                  color: active ? "var(--term-amber)" : "var(--term-dim)",
                  cursor: skin.pending ? "not-allowed" : "pointer",
                }}
              >
                [{o.label}
                {active ? "*" : ""}]
              </button>
            );
          })}
        </div>
        <div
          className="v2-mono-label"
          style={{ color: "var(--term-ghost)", marginTop: "var(--v2-s-2)" }}
        >
          {locale === "ko"
            ? "terminal은 다크 고정 · 화면모드/언어/체중은 paper에서"
            : "terminal = dark-fixed · appearance/lang/bodyweight in paper"}
        </div>
      </div>

      {/* 설정 트리 (sub-page 링크 → 레이아웃 시트) */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {NAV.map((n, i) => {
          const last = i === NAV.length - 1;
          return (
            <a
              key={n.href}
              href={n.href}
              className="v2-mono-label"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--v2-s-2)",
                minHeight: "var(--v2-touch)",
                textDecoration: "none",
                color: "var(--term-fg)",
              }}
            >
              <span style={{ color: "var(--term-dim)" }}>
                {last ? "└─" : "├─"}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{n.label}</span>
              <span style={{ color: "var(--term-ghost)" }}>›</span>
            </a>
          );
        })}
      </div>

      {/* 로그아웃 */}
      <button
        type="button"
        onClick={async () => {
          try {
            await fetch("/api/auth/logout", { method: "POST" });
          } catch {
            /* ignore */
          }
          window.location.href = "/login";
        }}
        className="v2-mono-label"
        style={{
          alignSelf: "flex-start",
          minHeight: "var(--v2-touch)",
          padding: "0 var(--v2-s-2)",
          background: "transparent",
          border: "none",
          color: "var(--term-red)",
          cursor: "pointer",
        }}
      >
        [{locale === "ko" ? "로그아웃" : "logout"}]
      </button>
    </section>
  );
}

const PANEL: CSSProperties = {
  padding: "var(--v2-s-3)",
  background: "var(--term-panel)",
  boxShadow: "inset 0 0 0 1px var(--term-line-box)",
  borderRadius: "var(--v2-r-2)",
};
