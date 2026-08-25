"use client";

import { useCallback, useState } from "react";

import { apiPatch, apiPost } from "@/lib/api";
import { readWorkoutPreferences } from "@/lib/settings/workout-preferences";
import { sessionHasBodyweightExercise } from "@workout/core/bodyweight-load";

// 체중 확인 안내: 마지막 확인 시각 설정 키 + 스테일 임계(14일). 이 기간 내에 확인했으면 다시 안 묻는다.
const BODYWEIGHT_CHECKED_AT_KEY = "prefs.bodyweight.checkedAtMs";
const BODYWEIGHT_CHECK_STALE_MS = 14 * 24 * 60 * 60 * 1000;
const BODYWEIGHT_KG_KEY = "prefs.bodyweight.kg";

type SettingsRecord = Record<string, unknown>;

/**
 * 체중 값 하나가 두 곳에 쓰인다.
 * (A) 저장 시 맨몸 운동 총중량(meta.totalLoadKg) 스탬프 — 호출부가 저장 컨트롤러보다 먼저 이 훅을 부르는 이유.
 * (B) 중량풀업을 수행하는 세션에서 마지막 확인 후 14일+ 지났을 때만 뜨는 "업데이트/유지" 안내.
 * "유지"도 확인 시각을 기록해 14일간 다시 묻지 않는다(매 세션 마찰 회피).
 *
 * "업데이트"는 설정값과 **체중 이력** 양쪽에 쓴다. 이 배너가 체중을 새로 입력하는
 * 가장 잦은 지점이라, 여기서 이력을 남기지 않으면 통계 화면에서 따로 또 적어야 한다.
 * 두 쓰기는 목적이 다르다 — 설정값은 "오늘 체중"(처방 시드·저장 스탬프용), 이력은
 * "그때 체중"(강도 지표 소급 계산용)이다.
 */
export function useBodyweightCheck({
  initialSettings,
  sessionKey,
  seedExercises,
  enabled,
}: {
  initialSettings: SettingsRecord;
  sessionKey: string | null;
  seedExercises: ReadonlyArray<{ exerciseName: string }>;
  enabled: boolean;
}) {
  const [bodyweightKg, setBodyweightKg] = useState<number | null>(
    () =>
      readWorkoutPreferences(
        initialSettings as Record<string, string | number | boolean | null>,
      ).bodyweightKg,
  );
  const [submitting, setSubmitting] = useState(false);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  const checkedAtMs = Number(initialSettings[BODYWEIGHT_CHECKED_AT_KEY]) || 0;
  const isStale = Date.now() - checkedAtMs >= BODYWEIGHT_CHECK_STALE_MS;
  const showCheck =
    enabled &&
    sessionKey !== null &&
    dismissedKey !== sessionKey &&
    isStale &&
    sessionHasBodyweightExercise(seedExercises);

  const markChecked = useCallback(() => {
    // 확인 시각 기록(스테일 게이트). 실패는 무시 — 다음 세션에 다시 권고될 뿐.
    void apiPatch("/api/settings", {
      key: BODYWEIGHT_CHECKED_AT_KEY,
      value: Date.now(),
    }).catch(() => {});
  }, []);

  const handleUpdate = useCallback(
    async (kg: number) => {
      setSubmitting(true);
      try {
        await apiPatch("/api/settings", { key: BODYWEIGHT_KG_KEY, value: kg });
        setBodyweightKg(kg);
        markChecked();
        // 이력 기록은 부가다 — 실패해도 세션 흐름을 막지 않는다. 설정값은 이미
        // 저장됐으므로 오늘 세션의 총부하 스탬프는 정상 동작한다.
        void apiPost("/api/bodyweight", { valueKg: kg }).catch(() => {});
      } catch {
        // 저장 실패해도 안내는 닫는다 — 다음 권고 시점에 다시 뜬다.
      } finally {
        setSubmitting(false);
        setDismissedKey(sessionKey);
      }
    },
    [markChecked, sessionKey],
  );

  const handleKeep = useCallback(() => {
    markChecked();
    setDismissedKey(sessionKey);
  }, [markChecked, sessionKey]);

  return { bodyweightKg, submitting, showCheck, handleUpdate, handleKeep };
}
