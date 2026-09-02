import type { Ref5Status } from "@workout/core/program-engine/ref5-status";
import { V2Card } from "@/components/v2/primitives";
import {
  buildRef5OapProgressRows,
  buildRef5WindowProgressRows,
  getRef5OapProgressDescription,
  getRef5WindowProgressDescription,
} from "@/features/ref5/model/window-progress";

type Props = {
  status: Ref5Status | null;
  locale: "ko" | "en";
  loading?: boolean;
};

export function Ref5WindowProgressPanel({
  status,
  locale,
  loading = false,
}: Props) {
  const title = locale === "ko" ? "기본 판정창" : "Base judgment windows";
  const description = getRef5WindowProgressDescription(locale);
  const oapTitle = locale === "ko" ? "OAP 스킬 슬롯" : "OAP skill slot";
  const oapDescription = getRef5OapProgressDescription(locale);

  if (!status) {
    return (
      <V2Card
        tone="inset"
        padding="var(--v2-s-3)"
        radius="var(--v2-r-3)"
      >
        <div className="v2-mono-label" style={{ color: "var(--v2-ink-3)" }}>
          {loading
            ? locale === "ko" ? "기본 판정창을 불러오는 중..." : "Loading judgment windows..."
            : locale === "ko" ? "기본 판정창을 불러오지 못했습니다." : "Judgment windows are unavailable."}
        </div>
      </V2Card>
    );
  }

  const rows = buildRef5WindowProgressRows(status, locale);

  return (
    <V2Card
      tone="inset"
      padding="var(--v2-s-4)"
      radius="var(--v2-r-3)"
    >
      <section aria-label={title}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: "var(--v2-s-2)",
          }}
        >
          <strong
            className="v2-label"
            style={{ color: "var(--v2-ink)" }}
          >
            {title}
          </strong>
          <span
            className="v2-mono-label"
            style={{ color: "var(--v2-ink-3)" }}
          >
            REF5
          </span>
        </div>

        <p
          className="v2-small"
          style={{
            margin: "var(--v2-s-1) 0 0",
            color: "var(--v2-ink-2)",
          }}
        >
          {description}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))",
            gap: "var(--v2-s-2)",
            marginTop: "var(--v2-s-3)",
          }}
        >
          {rows.map((row) => (
            <div
              key={row.key}
              role="progressbar"
              aria-label={`${row.label} ${row.current}/${row.threshold}`}
              aria-valuemin={0}
              aria-valuemax={row.threshold}
              aria-valuenow={row.current}
              style={{
                minWidth: 0,
                padding: "var(--v2-s-2)",
                background: "var(--v2-paper)",
                borderRadius: "var(--v2-r-2)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: "var(--v2-s-1)",
                }}
              >
                <span
                  className="v2-mono-label"
                  style={{
                    color: "var(--v2-ink)",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.label}
                </span>
                <span
                  className="v2-mono-label"
                  style={{
                    color: "var(--v2-c-progress)",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.current}/{row.threshold}
                </span>
              </div>
              <div
                aria-hidden
                style={{
                  height: 4,
                  marginTop: "var(--v2-s-2)",
                  overflow: "hidden",
                  borderRadius: "var(--v2-r-pill)",
                  background: "var(--v2-paper-3)",
                }}
              >
                <div
                  style={{
                    width: `${row.ratio * 100}%`,
                    height: "100%",
                    background: "var(--v2-c-progress)",
                    transition: "width 180ms ease",
                  }}
                />
              </div>
              <div
                className="v2-mono-label"
                style={{
                  marginTop: "var(--v2-s-1)",
                  color: "var(--v2-ink-3)",
                  fontSize: "var(--v2-t-12)",
                }}
              >
                {locale === "ko" ? `판정 완료 ${row.completed}회` : `${row.completed} judged`}
              </div>
              {row.gainRatePercent !== null && (
                <div
                  className="v2-mono-label"
                  style={{
                    marginTop: 2,
                    color: "var(--v2-ink-2)",
                    fontSize: "var(--v2-t-12)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {locale === "ko" ? "획득률" : "gain"} {row.gainRatePercent}%
                  {row.flow ? (
                    <span style={{ marginLeft: "var(--v2-s-1)", color: "var(--v2-c-progress)" }}>
                      {row.flow}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 사다리는 kg 진행이 아니므로 판정창 표와 섞지 않고 별도 블록으로 둔다(§7.5). */}
        <div style={{ marginTop: "var(--v2-s-4)" }}>
          <strong className="v2-label" style={{ color: "var(--v2-ink)" }}>
            {oapTitle}
          </strong>
          <p
            className="v2-small"
            style={{ margin: "var(--v2-s-1) 0 0", color: "var(--v2-ink-2)" }}
          >
            {oapDescription}
          </p>
          <div
            style={{
              display: "grid",
              gap: "var(--v2-s-2)",
              marginTop: "var(--v2-s-2)",
            }}
          >
            {buildRef5OapProgressRows(status, locale).map((row) => (
              <div
                key={row.key}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: "var(--v2-s-1) var(--v2-s-2)",
                }}
              >
                <span
                  className="v2-mono-label"
                  style={{ color: "var(--v2-ink)", fontWeight: 700, whiteSpace: "nowrap" }}
                >
                  {row.label}
                </span>
                <span
                  className="v2-mono-label"
                  style={{ color: "var(--v2-c-progress)", whiteSpace: "nowrap" }}
                >
                  {row.rungText}
                </span>
                <span
                  className="v2-mono-label"
                  style={{
                    color: "var(--v2-ink-3)",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.streakText}
                  {row.badges.length > 0 ? ` · ${row.badges.join(" · ")}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </V2Card>
  );
}
