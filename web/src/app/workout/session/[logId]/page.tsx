"use client";
import { errorMessage } from "@/lib/error-message";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { apiGet } from "@/lib/api";
import { ErrorStateRows } from "@/components/ui/settings-state";
import { V2SessionSummary, type V2SummaryLog } from "@/components/v2/v2-session-summary";
import { usePlanProgressionFeedback } from "@/features/workout-log/model/use-plan-progression-feedback";
import { BlockJudgmentCard } from "@/widgets/workout-log-screen/hybrid-feedback-banners";

type LogResponse = {
  item: V2SummaryLog & {
    userId?: string;
    planId?: string | null;
    generatedSessionId?: string | null;
  };
};

export default function WorkoutSessionDetailPage() {
  const { locale } = useLocale();
  const params = useParams<{ logId: string }>();
  const logId = String(params?.logId ?? "");
  const searchParams = useSearchParams();
  const fresh = searchParams?.get("fresh") === "1";

  const [item, setItem] = useState<LogResponse["item"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 저장 직후 착지(fresh=1)에서만 진행 판정 카드를 보여준다 — REF5 창 판정처럼
  // "방금 저장이 만든" 판정이 대상이라, 과거 세션 열람에서 플랜의 최신 판정을
  // 끌어와 보여주면 오해를 만든다. 문구는 서버 조립(feedback-catalog) 그대로.
  const progressionFeedback = usePlanProgressionFeedback({
    planId: fresh ? item?.planId ?? null : null,
    refreshKey: logId,
    locale,
  });

  useEffect(() => {
    if (!logId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await apiGet<LogResponse>(
          `/api/logs/${encodeURIComponent(logId)}`,
        );
        if (!cancelled) setItem(res.item);
      } catch (e) {
        if (!cancelled) {
          setItem(null);
          setError(
            errorMessage(e) ??
              (locale === "ko"
                ? "세션 상세를 불러오지 못했습니다."
                : "Could not load the session details."),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logId, locale]);

  if (loading && !item && !error) {
    return (
      <div style={{ padding: "var(--v2-s-7) var(--v2-s-4)", textAlign: "center" }}>
        <span
          className="v2-mono-label"
          style={{ color: "var(--v2-ink-3)" }}
        >
          {locale === "ko" ? "불러오는 중…" : "Loading…"}
        </span>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      <ErrorStateRows
        message={error}
        onRetry={() => {
          setError(null);
          setLoading(true);
          apiGet<LogResponse>(`/api/logs/${encodeURIComponent(logId)}`)
            .then((res) => setItem(res.item))
            .catch((e: unknown) =>
              setError(
                errorMessage(e) ??
                  (locale === "ko"
                    ? "세션 상세를 다시 불러오지 못했습니다."
                    : "Could not reload the session details."),
              ),
            )
            .finally(() => setLoading(false));
        }}
      />
      {fresh && progressionFeedback.blockReport ? (
        <div style={{ padding: "var(--v2-s-2) var(--v2-s-4) 0" }}>
          <BlockJudgmentCard
            locale={locale}
            title={progressionFeedback.blockReport.title}
            rows={progressionFeedback.blockReport.rows}
            onDismiss={progressionFeedback.dismissBlockReport}
          />
        </div>
      ) : null}
      {item && <V2SessionSummary log={item} freshComplete={fresh} />}
    </div>
  );
}
