"use client";

import { V2Card, V2Stack } from "@/components/v2/primitives";
import type { JudgmentHistoryEntry } from "@workout/core/progression/event-history";

type Locale = "ko" | "en";

function formatWhen(iso: string, locale: Locale) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * 누적 판정 이력.
 *
 * 판정 카드는 다음 세션을 시작하면 사라진다(의도된 수명). 그래서 "지난 두 달 동안
 * 스쿼트가 몇 번 리셋됐나"를 답할 자리가 없었고, 누적 목록은 REF5 엔진 상태에만
 * 있었다. 이 섹션이 그 갭을 전 프로그램으로 넓힌다.
 *
 * **문구를 여기서 만들지 않는다** — 서버가 카드와 같은 조립기(feedback-catalog)로
 * 만든 행을 그대로 렌더한다. 클라이언트가 문구를 복제하면 카드와 이력이 같은 판정을
 * 다르게 말하게 된다.
 */
export function JudgmentHistorySection({
  entries,
  locale,
  loading,
}: {
  entries: JudgmentHistoryEntry[];
  locale: Locale;
  loading: boolean;
}) {
  const ko = locale === "ko";

  return (
    <V2Stack gap={2}>
      <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
        {ko ? "판정 이력" : "Judgment history"}
      </span>
      <V2Card>
        {loading ? (
          <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-3)" }}>
            {ko ? "불러오는 중…" : "Loading…"}
          </p>
        ) : entries.length === 0 ? (
          <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-3)" }}>
            {ko
              ? "아직 판정 기록이 없습니다. 세션을 저장하면 무게 변경 판정이 여기 쌓입니다."
              : "No judgments yet. Weight-change decisions appear here as you save sessions."}
          </p>
        ) : (
          <V2Stack gap={3}>
            {entries.map((entry) => (
              <V2Stack key={entry.eventId} gap={1}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: "var(--v2-s-2)",
                  }}
                >
                  <span className="v2-small" style={{ color: "var(--v2-ink-2)", fontWeight: 700 }}>
                    {entry.title}
                  </span>
                  <span
                    className="v2-font-num"
                    style={{ fontSize: "var(--v2-t-12)", color: "var(--v2-ink-3)" }}
                  >
                    {formatWhen(entry.createdAt, locale)}
                  </span>
                </div>
                {entry.rows.map((row) => (
                  <p
                    key={`${entry.eventId}-${row.target}`}
                    className="v2-small"
                    style={{ margin: 0, color: "var(--v2-ink)" }}
                  >
                    {row.text}
                  </p>
                ))}
              </V2Stack>
            ))}
          </V2Stack>
        )}
      </V2Card>
    </V2Stack>
  );
}
