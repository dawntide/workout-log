"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet, isAbortError } from "@/lib/api";
import { useLocale } from "@/components/locale-provider";
import type { StatsPageBootstrap } from "@/server/services/stats/get-stats-page-bootstrap";
import { StatsScreen } from "./stats-screen";
import {
  buildStatsBootstrapPath,
  STATS_BOOTSTRAP_REQUEST_OPTIONS,
} from "./stats-bootstrap-request";

export function StatsContainer() {
  const { locale } = useLocale();
  const searchParams = useSearchParams();
  const [bootstrap, setBootstrap] = useState<StatsPageBootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 신선도 회복 시간처럼 **서버가 다시 계산해야 하는** 설정이 바뀌면 이 값을 올려
  // 부트스트랩을 다시 받는다. 클라이언트 재계산으로는 감쇠 창 밖으로 밀려난 세션을
  // 되살릴 수 없어(응답에 없다) 창을 늘리는 방향이 틀어진다.
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const path = buildStatsBootstrapPath(
      new URLSearchParams(searchParams?.toString() ?? ""),
    );
    setError(null);
    apiGet<StatsPageBootstrap>(path, {
      ...STATS_BOOTSTRAP_REQUEST_OPTIONS,
      signal: controller.signal,
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
  }, [locale, reloadToken, searchParams]);

  if (error) {
    return (
      <div style={{ padding: "var(--v2-s-6)" }}>
        <p className="v2-small" style={{ color: "var(--v2-c-danger)" }}>
          {error}
        </p>
      </div>
    );
  }

  if (!bootstrap) {
    return (
      <div style={{ padding: "var(--v2-s-6)" }}>
        <p className="v2-small" style={{ color: "var(--v2-ink-2)" }}>
          {locale === "ko" ? "통계 데이터를 불러오는 중…" : "Loading stats…"}
        </p>
      </div>
    );
  }

  return <StatsScreen {...bootstrap} onDataChanged={reload} />;
}
