"use client";

import { useLocale } from "@/components/locale-provider";
import type { SettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";
import { SavePolicySection } from "./_sections/save-policy-section";
import { SelectionTemplateSection } from "./_sections/selection-template-section";
import { SystemStatsSection } from "./_sections/system-stats-section";
import { UxThresholdsSection } from "./_sections/ux-thresholds-section";

type Plan = {
  id: string;
  name: string;
  type: "SINGLE" | "COMPOSITE" | "MANUAL";
};

type Props = {
  initialSnapshot: SettingsSnapshot;
  initialPlans: Plan[];
};

export function DebugContent({ initialSnapshot, initialPlans }: Props) {
  const { locale } = useLocale();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--v2-s-7)",
      }}
    >
      <header
        style={{
          padding: "var(--v2-s-4) var(--v2-s-4) 0",
        }}
      >
        <p className="v2-eyebrow" style={{ color: "var(--v2-c-warning)" }}>
          {locale === "ko" ? "디버그" : "DEBUG"}
        </p>
        <h1 className="v2-h2" style={{ marginTop: 4 }}>
          {locale === "ko" ? "디버그 도구" : "Debug Tools"}
        </h1>
        <p
          className="v2-small"
          style={{ marginTop: 4, color: "var(--v2-ink-2)" }}
        >
          {locale === "ko"
            ? "운영자/QA 전용 페이지입니다. 통계·임계값·저장 정책·셀렉션 데모를 한 곳에 모았습니다."
            : "Operator / QA only — system stats, thresholds, save-policy, and selection demos in one place."}
        </p>
      </header>

      <DebugBlock
        title={locale === "ko" ? "시스템 통계" : "System Stats"}
      >
        <SystemStatsSection />
      </DebugBlock>

      <DebugBlock
        title={locale === "ko" ? "UX 임계값" : "UX Thresholds"}
      >
        <UxThresholdsSection
          initialSnapshot={initialSnapshot}
          initialPlans={initialPlans}
        />
      </DebugBlock>

      <DebugBlock
        title={locale === "ko" ? "저장 정책" : "Save Policy"}
      >
        <SavePolicySection />
      </DebugBlock>

      <DebugBlock
        title={locale === "ko" ? "선택 템플릿 데모" : "Selection Templates"}
      >
        <SelectionTemplateSection />
      </DebugBlock>
    </div>
  );
}

function DebugBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className="v2-h3"
        style={{
          padding: "0 var(--v2-s-4)",
          marginBottom: "var(--v2-s-3)",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
