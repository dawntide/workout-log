"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { useThemeSkin } from "@/components/use-theme-skin";
import { SettingsTuiView } from "@/components/v2/settings-tui-view";
import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import { V2Card, V2IconBtn, V2NavRow, V2PrimaryBtn, V2SecondaryBtn, V2Stack } from "@/components/v2/primitives";
import { apiGet } from "@/lib/api";
import { createPersistServerSetting } from "@/lib/settings/settings-api";
import { useSettingRowMutation } from "@/lib/settings/use-setting-row-mutation";
import {
  applyThemePreferenceToDocument,
  applyThemeSkinToDocument,
  DEFAULT_TRAINING_GOAL_PRIMARY,
  normalizeLocalePreference,
  normalizeThemePreference,
  normalizeThemeSkin,
  normalizeTrainingGoal,
  parseTrainingGoalSecondary,
  serializeTrainingGoalSecondary,
  SETTINGS_KEYS,
  type LocalePreference,
  type ThemePreference,
  type ThemeSkin,
  type TrainingGoalKey,
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

// skin 분기 래퍼 — terminal이면 SettingsTuiView(테마 토글 포함), paper는 기존(무수정).
export function V2MorePage() {
  const skin = useThemeSkin();
  if (skin === "terminal") return <SettingsTuiView activeSkin={skin} />;
  return <V2MorePagePaper activeSkin={skin} />;
}

function V2MorePagePaper({ activeSkin }: { activeSkin: ThemeSkin }) {
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
        paddingTop: "var(--v2-s-4)",
        paddingBottom: "var(--v2-s-6)",
        background: "var(--v2-bg)",
        minHeight: "100%",
      }}
    >
      <div style={{ padding: "var(--v2-s-2) 0px var(--v2-s-3)" }}>
        <p className="v2-eyebrow">{locale === "ko" ? "더보기" : "MORE"}</p>
        <h1 id={headingId} className="v2-h1" style={{ marginTop: "var(--v2-s-1)" }}>
          {locale === "ko" ? "계정 · 설정" : "Account · Settings"}
        </h1>
        <p
          className="v2-small"
          style={{ marginTop: "var(--v2-s-1)", color: "var(--v2-ink-2)" }}
        >
          {locale === "ko"
            ? "계정, 단위, 테마처럼 자주 쓰는 보조 기능만 모았습니다."
            : "Account, units, theme, and supporting app controls."}
        </p>
      </div>

      {me && (
        <div className="v2-font-display" style={{ padding: "0px 0px var(--v2-s-1)" }}>
          <V2Card
            tone="inset"
            padding="var(--v2-s-4)"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--v2-s-3)",
            }}
          >
            <div
              className="v2-h3 v2-font-display"
              style={{
                width: "var(--v2-s-8)",
                height: "var(--v2-s-8)",
                borderRadius: "var(--v2-r-pill)",
                background: "var(--v2-accent)",
                color: "var(--v2-ink-on-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {(me.displayName?.[0] ?? me.email?.[0] ?? "?").toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="v2-body v2-font-display"
                style={{
                  fontWeight: 700,
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
              <V2IconBtn
                icon="lock"
                label={locale === "ko" ? "비밀번호 변경" : "Change password"}
                onClick={() => setPwOpen(true)}
              />
            )}
          </V2Card>
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
        <TrainingGoalRow
          snapshot={snapshot}
          expanded={expandedRow === "training-goal"}
          onToggle={(next) => setExpandedRow(next ? "training-goal" : null)}
        />
      </Section>

      {/* ── APP ──────────────────────────────────────────── */}
      <Section title={locale === "ko" ? "앱" : "App"}>
        <ThemeSkinRow
          snapshot={snapshot}
          activeSkin={activeSkin}
          expanded={expandedRow === "theme-skin"}
          onToggle={(next) => setExpandedRow(next ? "theme-skin" : null)}
        />
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
          padding: "var(--v2-s-5) 0px var(--v2-s-6)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-3)",
        }}
      >
        <V2SecondaryBtn
          icon="logout"
          onClick={async () => {
            try {
              await fetch("/api/auth/logout", { method: "POST" });
            } catch {
              // ignore
            }
            window.location.href = "/login";
          }}
        >
          {locale === "ko" ? "로그아웃" : "Sign out"}
        </V2SecondaryBtn>

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
    <div style={{ padding: "var(--v2-s-3) 0px 0px" }}>
      <div className="v2-label" style={{ padding: "0px var(--v2-s-2) var(--v2-s-1)" }}>
        {title}
      </div>
      <V2Card
        padding={0}
        radius="var(--v2-r-3)"
        style={{
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          ["--v2-nav-row-radius" as string]: "0",
        } as CSSProperties}
      >
        {children}
      </V2Card>
    </div>
  );
}

/* ── ThemeSkinRow (paper | terminal 스킨) ───────────── */

function ThemeSkinRow({
  snapshot,
  activeSkin,
  expanded,
  onToggle,
}: {
  snapshot: SettingsSnapshot | null;
  activeSkin: ThemeSkin;
  expanded: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { locale } = useLocale();
  const serverSkin =
    snapshot === null
      ? activeSkin
      : normalizeThemeSkin(snapshot[SETTINGS_KEYS.themeSkin]);
  const skin = useSettingRowMutation<string>({
    key: SETTINGS_KEYS.themeSkin,
    fallbackValue: activeSkin,
    serverValue: serverSkin,
    persistServer: createPersistServerSetting<string>(),
    successMessage:
      locale === "ko" ? "테마를 저장했습니다." : "Saved the theme.",
    rollbackNotice:
      locale === "ko" ? "테마 저장에 실패했습니다." : "Failed to save the theme.",
  });

  useEffect(() => {
    if (snapshot === null) return;
    applyThemeSkinToDocument(normalizeThemeSkin(skin.value));
  }, [skin.value, snapshot]);

  const selected = normalizeThemeSkin(skin.value);
  const options: Array<{ value: ThemeSkin; label: string }> = useMemo(
    () => [
      { value: "paper", label: locale === "ko" ? "페이퍼 (기본)" : "Paper (default)" },
      { value: "terminal", label: locale === "ko" ? "터미널 (ironlog)" : "Terminal (ironlog)" },
    ],
    [locale],
  );
  const currentLabel = options.find((o) => o.value === selected)?.label ?? "—";

  return (
    <V2NavRow
      icon="terminal"
      label={locale === "ko" ? "테마" : "Theme"}
      value={currentLabel}
      expandable
      expanded={expanded}
      onExpandedChange={onToggle}
      disabled={skin.pending}
      expandedContent={
        <OptionList
          options={options}
          selected={selected}
          onSelect={(value) => {
            void skin.commit(value);
          }}
          disabled={skin.pending}
        />
      }
    />
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
      label={locale === "ko" ? "화면 모드" : "Appearance"}
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

/** label(eyebrow)을 위, iOS 키패드 입력을 아래로 쌓는 래퍼. 운동 기록/최소 원판 화면과 동일한 패턴. */
function LabeledKeypadField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <V2Stack gap={1}>
      <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
        {label}
      </span>
      {children}
    </V2Stack>
  );
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
          <LabeledKeypadField label={locale === "ko" ? "체중 (kg)" : "Bodyweight (kg)"}>
            <NumberKeypadField
              ariaLabel={locale === "ko" ? "체중 (kg)" : "Bodyweight (kg)"}
              value={draft}
              min={MIN_BODYWEIGHT_KG}
              max={MAX_BODYWEIGHT_KG}
              allowDecimal
              step={0.1}
              onChange={(next) => setDraft(normalizeBodyweightKg(next))}
            />
          </LabeledKeypadField>
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

/* ── TrainingGoalRow ─────────────────────────────────── */

function TrainingGoalRow({
  snapshot,
  expanded,
  onToggle,
}: {
  snapshot: SettingsSnapshot | null;
  expanded: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { locale } = useLocale();
  const serverPrimary = normalizeTrainingGoal(
    snapshot?.[SETTINGS_KEYS.trainingGoalPrimary],
  );
  const serverSecondaryJson = serializeTrainingGoalSecondary(
    parseTrainingGoalSecondary(
      snapshot?.[SETTINGS_KEYS.trainingGoalSecondaryJson],
      serverPrimary,
    ),
  );

  const primaryMutation = useSettingRowMutation<string>({
    key: SETTINGS_KEYS.trainingGoalPrimary,
    fallbackValue: DEFAULT_TRAINING_GOAL_PRIMARY,
    serverValue: serverPrimary,
    persistServer: createPersistServerSetting<string>(),
    successMessage:
      locale === "ko" ? "주 운동 목적을 저장했습니다." : "Saved primary goal.",
    rollbackNotice:
      locale === "ko"
        ? "주 운동 목적 저장에 실패했습니다."
        : "Failed to save primary goal.",
  });

  const secondaryMutation = useSettingRowMutation<string>({
    key: SETTINGS_KEYS.trainingGoalSecondaryJson,
    fallbackValue: "[]",
    serverValue: serverSecondaryJson,
    persistServer: createPersistServerSetting<string>(),
    successMessage:
      locale === "ko" ? "부 운동 목적을 저장했습니다." : "Saved secondary goals.",
    rollbackNotice:
      locale === "ko"
        ? "부 운동 목적 저장에 실패했습니다."
        : "Failed to save secondary goals.",
  });

  const selectedPrimary = normalizeTrainingGoal(primaryMutation.value);
  const selectedSecondary = parseTrainingGoalSecondary(
    secondaryMutation.value,
    selectedPrimary,
  );

  const goalOptions = useMemo<Array<{ value: TrainingGoalKey; label: string }>>(
    () => [
      { value: "strength", label: locale === "ko" ? "근력" : "Strength" },
      {
        value: "powerlifting",
        label: locale === "ko" ? "파워리프팅" : "Powerlifting",
      },
      { value: "hypertrophy", label: locale === "ko" ? "근비대" : "Hypertrophy" },
      { value: "endurance", label: locale === "ko" ? "근지구력" : "Endurance" },
      {
        value: "general",
        label: locale === "ko" ? "일반 건강" : "General Health",
      },
    ],
    [locale],
  );

  const currentLabel =
    goalOptions.find((o) => o.value === selectedPrimary)?.label ?? "—";
  const valueLabel =
    selectedSecondary.length > 0
      ? `${currentLabel} +${selectedSecondary.length}`
      : currentLabel;

  const pending = primaryMutation.pending || secondaryMutation.pending;

  const handlePrimary = useCallback(
    (next: TrainingGoalKey) => {
      void primaryMutation.commit(next);
      if (selectedSecondary.includes(next)) {
        const filtered = selectedSecondary.filter((g) => g !== next);
        void secondaryMutation.commit(
          serializeTrainingGoalSecondary(filtered),
        );
      }
    },
    [primaryMutation, secondaryMutation, selectedSecondary],
  );

  const handleToggleSecondary = useCallback(
    (key: TrainingGoalKey) => {
      if (key === selectedPrimary) return;
      const current = new Set(selectedSecondary);
      if (current.has(key)) current.delete(key);
      else current.add(key);
      void secondaryMutation.commit(
        serializeTrainingGoalSecondary(Array.from(current)),
      );
    },
    [secondaryMutation, selectedPrimary, selectedSecondary],
  );

  return (
    <V2NavRow
      icon="track_changes"
      label={locale === "ko" ? "운동 목적" : "Training Goal"}
      value={valueLabel}
      expandable
      expanded={expanded}
      onExpandedChange={onToggle}
      disabled={pending}
      expandedContent={
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-3)",
          }}
        >
          <div>
            <p
              className="v2-label"
              style={{ padding: "0 0 var(--v2-s-1)" }}
            >
              {locale === "ko" ? "주 목적 (통계 기준)" : "Primary (analytics)"}
            </p>
            <OptionList
              options={goalOptions}
              selected={selectedPrimary}
              onSelect={(value) => handlePrimary(value)}
              disabled={pending}
            />
          </div>
          <div>
            <p
              className="v2-label"
              style={{ padding: "0 0 var(--v2-s-1)" }}
            >
              {locale === "ko" ? "부 목적 (선택)" : "Secondary (optional)"}
            </p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--v2-s-1)",
              }}
            >
              {goalOptions
                .filter((o) => o.value !== selectedPrimary)
                .map((o) => {
                  const active = selectedSecondary.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      disabled={pending}
                      onClick={() => handleToggleSecondary(o.value)}
                      className="v2-font-display"
                      style={{
                        padding: "var(--v2-s-2) var(--v2-s-3)",
                        minHeight: "var(--v2-s-8)",
                        borderRadius: "var(--v2-r-pill)",
                        background: active
                          ? "var(--v2-accent-weak)"
                          : "var(--v2-paper-2)",
                        color: active
                          ? "var(--v2-accent-ink)"
                          : "var(--v2-ink)",
                        border: "none",
                        cursor: pending ? "not-allowed" : "pointer",
                        opacity: pending ? 0.6 : 1,
                        fontSize: "var(--v2-t-12)",
                        fontWeight: 600,
                      }}
                    >
                      {o.label}
                    </button>
                  );
                })}
            </div>
            <p
              className="v2-small"
              style={{
                color: "var(--v2-ink-3)",
                marginTop: "var(--v2-s-2)",
              }}
            >
              {locale === "ko"
                ? "주 목적은 통계 화면을 결정하고, 부 목적은 함께 추적할 보조 관심사입니다."
                : "Primary drives the analytics view; secondary goals are tracked alongside."}
            </p>
          </div>
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
            className="v2-pressable v2-font-display"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--v2-s-3) var(--v2-s-3)",
              minHeight: "var(--v2-s-8)",
              background: active ? "var(--v2-accent-weak)" : "transparent",
              color: active ? "var(--v2-accent-ink)" : "var(--v2-ink)",
              border: "none",
              borderRadius: "var(--v2-r-2)",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
              fontSize: "var(--v2-t-14)",
              fontWeight: 600,
              textAlign: "left",
            }}
          >
            <span>{option.label}</span>
            {active ? (
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: "var(--v2-t-18)",
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
        gap: "var(--v2-s-1)",
        marginTop: 12,
      }}
    >
      <p className="v2-mono-label">Workout Log · v{version} · Next.js</p>
      <a
        href="/onboarding"
        className="v2-anchor v2-font-text"
        style={{
          display: "inline-block",
          color: "var(--v2-ink-3)",
          textDecoration: "underline",
          textUnderlineOffset: 3,
          fontSize: "var(--v2-t-12)",
        }}
      >
        {locale === "ko" ? "환영 투어 다시 보기" : "Replay welcome tour"}
      </a>
    </div>
  );
}
