// v0.5.1 실패 프로토콜 피드백 훅 — progression-state 1회 fetch로 F1(조기 디로드 배너)·
// F2(진행 판정 카드)·F4(라이트 블록 배지)의 표출 상태를 얻는다. 배너·카드 문구는
// **서버가 조립**(feedback 필드 — core feedback-catalog 단일 진실원)하고, 여기는
// fetch·dismiss 영속화만 담당한다. TUI도 같은 서버 문구를 소비한다.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import {
  isLightBlockActive,
  type FeedbackBanner,
  type ProgressReport,
  type ProgressionStateResponse,
} from "./progression-feedback";

const DISMISS_PREFIX = "wl.blockReport.dismissed.";

type ProgressionLoadState = {
  planId: string;
  data: ProgressionStateResponse | null;
  status: "loading" | "settled";
};

function isReportDismissed(eventId: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(DISMISS_PREFIX + eventId) === "1";
  } catch {
    return true;
  }
}

export function usePlanProgressionFeedback(input: {
  planId: string | null | undefined;
  // 저장 후 최신 이벤트를 다시 읽도록 하는 키(예: 현재 로그 id). 변경 시 refetch.
  refreshKey?: string | null;
  locale: "ko" | "en";
}) {
  const planId = typeof input.planId === "string" ? input.planId : "";
  const [loadState, setLoadState] = useState<ProgressionLoadState>(() => ({
    planId,
    data: null,
    status: planId ? "loading" : "settled",
  }));
  const [dismissTick, setDismissTick] = useState(0);

  useEffect(() => {
    if (!planId) {
      setLoadState({ planId: "", data: null, status: "settled" });
      return;
    }
    let cancelled = false;
    setLoadState({ planId, data: null, status: "loading" });
    (async () => {
      try {
        // 판정 직후의 배너/카드가 목적이라 "저장 후"는 반드시 새로 읽어야 한다. 그 조건은
        // refreshKey(현재 로그 id)에 실려 있으므로 network-only 대신 **캐시 키에** 넣는다 —
        // 저장으로 로그가 바뀌면 키가 달라져 미스(=새로 읽음), 같은 로그로 재진입하면 히트라
        // 화면 이동마다 나가던 왕복이 사라진다. 진행 상태를 바꾸는 다른 경로(플랜 관리 조정·
        // 세션 취소 등)는 apiMutate가 `/api/plans` prefix로 무효화하므로 stale이 남지 않는다.
        // 키가 그 prefix로 시작해야 무효화에 걸린다는 점에 주의.
        const res = await apiGet<ProgressionStateResponse>(
          `/api/plans/${encodeURIComponent(planId)}/progression-state`,
          {
            cacheKey: `/api/plans/${encodeURIComponent(planId)}/progression-state#${input.refreshKey ?? ""}`,
            // 미저장 세션 진입은 refreshKey 가 비어 키가 하나로 합쳐지고, IDB 웜업 엔트리는
            // 항상 stale 로 복원된다 → 첫 응답이 저장 전 상태일 수 있다. 재검증이 끝나면
            // 최신으로 교체해 배너·판정 카드가 stale 히트에 먹히지 않게 한다.
            onRevalidated: (fresh) => {
              if (!cancelled) setLoadState({ planId, data: fresh, status: "settled" });
            },
          },
        );
        if (!cancelled) setLoadState({ planId, data: res, status: "settled" });
      } catch {
        if (!cancelled) setLoadState({ planId, data: null, status: "settled" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, input.refreshKey]);

  const currentLoadState: ProgressionLoadState =
    loadState.planId === planId
      ? loadState
      : { planId, data: null, status: planId ? "loading" : "settled" };
  const data = currentLoadState.data;

  const feedback = data?.feedback ?? null;
  const isAsymptote = data?.program === "asymptote";

  const earlyDeloadBanner: FeedbackBanner | null = feedback?.earlyDeloadBanner ?? null;
  const showLightBlockBadge = isAsymptote && isLightBlockActive(data?.state ?? null);

  const blockReport: ProgressReport | null = useMemo(() => {
    const report = feedback?.report ?? null;
    if (!report) return null;
    void dismissTick; // dismiss 직후 재파생
    return isReportDismissed(report.eventId) ? null : report;
  }, [feedback?.report, dismissTick]);

  const dismissBlockReport = useCallback(() => {
    const eventId = feedback?.report?.eventId;
    if (!eventId) return;
    try {
      window.localStorage.setItem(DISMISS_PREFIX + eventId, "1");
    } catch {
      // storage 불가 환경(사파리 프라이빗 등)이면 세션 내 상태로만 닫는다.
    }
    setDismissTick((tick) => tick + 1);
  }, [feedback?.report?.eventId]);

  return {
    program: data?.program ?? null,
    ref5Status: data?.program === "ref5" ? data.ref5Status ?? null : null,
    progressionStateLoading: currentLoadState.status === "loading",
    progressionStateSettled: currentLoadState.status === "settled",
    earlyDeloadBanner,
    showLightBlockBadge,
    blockReport,
    dismissBlockReport,
  };
}
