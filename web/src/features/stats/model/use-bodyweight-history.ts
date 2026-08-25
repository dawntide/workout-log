"use client";

import { useCallback, useEffect, useState } from "react";

import { apiGet, apiPost } from "@/lib/api";

export type BodyweightEntry = {
  id: string;
  valueKg: number;
  measuredAt: string;
};

const HISTORY_PATH = "/api/bodyweight?days=365&limit=365";

/**
 * 체중 기록 이력 + 기록 액션.
 *
 * 기록은 `apiPost`로 나가고, 그 기본 동작이 API 캐시를 비운다 — 방금 적은 값이
 * 차트에 안 나타나는 일을 막는다(캐시 무효화 공백은 이 리포에서 실제로 겪은 함정).
 */
export function useBodyweightHistory({ enabled = true }: { enabled?: boolean } = {}) {
  const [entries, setEntries] = useState<BodyweightEntry[] | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiGet<{ items: BodyweightEntry[] }>(HISTORY_PATH);
      setEntries(Array.isArray(response.items) ? response.items : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  const record = useCallback(
    async (valueKg: number, measuredAt?: Date) => {
      await apiPost("/api/bodyweight", {
        valueKg,
        measuredAt: measuredAt ? measuredAt.toISOString() : undefined,
      });
      await load();
    },
    [load],
  );

  return { entries, loading, error, record, reload: load };
}
