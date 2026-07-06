"use client";
import { errorMessage } from "@/lib/error-message";

import { useEffect, useRef, useState } from "react";
import { apiGet } from "@/lib/api";
import type { CalendarGeneratedSessionDetail } from "./types";

type UseCalendarSessionDetailInput = {
  locale: "ko" | "en";
  planId: string;
  selectedSessionId: string | null;
  currentSelectedLogId: string | null;
  setError: (message: string) => void;
};

export function useCalendarSessionDetail({
  locale,
  planId,
  selectedSessionId,
  currentSelectedLogId,
  setError,
}: UseCalendarSessionDetailInput) {
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<CalendarGeneratedSessionDetail | null>(null);
  const sessionDetailCacheRef = useRef<Map<string, CalendarGeneratedSessionDetail | null>>(new Map());

  useEffect(() => {
    if (!selectedSessionId || currentSelectedLogId) {
      setSelectedSessionDetail(null);
      return;
    }

    const cacheKey = `${planId}:${selectedSessionId}`;
    const cachedDetail = sessionDetailCacheRef.current.get(cacheKey);
    if (cachedDetail !== undefined) {
      setSelectedSessionDetail(cachedDetail);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const sp = new URLSearchParams();
        sp.set("id", selectedSessionId);
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
  }, [currentSelectedLogId, locale, planId, selectedSessionId, setError]);

  return {
    selectedSessionDetail,
  };
}
