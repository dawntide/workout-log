"use client";
import { errorMessage } from "@/lib/error-message";

import { useEffect, useRef, useState } from "react";
import { apiGet } from "@/lib/api";
import type { CalendarGeneratedSessionDetail } from "./types";

type UseCalendarSessionDetailInput = {
  locale: "ko" | "en";
  planId: string;
  /** Session to fetch the snapshot for — planned preview or a logged REF5 session. */
  sessionId: string | null;
  setError: (message: string) => void;
};

export function useCalendarSessionDetail({
  locale,
  planId,
  sessionId,
  setError,
}: UseCalendarSessionDetailInput) {
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<CalendarGeneratedSessionDetail | null>(null);
  const sessionDetailCacheRef = useRef<Map<string, CalendarGeneratedSessionDetail | null>>(new Map());

  useEffect(() => {
    if (!sessionId) {
      setSelectedSessionDetail(null);
      return;
    }

    const cacheKey = `${planId}:${sessionId}`;
    const cachedDetail = sessionDetailCacheRef.current.get(cacheKey);
    if (cachedDetail !== undefined) {
      setSelectedSessionDetail(cachedDetail);
      return;
    }

    // A stale detail from the previous selection must not label the new one
    // while the fetch is in flight.
    setSelectedSessionDetail(null);
    let cancelled = false;

    (async () => {
      try {
        const sp = new URLSearchParams();
        sp.set("id", sessionId);
        sp.set("includeSnapshot", "1");
        sp.set("limit", "1");
        if (planId) sp.set("planId", planId);

        const res = await apiGet<{ items: CalendarGeneratedSessionDetail[] }>(
          `/api/generated-sessions?${sp.toString()}`,
        );
        if (cancelled) return;

        const nextDetail = res.items[0] ?? null;
        sessionDetailCacheRef.current.set(cacheKey, nextDetail);
        setSelectedSessionDetail(nextDetail);
      } catch (error) {
        if (cancelled) return;
        setSelectedSessionDetail(null);
        setError(
          errorMessage(error) ??
            (locale === "ko"
              ? "세션 상세를 불러오지 못했습니다."
              : "Could not load session details."),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locale, planId, sessionId, setError]);

  return {
    selectedSessionDetail,
  };
}
