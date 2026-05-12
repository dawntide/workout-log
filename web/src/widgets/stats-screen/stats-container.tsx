"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet, isAbortError } from "@/lib/api";
import { useLocale } from "@/components/locale-provider";
import type { StatsPageBootstrap } from "@/server/services/stats/get-stats-page-bootstrap";
import { StatsScreen } from "./stats-screen";

function buildBootstrapPath(searchParams: URLSearchParams): string {
  const allowed = ["exerciseId", "exercise", "exerciseName", "planId", "defer1rmBootstrap"];
  const next = new URLSearchParams();
  for (const key of allowed) {
    const value = searchParams.get(key);
    if (value) next.set(key, value);
  }
  const qs = next.toString();
  return qs ? `/api/stats/page-bootstrap?${qs}` : "/api/stats/page-bootstrap";
}

export function StatsContainer() {
  const { locale } = useLocale();
  const searchParams = useSearchParams();
  const [bootstrap, setBootstrap] = useState<StatsPageBootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const path = buildBootstrapPath(
      new URLSearchParams(searchParams?.toString() ?? ""),
    );
    setError(null);
    apiGet<StatsPageBootstrap>(path, {
      signal: controller.signal,
      maxAgeMs: 60_000,
      staleWhileRevalidateMs: 300_000,
    })
      .then((data) => {
        setBootstrap(data);
      })
      .catch((e) => {
        if (isAbortError(e)) return;
        setError(
          locale === "ko"
            ? "통계 데이터를 불러오지 못했습니다."
            : "Failed to load stats data.",
        );
      });
    return () => controller.abort();
  }, [locale, searchParams]);

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <p className="v2-small" style={{ color: "var(--v2-c-danger)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!bootstrap) {
    return (
      <div style={{ padding: 24 }}>
        <p className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
          {locale === "ko" ? "통계 데이터를 불러오는 중…" : "Loading stats…"}
        </p>
      </div>
    );
  }

  return <StatsScreen {...bootstrap} />;
}
