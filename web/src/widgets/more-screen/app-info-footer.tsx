import { useLocale } from "@/components/locale-provider";

/** 앱 버전 + 온보딩 재생 링크. 옛 /settings/about 화면을 대체한다. */
export function AppInfoFooter() {
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
