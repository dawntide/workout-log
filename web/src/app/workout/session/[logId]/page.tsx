"use client";
import { errorMessage } from "@/lib/error-message";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { apiGet } from "@/lib/api";
import { ErrorStateRows } from "@/components/ui/settings-state";
import { V2SessionSummary, type V2SummaryLog } from "@/components/v2/v2-session-summary";

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

  const [item, setItem] = useState<V2SummaryLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      {item && <V2SessionSummary log={item} freshComplete={fresh} />}
    </div>
  );
}
