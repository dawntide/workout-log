"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { AppNumberStepper } from "@/components/ui/form-controls";
import { V2NavRow, V2PrimaryBtn } from "@/components/v2/primitives";
import { apiGet } from "@/lib/api";
import { createPersistServerSetting } from "@/lib/settings/settings-api";
import { useSettingRowMutation } from "@/lib/settings/use-setting-row-mutation";
import {
  applyThemePreferenceToDocument,
  normalizeLocalePreference,
  normalizeThemePreference,
  SETTINGS_KEYS,
  type LocalePreference,
  type ThemePreference,
} from "@/lib/settings/workout-preferences";
import type { SettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";
import { V2PasswordSheet } from "./v2-password-sheet";

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

type SettingsResponse = {
  settings: SettingsSnapshot;
};

export function V2MorePage() {
  const { locale } = useLocale();
  const headingId = useId();
  const [me, setMe] = useState<MeResponse["user"] | null>(null);
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const body = await apiGet<SettingsResponse>("/api/settings");
        if (!cancelled) setSnapshot(body.settings);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
            ? "계정, 단위, 테마처럼 자주 쓰는 보조 기능만 모았습니다."
            : "Account, units, theme, and supporting app controls."}
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
                className="v2-pressable"
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

      {/* ── ACCOUNT ──────────────────────────────────────── */}
      <Section title={locale === "ko" ? "계정" : "Account"}>
        <V2NavRow
          as="a"
          href="/settings/account"
          icon="manage_accounts"
          label={locale === "ko" ? "계정 설정" : "Account Settings"}
          description={
            locale === "ko"
              ? "이메일 · 연결 계정"
              : "Email · linked accounts"
          }
        />
        <V2NavRow
          as="a"
          href="/settings/data"
          icon="cloud_sync"
          label={locale === "ko" ? "데이터" : "Data"}
          description={locale === "ko" ? "동기화 · 초기화" : "Sync · reset"}
        />
        <V2NavRow
          as="a"
          href="/settings/data-export"
          icon="cloud_upload"
          label={locale === "ko" ? "데이터 내보내기" : "Export Data"}
          description={
            locale === "ko" ? "JSON · CSV 다운로드" : "JSON · CSV download"
          }
        />
      </Section>

      {/* ── TRAINING ─────────────────────────────────────── */}
      <Section title={locale === "ko" ? "운동 설정" : "Training Settings"}>
        <V2NavRow
          as="a"
          href="/exercises"
          icon="fitness_center"
          label={locale === "ko" ? "운동 관리" : "Manage Exercises"}
          description={
            locale === "ko"
              ? "이름·근육군·세트 기본값"
              : "Names, muscles, defaults"
          }
        />
        <V2NavRow
          as="a"
          href="/settings/minimum-plate"
          icon="straighten"
          label={locale === "ko" ? "최소 원판" : "Minimum Plate"}
          description={
            locale === "ko"
              ? "사용 가능한 가장 작은 원판"
              : "Smallest plate you load"
          }
        />
        <BodyweightRow
          snapshot={snapshot}
          expanded={expandedRow === "bodyweight"}
          onToggle={(next) => setExpandedRow(next ? "bodyweight" : null)}
        />
      </Section>

      {/* ── APP ──────────────────────────────────────────── */}
      <Section title={locale === "ko" ? "앱" : "App"}>
        <ThemeRow
          snapshot={snapshot}
          expanded={expandedRow === "theme"}
          onToggle={(next) => setExpandedRow(next ? "theme" : null)}
        />
        <LanguageRow
          snapshot={snapshot}
          expanded={expandedRow === "language"}
          onToggle={(next) => setExpandedRow(next ? "language" : null)}
        />
      </Section>

      {/* ── ADVANCED ─────────────────────────────────────── */}
      <Section title={locale === "ko" ? "고급" : "Advanced"}>
        <V2NavRow
          as="a"
          href="/settings/debug"
          icon="bug_report"
          label={locale === "ko" ? "디버그 도구" : "Debug Tools"}
          description={
            locale === "ko"
              ? "시스템 통계 · 임계값 · 데모"
              : "System stats · thresholds · demos"
          }
        />
      </Section>

      {/* ── FOOTER (App info + logout + onboarding replay) ── */}
      <div
        style={{
          padding: "20px 16px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
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
          className="v2-pressable"
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

        <AppInfoFooter />
      </div>

      <V2PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

/* ── Section wrapper ─────────────────────────────────── */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ padding: "12px 16px 0" }}>
      <div className="v2-label" style={{ padding: "0 8px 6px" }}>
        {title}
      </div>
      <div
        style={{
          background: "var(--v2-paper-2)",
          borderRadius: 16,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ── ThemeRow ────────────────────────────────────────── */

function ThemeRow({
  snapshot,
  expanded,
  onToggle,
}: {
  snapshot: SettingsSnapshot | null;
  expanded: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { locale } = useLocale();
  const serverTheme = normalizeThemePreference(
    snapshot?.[SETTINGS_KEYS.theme],
  );
  const theme = useSettingRowMutation<string>({
    key: SETTINGS_KEYS.theme,
    fallbackValue: "SYSTEM",
    serverValue: serverTheme,
    persistServer: createPersistServerSetting<string>(),
    successMessage:
      locale === "ko" ? "테마 설정을 저장했습니다." : "Saved the theme.",
    rollbackNotice:
      locale === "ko"
        ? "테마 저장에 실패했습니다."
        : "Failed to save the theme.",
  });

  useEffect(() => {
    applyThemePreferenceToDocument(normalizeThemePreference(theme.value));
  }, [theme.value]);

  const selected = normalizeThemePreference(theme.value);
  const options: Array<{ value: ThemePreference; label: string }> = useMemo(
    () => [
      { value: "LIGHT", label: locale === "ko" ? "라이트" : "Light" },
      { value: "DARK", label: locale === "ko" ? "다크" : "Dark" },
      { value: "SYSTEM", label: locale === "ko" ? "시스템 따름" : "Follow System" },
    ],
    [locale],
  );

  const currentLabel =
    options.find((o) => o.value === selected)?.label ?? "—";

  return (
    <V2NavRow
      icon="contrast"
      label={locale === "ko" ? "테마" : "Theme"}
      value={currentLabel}
      expandable
      expanded={expanded}
      onExpandedChange={onToggle}
      disabled={theme.pending}
      expandedContent={
        <OptionList
          options={options}
          selected={selected}
          onSelect={(value) => {
            void theme.commit(value);
          }}
          disabled={theme.pending}
        />
      }
    />
  );
}

/* ── LanguageRow ─────────────────────────────────────── */

function LanguageRow({
  snapshot,
  expanded,
  onToggle,
}: {
  snapshot: SettingsSnapshot | null;
  expanded: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { locale, setLocale } = useLocale();
  const serverLocale = normalizeLocalePreference(
    snapshot?.[SETTINGS_KEYS.locale],
  );
  const language = useSettingRowMutation<LocalePreference>({
    key: SETTINGS_KEYS.locale,
    fallbackValue: locale,
    serverValue: serverLocale,
    persistServer: createPersistServerSetting<LocalePreference>(),
    successMessage:
      locale === "ko" ? "언어 설정을 저장했습니다." : "Saved the language.",
    rollbackNotice:
      locale === "ko"
        ? "언어 저장에 실패했습니다."
        : "Failed to save the language.",
  });

  const selected = normalizeLocalePreference(language.value);
  const options: Array<{ value: LocalePreference; label: string }> = useMemo(
    () => [
      { value: "ko", label: "한국어" },
      { value: "en", label: "English" },
    ],
    [],
  );

  const selectLanguage = useCallback(
    async (next: LocalePreference) => {
      const previous = selected;
      setLocale(next);
      const result = await language.commit(next);
      if (result.ignored) return;
      if (result.ok) {
        setLocale(result.value);
        return;
      }
      setLocale(previous);
    },
    [language, selected, setLocale],
  );

  const currentLabel =
    options.find((o) => o.value === selected)?.label ?? "—";

  return (
    <V2NavRow
      icon="language"
      label={locale === "ko" ? "언어" : "Language"}
      value={currentLabel}
      expandable
      expanded={expanded}
      onExpandedChange={onToggle}
      disabled={language.pending}
      expandedContent={
        <OptionList
          options={options}
          selected={selected}
          onSelect={(value) => {
            void selectLanguage(value);
          }}
          disabled={language.pending}
        />
      }
    />
  );
}

/* ── BodyweightRow ───────────────────────────────────── */

const MIN_BODYWEIGHT_KG = 20;
const MAX_BODYWEIGHT_KG = 300;
const DEFAULT_BODYWEIGHT_KG = 70;

function normalizeBodyweightKg(value: number) {
  const clipped = Math.max(
    MIN_BODYWEIGHT_KG,
    Math.min(MAX_BODYWEIGHT_KG, value),
  );
  return Math.round(clipped * 10) / 10;
}

function BodyweightRow({
  snapshot,
  expanded,
  onToggle,
}: {
  snapshot: SettingsSnapshot | null;
  expanded: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { locale } = useLocale();
  const serverKg = (() => {
    const raw = snapshot?.[SETTINGS_KEYS.bodyweightKg];
    const parsed = Number(raw);
    return normalizeBodyweightKg(
      Number.isFinite(parsed) ? parsed : DEFAULT_BODYWEIGHT_KG,
    );
  })();

  const bodyweight = useSettingRowMutation<number>({
    key: SETTINGS_KEYS.bodyweightKg,
    fallbackValue: DEFAULT_BODYWEIGHT_KG,
    serverValue: serverKg,
    persistServer: createPersistServerSetting<number>(),
    successMessage:
      locale === "ko" ? "몸무게를 저장했습니다." : "Saved bodyweight.",
    rollbackNotice:
      locale === "ko"
        ? "몸무게 저장에 실패했습니다."
        : "Failed to save bodyweight.",
  });

  const [draft, setDraft] = useState(normalizeBodyweightKg(bodyweight.value));

  useEffect(() => {
    if (bodyweight.pending) return;
    setDraft(normalizeBodyweightKg(bodyweight.value));
  }, [bodyweight.pending, bodyweight.value]);

  const normalizedDraft = normalizeBodyweightKg(draft);
  const canSave =
    !bodyweight.pending &&
    normalizedDraft !== normalizeBodyweightKg(bodyweight.value);

  return (
    <V2NavRow
      icon="monitor_weight"
      label={locale === "ko" ? "체중" : "Bodyweight"}
      value={`${normalizeBodyweightKg(bodyweight.value).toFixed(1)} kg`}
      expandable
      expanded={expanded}
      onExpandedChange={onToggle}
      expandedContent={
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-2)",
          }}
        >
          <AppNumberStepper
            label="Bodyweight (kg)"
            value={draft}
            min={MIN_BODYWEIGHT_KG}
            max={MAX_BODYWEIGHT_KG}
            step={0.1}
            inputMode="decimal"
            onChange={(next) => setDraft(normalizeBodyweightKg(next))}
          />
          <V2PrimaryBtn
            full
            disabled={!canSave}
            onClick={() => {
              void bodyweight.commit(normalizedDraft);
            }}
          >
            {bodyweight.pending
              ? locale === "ko"
                ? "저장 중..."
                : "Saving..."
              : locale === "ko"
                ? "체중 저장"
                : "Save bodyweight"}
          </V2PrimaryBtn>
          <p className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
            {locale === "ko"
              ? "풀업 등 체중 기반 운동의 총 부하 계산에 사용됩니다."
              : "Used for total-load calculations on bodyweight-based exercises like pull-ups."}
          </p>
        </div>
      }
    />
  );
}

/* ── OptionList (radio-style picker, used by Theme & Language) ── */

function OptionList<T extends string>({
  options,
  selected,
  onSelect,
  disabled,
}: {
  options: Array<{ value: T; label: string }>;
  selected: T;
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--v2-s-1)",
      }}
      role="radiogroup"
    >
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onSelect(option.value)}
            className="v2-pressable"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              minHeight: 44,
              background: active ? "var(--v2-accent-weak)" : "transparent",
              color: active ? "var(--v2-accent-ink)" : "var(--v2-ink)",
              border: "none",
              borderRadius: "var(--v2-r-2)",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
              fontFamily: "var(--v2-f-display)",
              fontSize: 14,
              fontWeight: 600,
              textAlign: "left",
            }}
          >
            <span>{option.label}</span>
            {active ? (
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: 18,
                  color: "var(--v2-accent)",
                  fontVariationSettings: "'FILL' 1, 'wght' 600",
                }}
                aria-hidden
              >
                check
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ── AppInfoFooter (replaces /settings/about) ────────── */

function AppInfoFooter() {
  const { locale } = useLocale();
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
  return (
    <div
      style={{
        textAlign: "center",
        color: "var(--v2-ink-3)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        marginTop: 12,
      }}
    >
      <p className="v2-mono-label">Workout Log · v{version} · Next.js</p>
      <a
        href="/onboarding"
        className="v2-anchor"
        style={{
          display: "inline-block",
          color: "var(--v2-ink-3)",
          textDecoration: "underline",
          textUnderlineOffset: 3,
          fontFamily: "var(--v2-f-text)",
          fontSize: 12,
        }}
      >
        {locale === "ko" ? "환영 투어 다시 보기" : "Replay welcome tour"}
      </a>
    </div>
  );
}
