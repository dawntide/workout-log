import { useLocale } from "@/components/locale-provider";
import { V2Card, V2IconBtn } from "@/components/v2/primitives";

import type { MeUser } from "./use-more-screen-data";

/** 아바타 + 이름/이메일 + 비밀번호 변경 진입. env fallback 계정은 변경 버튼을 숨긴다. */
export function AccountCard({
  me,
  onChangePassword,
}: {
  me: NonNullable<MeUser>;
  onChangePassword: () => void;
}) {
  const { locale } = useLocale();

  return (
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
            onClick={onChangePassword}
          />
        )}
      </V2Card>
    </div>
  );
}
