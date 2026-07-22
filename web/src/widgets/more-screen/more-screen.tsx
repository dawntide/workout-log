"use client";

import { useId, useState } from "react";

import { useLocale } from "@/components/locale-provider";
import { V2NavRow, V2SecondaryBtn } from "@/components/v2/primitives";

import { AccountCard } from "./account-card";
import { AppInfoFooter } from "./app-info-footer";
import { BodyweightRow } from "./bodyweight-row";
import { LanguageRow } from "./language-row";
import { PasswordSheet } from "./password-sheet";
import { Section } from "./section";
import { ThemeSettingsRows } from "./theme-settings-rows";
import { TrainingGoalRow } from "./training-goal-row";
import { useMoreScreenData } from "./use-more-screen-data";

/**
 * 더보기(계정 · 설정) 화면 조립기. 행마다 자기 설정 키의 낙관적 커밋을 들고 있고,
 * 여기서는 섹션 배치와 "한 번에 한 행만 펼침" 규칙만 관리한다.
 */
export function MoreScreen() {
  const { locale } = useLocale();
  const headingId = useId();
  const { me, snapshot } = useMoreScreenData();
  const [pwOpen, setPwOpen] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

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

      {me && <AccountCard me={me} onChangePassword={() => setPwOpen(true)} />}

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
        <ThemeSettingsRows
          snapshot={snapshot}
          expandedRow={expandedRow}
          onExpandedRowChange={setExpandedRow}
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

      <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
