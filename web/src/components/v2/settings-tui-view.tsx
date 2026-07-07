"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useLocale } from "@/components/locale-provider";
import { apiGet } from "@/lib/api";
import { createPersistServerSetting } from "@/lib/settings/settings-api";
import { useSettingRowMutation } from "@/lib/settings/use-setting-row-mutation";
import {
  applyThemeSkinToDocument,
  DEFAULT_TRAINING_GOAL_PRIMARY,
  normalizeLocalePreference,
  normalizeThemeSkin,
  normalizeTrainingGoal,
  parseTrainingGoalSecondary,
  serializeTrainingGoalSecondary,
  SETTINGS_KEYS,
  type LocalePreference,
  type ThemeSkin,
  type TrainingGoalKey,
} from "@/lib/settings/workout-preferences";
import type { SettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";
import { V2Icon } from "@/components/v2/primitives/v2-icon";
import { V2PasswordSheet } from "./v2-password-sheet";

// terminal(ironlog) settings 뷰 — paper V2MorePage의 terminal 대응(P4).
// tree + reverse-video. 핵심은 테마 토글(paper/terminal) — 동일 mutation 훅 재사용해
// terminal에서 paper로 복귀 가능. 그 외는 sub-page로 링크(레이아웃이 시트로 표시).
// 인라인 디테일(bodyweight/goal/언어/화면모드)은 후속(P4-b). TermShell ViewPane 안 렌더.

type MeUser = { email: string | null; displayName: string | null; fallback?: boolean };

const BW_MIN = 20;
const BW_MAX = 300;
const BW_DEFAULT = 70;
function normBodyweight(v: number): number {
  const safe = Number.isFinite(v) ? v : BW_DEFAULT;
  return Math.round(Math.max(BW_MIN, Math.min(BW_MAX, safe)) * 10) / 10;
}

// 터미널 토글 버튼(active=sel bg + amber 좌바). 테마/언어 토글 공용.
function toggleBtnStyle(active: boolean, pending: boolean): CSSProperties {
  return {
    minHeight: "var(--v2-touch)",
    padding: "0 var(--v2-s-3)",
    background: "transparent",
    border: "none",
    color: active ? "var(--term-amber)" : "var(--term-dim)",
    cursor: pending ? "not-allowed" : "pointer",
  };
}

const NAV: { label: string; href: string }[] = [
  { label: "account", href: "/settings/account" },
  { label: "data", href: "/settings/data" },
  { label: "export", href: "/settings/data-export" },
  { label: "exercises", href: "/exercises" },
  { label: "min plate", href: "/settings/minimum-plate" },
  { label: "debug", href: "/settings/debug" },
];

export function SettingsTuiView({ activeSkin }: { activeSkin: ThemeSkin }) {
  const { locale, setLocale } = useLocale();
  const [me, setMe] = useState<MeUser | null>(null);
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [pwOpen, setPwOpen] = useState(false);

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
    fallbackValue: activeSkin,
    serverValue:
      snapshot === null
        ? activeSkin
        : normalizeThemeSkin(snapshot[SETTINGS_KEYS.themeSkin]),
    persistServer: createPersistServerSetting<string>(),
    successMessage: locale === "ko" ? "테마를 저장했습니다." : "Saved the theme.",
    rollbackNotice:
      locale === "ko" ? "테마 저장에 실패했습니다." : "Failed to save the theme.",
  });
  useEffect(() => {
    if (snapshot === null) return;
    applyThemeSkinToDocument(normalizeThemeSkin(skin.value));
  }, [skin.value, snapshot]);
  const selectedSkin = normalizeThemeSkin(skin.value);
  const skinOptions: { value: ThemeSkin; label: string }[] = [
    { value: "paper", label: "paper" },
    { value: "terminal", label: "terminal" },
  ];

  // 언어 (ko/en) — locale mutation + 즉시 UI 반영(setLocale)
  const lang = useSettingRowMutation<LocalePreference>({
    key: SETTINGS_KEYS.locale,
    fallbackValue: locale,
    serverValue: normalizeLocalePreference(snapshot?.[SETTINGS_KEYS.locale]),
    persistServer: createPersistServerSetting<LocalePreference>(),
    successMessage: locale === "ko" ? "언어를 저장했습니다." : "Saved the language.",
    rollbackNotice: locale === "ko" ? "언어 저장에 실패했습니다." : "Failed to save the language.",
  });
  const selectedLang = normalizeLocalePreference(lang.value);
  const langOptions: { value: LocalePreference; label: string }[] = [
    { value: "ko", label: "한국어" },
    { value: "en", label: "English" },
  ];
  const selectLang = async (next: LocalePreference) => {
    const prev = selectedLang;
    setLocale(next);
    const r = await lang.commit(next);
    if (r.ignored) return;
    setLocale(r.ok ? r.value : prev);
  };

  // 체중 (kg) — bodyweight mutation + 터미널 입력(draft)
  const bw = useSettingRowMutation<number>({
    key: SETTINGS_KEYS.bodyweightKg,
    fallbackValue: BW_DEFAULT,
    serverValue: normBodyweight(Number(snapshot?.[SETTINGS_KEYS.bodyweightKg])),
    persistServer: createPersistServerSetting<number>(),
    successMessage: locale === "ko" ? "체중을 저장했습니다." : "Saved bodyweight.",
    rollbackNotice: locale === "ko" ? "체중 저장에 실패했습니다." : "Failed to save bodyweight.",
  });
  const [bwDraft, setBwDraft] = useState("");
  useEffect(() => {
    if (!bw.pending) setBwDraft(String(normBodyweight(bw.value)));
  }, [bw.pending, bw.value]);
  const bwParsed = Number(bwDraft);
  const bwCanSave =
    !bw.pending &&
    Number.isFinite(bwParsed) &&
    normBodyweight(bwParsed) !== normBodyweight(bw.value);

  // 훈련 목적 (primary) — 통계/목표 기준
  const goal = useSettingRowMutation<string>({
    key: SETTINGS_KEYS.trainingGoalPrimary,
    fallbackValue: DEFAULT_TRAINING_GOAL_PRIMARY,
    serverValue: normalizeTrainingGoal(
      snapshot?.[SETTINGS_KEYS.trainingGoalPrimary],
    ),
    persistServer: createPersistServerSetting<string>(),
    successMessage: locale === "ko" ? "운동 목적을 저장했습니다." : "Saved goal.",
    rollbackNotice: locale === "ko" ? "목적 저장에 실패했습니다." : "Failed to save goal.",
  });
  const selectedGoal = normalizeTrainingGoal(goal.value);
  const goalOptions: { value: TrainingGoalKey; label: string }[] = [
    { value: "strength", label: locale === "ko" ? "근력" : "strength" },
    { value: "powerlifting", label: locale === "ko" ? "파워" : "power" },
    { value: "hypertrophy", label: locale === "ko" ? "근비대" : "hyper" },
    { value: "endurance", label: locale === "ko" ? "지구력" : "endur" },
    { value: "general", label: locale === "ko" ? "일반" : "general" },
  ];

  // 부(secondary) 훈련 목적 — paper와 동일 mutation/헬퍼 재사용. primary와 상호배타.
  const goalSecondary = useSettingRowMutation<string>({
    key: SETTINGS_KEYS.trainingGoalSecondaryJson,
    fallbackValue: "[]",
    serverValue: serializeTrainingGoalSecondary(
      parseTrainingGoalSecondary(
        snapshot?.[SETTINGS_KEYS.trainingGoalSecondaryJson],
        normalizeTrainingGoal(snapshot?.[SETTINGS_KEYS.trainingGoalPrimary]),
      ),
    ),
    persistServer: createPersistServerSetting<string>(),
    successMessage:
      locale === "ko" ? "부 운동 목적을 저장했습니다." : "Saved secondary goals.",
    rollbackNotice:
      locale === "ko"
        ? "부 운동 목적 저장에 실패했습니다."
        : "Failed to save secondary goals.",
  });
  const selectedSecondary = parseTrainingGoalSecondary(
    goalSecondary.value,
    selectedGoal,
  );
  const goalPending = goal.pending || goalSecondary.pending;

  // primary 변경: paper와 동일 — secondary에 같은 키가 있으면 제거(상호배타).
  const selectPrimaryGoal = (next: TrainingGoalKey) => {
    void goal.commit(next);
    if (selectedSecondary.includes(next)) {
      void goalSecondary.commit(
        serializeTrainingGoalSecondary(
          selectedSecondary.filter((g) => g !== next),
        ),
      );
    }
  };
  const toggleSecondaryGoal = (key: TrainingGoalKey) => {
    if (key === selectedGoal) return;
    const set = new Set(selectedSecondary);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    void goalSecondary.commit(
      serializeTrainingGoalSecondary(Array.from(set)),
    );
  };

  const canChangePassword = Boolean(me && !me.fallback && me.email);
  const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

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
                  background: "transparent",
                  border: "none",
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
            ? "terminal은 다크 고정 · 화면모드는 paper에서"
            : "terminal = dark-fixed · appearance in paper"}
        </div>
      </div>

      {/* 환경설정: 언어 + 체중 (인라인) */}
      <div style={PANEL}>
        <div
          className="v2-mono-label"
          style={{ color: "var(--term-dim)", marginBottom: "var(--v2-s-1)" }}
        >
          {locale === "ko" ? "언어" : "lang"}
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--v2-s-1)",
            flexWrap: "wrap",
            marginBottom: "var(--v2-s-3)",
          }}
        >
          {langOptions.map((o) => {
            const active = o.value === selectedLang;
            return (
              <button
                key={o.value}
                type="button"
                disabled={lang.pending}
                onClick={() => void selectLang(o.value)}
                className="v2-mono-label"
                style={toggleBtnStyle(active, lang.pending)}
              >
                [{o.label}
                {active ? "*" : ""}]
              </button>
            );
          })}
        </div>
        <div
          className="v2-mono-label"
          style={{ color: "var(--term-dim)", marginBottom: "var(--v2-s-1)" }}
        >
          {locale === "ko" ? "체중 (kg)" : "bodyweight (kg)"}
        </div>
        <div style={{ display: "flex", gap: "var(--v2-s-1)", alignItems: "center" }}>
          <input
            type="text"
            inputMode="decimal"
            value={bwDraft}
            onChange={(e) => setBwDraft(e.target.value)}
            aria-label={locale === "ko" ? "체중 (kg)" : "Bodyweight (kg)"}
            className="v2-font-num"
            style={{
              width: "var(--v2-s-9)",
              minHeight: "var(--v2-touch)",
              padding: "0 var(--v2-s-2)",
              background: "var(--term-inset)",
              border: "none",
              outline: "none",
              color: "var(--term-cyan)",
              textAlign: "center",
            }}
          />
          <button
            type="button"
            disabled={!bwCanSave}
            onClick={() => void bw.commit(normBodyweight(bwParsed))}
            className="v2-mono-label"
            style={{
              minHeight: "var(--v2-touch)",
              padding: "0 var(--v2-s-2)",
              background: "transparent",
              border: "none",
              color: bwCanSave ? "var(--term-cyan)" : "var(--term-ghost)",
              cursor: bwCanSave ? "pointer" : "not-allowed",
            }}
          >
            [{bw.pending ? (locale === "ko" ? "저장중" : "saving") : "save"}]
          </button>
        </div>
        {/* 훈련 목적 (primary) */}
        <div
          className="v2-mono-label"
          style={{
            color: "var(--term-dim)",
            margin: "var(--v2-s-3) 0 var(--v2-s-1)",
          }}
        >
          {locale === "ko" ? "운동 목적 (주)" : "goal (primary)"}
        </div>
        <div style={{ display: "flex", gap: "var(--v2-s-1)", flexWrap: "wrap" }}>
          {goalOptions.map((o) => {
            const active = o.value === selectedGoal;
            return (
              <button
                key={o.value}
                type="button"
                disabled={goalPending}
                onClick={() => selectPrimaryGoal(o.value)}
                className="v2-mono-label"
                style={toggleBtnStyle(active, goalPending)}
              >
                [{o.label}
                {active ? "*" : ""}]
              </button>
            );
          })}
        </div>
        {/* 훈련 목적 (secondary) — primary 제외, 다중 선택 토글 */}
        <div
          className="v2-mono-label"
          style={{
            color: "var(--term-dim)",
            margin: "var(--v2-s-3) 0 var(--v2-s-1)",
          }}
        >
          {locale === "ko" ? "운동 목적 (부)" : "goal (secondary)"}
        </div>
        <div style={{ display: "flex", gap: "var(--v2-s-1)", flexWrap: "wrap" }}>
          {goalOptions
            .filter((o) => o.value !== selectedGoal)
            .map((o) => {
              const active = selectedSecondary.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={goalPending}
                  onClick={() => toggleSecondaryGoal(o.value)}
                  className="v2-mono-label"
                  style={toggleBtnStyle(active, goalPending)}
                >
                  [{active ? "+" : " "}
                  {o.label}]
                </button>
              );
            })}
        </div>
        <div
          className="v2-mono-label"
          style={{ color: "var(--term-ghost)", marginTop: "var(--v2-s-2)" }}
        >
          {locale === "ko"
            ? "주 목적은 통계 기준 · 부 목적은 함께 추적"
            : "primary drives stats · secondary tracked alongside"}
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

      {/* 계정 액션: 비밀번호 변경 + 로그아웃 */}
      <div style={{ display: "flex", gap: "var(--v2-s-2)", flexWrap: "wrap" }}>
        {canChangePassword ? (
          <button
            type="button"
            onClick={() => setPwOpen(true)}
            className="v2-mono-label"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--v2-s-1)",
              minHeight: "var(--v2-touch)",
              padding: "0 var(--v2-s-2)",
              background: "transparent",
              border: "none",
              color: "var(--term-cyan)",
              cursor: "pointer",
            }}
          >
            <V2Icon name="lock" style={{ fontSize: "1em" }} />
            [{locale === "ko" ? "비밀번호 변경" : "change password"}]
          </button>
        ) : null}
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
      </div>

      {/* 앱 정보 footer — 버전 + 환영 투어 다시 보기(온보딩 재실행) */}
      <div
        className="v2-mono-label"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-1)",
          color: "var(--term-ghost)",
        }}
      >
        <div>
          <span style={{ color: "var(--term-dim)" }}>$ </span>
          workout-log --version {appVersion} · next.js
        </div>
        <a
          href="/onboarding"
          className="v2-mono-label"
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: "var(--v2-touch)",
            textDecoration: "none",
            color: "var(--term-dim)",
          }}
        >
          {locale === "ko" ? "› 환영 투어 다시 보기" : "› replay welcome tour"}
        </a>
      </div>

      <V2PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </section>
  );
}

const PANEL: CSSProperties = {
  padding: "var(--v2-s-3)",
  background: "var(--term-panel)",
  boxShadow: "inset 0 0 0 1px var(--term-line-box)",
  borderRadius: "var(--v2-r-2)",
};
