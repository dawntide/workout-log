import Link from "next/link";
import { V2PrimaryBtn } from "@/components/v2/primitives";
import { resolveRequestLocale } from "@/lib/i18n/messages";
import { APP_ROUTES } from "@/lib/app-routes";

type NavItem = {
  href: string;
  label: string;
  subtitle: string;
  description: string;
  iconSymbol: string;
};

function NavRow({ item }: { item: NavItem }) {
  return (
    <Link
      href={item.href}
      className="v2-page-row v2-pressable"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--v2-s-3)",
        padding: "var(--v2-s-3) var(--v2-s-4)",
        borderRadius: "var(--v2-r-3)",
        background: "var(--v2-paper-2)",
        textDecoration: "none",
        minHeight: 64,
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: 22,
          color: "var(--v2-accent)",
          flexShrink: 0,
          fontVariationSettings: "'FILL' 0, 'wght' 500",
        }}
        aria-hidden="true"
      >
        {item.iconSymbol}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="v2-mono-label" style={{ color: "var(--v2-accent)" }}>
          {item.subtitle}
        </div>
        <div className="v2-h3" style={{ fontSize: 15, marginTop: 2 }}>
          {item.label}
        </div>
        <div
          className="v2-small"
          style={{ color: "var(--v2-ink-3)", marginTop: 2 }}
        >
          {item.description}
        </div>
      </div>

      <span
        className="material-symbols-outlined"
        style={{
          fontSize: 18,
          color: "var(--v2-ink-3)",
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        chevron_right
      </span>
    </Link>
  );
}

export default async function WorkoutLogOverridesPage() {
  const locale = await resolveRequestLocale();
  const overrideItems: NavItem[] = [
    {
      href: APP_ROUTES.todayLog,
      label: locale === "ko" ? "보조 운동 고정" : "Pin Accessory Choices",
      subtitle: "Accessory Fix",
      description:
        locale === "ko"
          ? "보조 운동 선택을 기본값으로 저장합니다. 오늘 기록 화면에서 적용됩니다."
          : "Save accessory selections as defaults and apply them in today's workout log.",
      iconSymbol: "push_pin",
    },
    {
      href: APP_ROUTES.todayLog,
      label: locale === "ko" ? "운동 교체" : "Swap Exercise",
      subtitle: "Exercise Swap",
      description:
        locale === "ko"
          ? "세션 대상 운동을 다른 운동으로 바꿉니다. 오늘 기록 화면에서 적용됩니다."
          : "Replace a session exercise with a different movement in today's workout flow.",
      iconSymbol: "swap_horiz",
    },
  ];

  return (
    <div style={{ padding: "16px 16px 32px" }}>
      <div style={{ padding: "0 8px 16px" }}>
        <p className="v2-eyebrow">
          {locale === "ko" ? "세션 조정" : "SESSION ADJUSTMENTS"}
        </p>
        <h1 className="v2-h1" style={{ marginTop: 6 }}>
          {locale === "ko" ? "세션 오버라이드" : "Session Overrides"}
        </h1>
        <p
          className="v2-small"
          style={{ color: "var(--v2-ink-3)", marginTop: 8 }}
        >
          {locale === "ko"
            ? "오버라이드는 별도 화면이 아니라, 오늘 기록 흐름 중에 잠시 끼어드는 보조 도구예요."
            : "Overrides are support tools used during today's workout flow, not a separate start screen."}
        </p>
        <div style={{ marginTop: "var(--v2-s-4)" }}>
          <V2PrimaryBtn
            as="a"
            href={APP_ROUTES.todayLog}
            icon="arrow_back"
            style={{
              minHeight: 44,
              padding: "10px 18px",
              borderRadius: "var(--v2-r-pill)",
              fontSize: 13,
            }}
          >
            {locale === "ko" ? "오늘 기록으로 돌아가기" : "Back to Today's Log"}
          </V2PrimaryBtn>
        </div>
      </div>

      <div style={{ padding: "8px 8px 8px" }}>
        <div className="v2-label">
          {locale === "ko" ? "오버라이드 동작" : "Override Actions"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {overrideItems.map((item) => (
          <NavRow key={`${item.href}-${item.iconSymbol}`} item={item} />
        ))}
      </div>
    </div>
  );
}
