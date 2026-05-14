"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { V2Card, V2Chip, V2Hairline, V2IconBtn } from "@/components/v2/primitives";
import { AppPage } from "@/components/ui/page-layout";
import { useLocale } from "@/components/locale-provider";
import { APP_ROUTES } from "@/lib/app-routes";
import type {
  PrHistoryBootstrap,
  PrHistoryDaysPreset,
} from "@/server/services/stats/get-pr-history-bootstrap";

type PrHistoryScreenProps = PrHistoryBootstrap;

const DAYS_PRESETS: PrHistoryDaysPreset[] = [30, 90, 365, "all"];

function formatYearMonthDay(value: string, locale: "ko" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function presetLabel(preset: PrHistoryDaysPreset, locale: "ko" | "en") {
  if (preset === "all") return locale === "ko" ? "전체" : "All";
  if (preset === 30) return locale === "ko" ? "30일" : "30d";
  if (preset === 90) return locale === "ko" ? "90일" : "90d";
  return locale === "ko" ? "1년" : "1y";
}

function buildHref(
  baseHref: string,
  selected: PrHistoryScreenProps["selected"],
  overrides: { exerciseId?: string | null; days?: PrHistoryDaysPreset },
) {
  const params = new URLSearchParams();
  const nextExerciseId =
    overrides.exerciseId !== undefined ? overrides.exerciseId : selected.exerciseId;
  const nextDays = overrides.days !== undefined ? overrides.days : selected.days;
  if (nextExerciseId) params.set("exerciseId", nextExerciseId);
  if (nextDays && nextDays !== 90) {
    params.set("days", String(nextDays));
  }
  const query = params.toString();
  return query ? `${baseHref}?${query}` : baseHref;
}

export function PrHistoryScreen({
  exercises,
  selected,
  prs,
  rangeFrom,
  rangeTo,
}: PrHistoryScreenProps) {
  const { locale } = useLocale();
  const router = useRouter();

  return (
    <AppPage>
      <div
        style={{
          display: "grid",
          gap: "var(--v2-s-5)",
          paddingBottom: "var(--v2-s-8)",
        }}
      >
        <header
          style={{
            display: "grid",
            gap: "var(--v2-s-4)",
            paddingTop: "var(--v2-s-2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <V2IconBtn
              icon="arrow_back"
              onClick={() => router.back()}
              label={locale === "ko" ? "뒤로" : "Back"}
              size={36}
            />
            <p className="v2-label">
              {locale === "ko" ? "퍼포먼스" : "Performance"}
            </p>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <h1
              className="v2-h1"
              style={{ letterSpacing: 0, fontSize: 28 }}
            >
              {locale === "ko" ? "PR 이력" : "PR History"}
            </h1>
            <p
              className="v2-body"
              style={{ maxWidth: 560, color: "var(--v2-ink-2)" }}
            >
              {locale === "ko"
                ? "선택한 운동과 기간 동안 갱신된 e1RM 최고 기록을 모아 봅니다."
                : "Browse e1RM personal records by exercise and time range."}
            </p>
            <p
              className="v2-small"
              style={{ color: "var(--v2-ink-3)", fontVariantNumeric: "tabular-nums" }}
            >
              {formatYearMonthDay(rangeFrom, locale)} ~ {formatYearMonthDay(rangeTo, locale)}
            </p>
          </div>
        </header>

        <section style={{ display: "grid", gap: "var(--v2-s-3)" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <p className="v2-label">{locale === "ko" ? "기간" : "Range"}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DAYS_PRESETS.map((preset) => {
                const active = selected.days === preset;
                return (
                  <Link
                    key={String(preset)}
                    href={buildHref(APP_ROUTES.prHistory, selected, { days: preset })}
                    style={{ textDecoration: "none" }}
                    aria-current={active ? "true" : undefined}
                  >
                    <span
                      className="v2-font-display"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "8px 14px",
                        borderRadius: "var(--v2-r-pill)",
                        fontWeight: 700,
                        fontSize: 12,
                        letterSpacing: "0.04em",
                        background: active
                          ? "var(--v2-accent)"
                          : "var(--v2-paper-2)",
                        color: active
                          ? "var(--v2-ink-on-accent)"
                          : "var(--v2-ink-2)",
                      }}
                    >
                      {presetLabel(preset, locale)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <p className="v2-label v2-font-display">
              {locale === "ko" ? "운동" : "Exercise"}
            </p>
            <div
              style={{
                display: "flex",
                gap: 8,
                overflowX: "auto",
                paddingBottom: 4,
                WebkitOverflowScrolling: "touch",
              }}
            >
              <Link
                href={buildHref(APP_ROUTES.prHistory, selected, { exerciseId: null })}
                style={{ textDecoration: "none", flexShrink: 0 }}
                aria-current={selected.exerciseId === null ? "true" : undefined}
              >
                <span
                  style={{
                    display: "inline-flex",
                    padding: "8px 14px",
                    borderRadius: "var(--v2-r-pill)",
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: "0.04em",
                    background:
                      selected.exerciseId === null
                        ? "var(--v2-accent)"
                        : "var(--v2-paper-2)",
                    color:
                      selected.exerciseId === null
                        ? "var(--v2-ink-on-accent)"
                        : "var(--v2-ink-2)",
                  }}
                >
                  {locale === "ko" ? "모든 운동" : "All exercises"}
                </span>
              </Link>
              {exercises.map((ex) => {
                const active = selected.exerciseId === ex.id;
                return (
                  <Link
                    key={ex.id}
                    href={buildHref(APP_ROUTES.prHistory, selected, {
                      exerciseId: ex.id,
                    })}
                    style={{ textDecoration: "none", flexShrink: 0 }}
                    aria-current={active ? "true" : undefined}
                  >
                    <span
                      className="v2-font-display"
                      style={{
                        display: "inline-flex",
                        padding: "8px 14px",
                        borderRadius: "var(--v2-r-pill)",
                        fontWeight: 700,
                        fontSize: 12,
                        letterSpacing: "0.04em",
                        background: active
                          ? "var(--v2-accent)"
                          : "var(--v2-paper-2)",
                        color: active
                          ? "var(--v2-ink-on-accent)"
                          : "var(--v2-ink-2)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ex.name}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <V2Hairline />

        <section style={{ display: "grid", gap: "var(--v2-s-3)" }}>
          {prs.length === 0 ? (
            <V2Card
              tone="inset"
              padding="20px"
              radius="var(--v2-r-1)"
            >
              <p className="v2-h3" style={{ fontSize: 16 }}>
                {locale === "ko" ? "표시할 PR이 없습니다" : "No PRs to show"}
              </p>
              <p className="v2-small" style={{ marginTop: 6 }}>
                {locale === "ko"
                  ? "다른 기간이나 운동을 선택하거나, 운동 기록을 추가한 뒤 다시 확인하세요."
                  : "Try a different range or exercise, or log more workouts and check back."}
              </p>
            </V2Card>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {prs.map((row) => {
                const improvement = row.improvement;
                const tone = improvement > 0 ? "success" : "neutral";
                const card = (
                  <V2Card
                    tone="paper"
                    padding="14px 16px"
                    radius="var(--v2-r-1)"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto auto",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div className="v2-font-display" style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: 15,
                          color: "var(--v2-ink)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.exerciseName}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "4px 10px",
                          marginTop: 4,
                          fontSize: 12,
                          color: "var(--v2-ink-2)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        <span>
                          {locale === "ko" ? "최고" : "Best"}{" "}
                          <strong style={{ color: "var(--v2-ink)" }}>
                            {row.best.e1rm.toFixed(1)}kg
                          </strong>
                        </span>
                        <span>
                          {row.best.weightKg}kg × {row.best.reps}
                          {locale === "ko" ? "회" : " reps"}
                        </span>
                        <span>{formatYearMonthDay(row.best.date, locale)}</span>
                      </div>
                    </div>
                    <V2Chip tone={tone}>
                      {improvement > 0
                        ? `+${improvement.toFixed(1)}`
                        : improvement.toFixed(1)}
                    </V2Chip>
                    <span
                      className="material-symbols-outlined"
                      style={{ color: "var(--v2-ink-3)", fontSize: 18 }}
                      aria-hidden="true"
                    >
                      chevron_right
                    </span>
                  </V2Card>
                );

                if (!row.exerciseId) {
                  return (
                    <div
                      key={row.exerciseName}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      {card}
                    </div>
                  );
                }
                return (
                  <Link
                    key={row.exerciseId}
                    href={APP_ROUTES.exerciseDetail(row.exerciseId)}
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    {card}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppPage>
  );
}
