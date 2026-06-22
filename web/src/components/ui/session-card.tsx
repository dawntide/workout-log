"use client";

import Link from "next/link";
import { memo } from "react";
import type { ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";
import { V2Card, V2Chip, V2Hairline, V2PrimaryBtn } from "@/components/v2/primitives";
import { V2Icon } from "@/components/v2/primitives/v2-icon";

export type SessionCardExercise = {
  name: string;
  /** Present → grouped layout (MAIN / ASSIST). Absent → flat layout. */
  role?: "MAIN" | "ASSIST" | string;
  /** Display string e.g. "3x5 @ 110kg" */
  summary: string;
  weightDelta?: number | null;
};

function formatVolume(kg: number): string {
  if (kg >= 1000) {
    const t = kg / 1000;
    return t % 1 === 0 ? `${t}t` : `${t.toFixed(1)}t`;
  }
  return `${kg}kg`;
}

// ─── Shared exercise list sub-components ──────────────────────────────────────

const ExerciseGroupedList = memo(function ExerciseGroupedList({ exercises }: { exercises: SessionCardExercise[] }) {
  const { locale } = useLocale();
  if (exercises.length === 0) return null;
  const main = exercises.filter((e) => e.role === "MAIN");
  const assist = exercises.filter((e) => e.role !== "MAIN");
  return (
    <div>
      {main.length > 0 && (
        <div>
          {main.map((ex) => (
            <div key={ex.name} style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--v2-s-1)" }}>
              <span className="v2-body" style={{ color: "var(--v2-ink)", fontWeight: 700 }}>{ex.name}</span>
              <span className="v2-small" style={{ color: "var(--v2-ink-3)", fontVariantNumeric: "tabular-nums" }}>{ex.summary}</span>
            </div>
          ))}
        </div>
      )}
      {assist.length > 0 && (
        <>
          <V2Hairline style={{ marginTop: "var(--v2-s-2)", marginBottom: "var(--v2-s-2)" }} />
          <div>
          {assist.slice(0, 3).map((ex) => (
            <div key={ex.name} style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--v2-s-1)" }}>
              <span className="v2-small" style={{ color: "var(--v2-ink-2)" }}>{ex.name}</span>
              <span className="v2-small" style={{ color: "var(--v2-ink-3)", fontVariantNumeric: "tabular-nums" }}>{ex.summary}</span>
            </div>
          ))}
          {assist.length > 3 && (
            <div className="v2-small" style={{ color: "var(--v2-ink-3)", textAlign: "right", marginTop: "var(--v2-s-1)" }}>
              {locale === "ko" ? `+보조 ${assist.length - 3}개 더` : `+${assist.length - 3} more assist`}
            </div>
          )}
          </div>
        </>
      )}
    </div>
  );
});

const ExerciseFlatList = memo(function ExerciseFlatList({ exercises }: { exercises: SessionCardExercise[] }) {
  if (exercises.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
      {exercises.map((ex) => (
        <div key={ex.name} style={{ display: "flex", justifyContent: "space-between" }}>
          <span className="v2-body" style={{ color: "var(--v2-ink)", fontWeight: 700 }}>{ex.name}</span>
          <span className="v2-small" style={{ color: "var(--v2-ink-3)", fontVariantNumeric: "tabular-nums" }}>
            {ex.weightDelta != null && ex.weightDelta !== 0 && (
              <span className={`metric-trend ${ex.weightDelta > 0 ? "metric-trend--up" : "metric-trend--down"}`} style={{ marginRight: "var(--v2-s-1)" }}>
                {ex.weightDelta > 0 ? "+" : ""}{ex.weightDelta}kg
              </span>
            )}
            <span>{ex.summary}</span>
          </span>
        </div>
      ))}
    </div>
  );
});

// ─── "today" variant ───────────────────────────────────────────────────────────
// Used for: home 오늘의 운동 카드, 캘린더 하단 상세카드

export type TodaySessionCardProps = {
  variant: "today";
  /** If set, the whole card is a <Link>; CTA renders as a non-interactive <div>. */
  href?: string;
  className?: string;
  title: string;
  badge?: string | null;
  meta?: string | null;
  exercises?: SessionCardExercise[];
  ctaLabel?: string;
  /** Required when href is unset so CTA becomes a real <a>. */
  ctaHref?: string;
  /** Shown instead of CTA button when action is blocked. */
  ctaNote?: string | null;
  children?: ReactNode;
};

function TodayCard({
  href,
  className,
  title,
  badge,
  meta,
  exercises = [],
  ctaLabel,
  ctaHref,
  ctaNote,
  children,
}: Omit<TodaySessionCardProps, "variant">) {
  const hasGrouped = exercises.some((e) => e.role != null);

  const inner = (
    <>
      <div className="card-header">
        <div>
          <div className="v2-h3 card-title" style={{ color: "var(--text-session-name)" }}>{title}</div>
          {meta && <p className="v2-small" style={{ color: "var(--v2-ink-2)", margin: 0, marginTop: 2 }}>{meta}</p>}
        </div>
        {badge && <V2Chip tone="accent">{badge}</V2Chip>}
      </div>

      {hasGrouped ? (
        <ExerciseGroupedList exercises={exercises} />
      ) : (
        <ExerciseFlatList exercises={exercises} />
      )}

      {children}

      {ctaNote && <p>{ctaNote}</p>}

      {ctaLabel && (
        href ? (
          // Parent <Link> wraps the card; CTA is decorative div styled as primary button.
          <div
            className="v2-font-display"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--v2-s-2)",
              width: "100%",
              minHeight: "var(--v2-s-8)",
              padding: "var(--v2-s-4) var(--v2-s-6)",
              borderRadius: "var(--v2-r-3)",
              background: "var(--v2-accent)",
              color: "var(--v2-ink-on-accent)",
              fontWeight: 700,
              letterSpacing: "-0.01em",
              boxShadow: "var(--v2-elev-2)",
              marginTop: "var(--v2-s-4)",
            }}
          >
            <span>{ctaLabel}</span>
            <V2Icon name="chevron_right" weight={400} style={{ fontSize: "var(--v2-t-20)" }} />
          </div>
        ) : ctaHref ? (
          <V2PrimaryBtn as="a" href={ctaHref} icon="chevron_right" full style={{ marginTop: "var(--v2-s-4)" }}>
            {ctaLabel}
          </V2PrimaryBtn>
        ) : null
      )}
    </>
  );

  if (href)
    return (
      <Link
        href={href}
        className={className}
        style={{ display: "block", textDecoration: "none", color: "inherit" }}
      >
        <V2Card padding="var(--v2-s-4)">{inner}</V2Card>
      </Link>
    );
  return (
    <V2Card padding="var(--v2-s-4)" className={className}>
      {inner}
    </V2Card>
  );
}

// ─── "last" variant ────────────────────────────────────────────────────────────
// Used for: home 지난 세션 카드, /기록 지난 세션 카드

export type LastSessionCardProps = {
  variant: "last";
  href?: string;
  title: string;
  date?: string | null;
  totalSets?: number;
  totalVolume?: number;
  bodyweightKg?: number | null;
  exercises?: SessionCardExercise[];
  emptyMessage?: string;
};

function LastCard({
  href,
  title,
  date,
  totalSets,
  totalVolume,
  bodyweightKg,
  exercises = [],
  emptyMessage,
}: Omit<LastSessionCardProps, "variant">) {
  const { locale } = useLocale();
  const hasData = !!date;
  const resolvedEmptyMessage = emptyMessage ?? (locale === "ko" ? "지난 세션 없음" : "No previous session");

  const inner = hasData ? (
    <>
      <div className="card-header">
        <div>
          <div className="v2-h3 card-title" style={{ color: "var(--v2-ink)" }}>{title}</div>
          <div className="v2-small" style={{ color: "var(--text-session-date)" }}>{date}</div>
        </div>
        <div className="v2-small" style={{ color: "var(--v2-ink-3)", display: "flex", gap: "var(--v2-s-1)", fontVariantNumeric: "tabular-nums" }}>
          {totalSets !== undefined && (
            <span>{locale === "ko" ? `${totalSets}세트` : `${totalSets} sets`}</span>
          )}
          {totalVolume !== undefined && totalVolume > 0 && (
            <>
              <span>·</span>
              <span>{formatVolume(totalVolume)}</span>
            </>
          )}
          {bodyweightKg != null && (
            <>
              <span>·</span>
              <span style={{ color: "var(--v2-ink-2)" }}>{locale === "ko" ? `체중 ${bodyweightKg.toFixed(1)}kg` : `BW ${bodyweightKg.toFixed(1)}kg`}</span>
            </>
          )}
        </div>
      </div>
      <ExerciseFlatList exercises={exercises} />
    </>
  ) : (
    <div>{resolvedEmptyMessage}</div>
  );

  if (href)
    return (
      <Link
        href={href}
        style={{ display: "block", textDecoration: "none", color: "inherit" }}
      >
        <V2Card padding="var(--v2-s-4)">{inner}</V2Card>
      </Link>
    );
  return <V2Card padding="var(--v2-s-4)">{inner}</V2Card>;
}

// ─── Unified export ────────────────────────────────────────────────────────────

export type SessionCardProps = TodaySessionCardProps | LastSessionCardProps;

export function SessionCard(props: SessionCardProps) {
  if (props.variant === "today") {
    const rest = props as Omit<TodaySessionCardProps, "variant">;
    return <TodayCard {...rest} />;
  }
  const rest = props as Omit<LastSessionCardProps, "variant">;
  return <LastCard {...rest} />;
}
