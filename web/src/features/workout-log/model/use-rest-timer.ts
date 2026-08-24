"use client";

import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveRestSecondsForExercise,
  type WorkoutPreferences,
} from "@/lib/settings/workout-preferences";
import {
  isExpired,
  progressRatio,
  remainingSeconds,
  type RestTimerState,
} from "@/lib/workout-record/rest-timer";
import {
  acquireWakeLock,
  playRestChime,
  primeRestChime,
  readStoredRestTimer,
  releaseWakeLock,
  writeStoredRestTimer,
} from "@/lib/workout-record/rest-timer-effects";
import {
  restPersistenceKeyAtom,
  restTimerAtom,
  workoutPreferencesAtom,
} from "@/features/workout-log/store/workout-log-atoms";

/** 리렌더 주기. 값은 매번 타임스탬프에서 파생하므로 이 값이 정확도를 좌우하지 않는다. */
const TICK_MS = 250;

export type RestTimerView = {
  active: boolean;
  remaining: number;
  target: number;
  ratio: number;
  start: (input: { exerciseId: string; exerciseName: string; setIndex: number }) => void;
  extend: (deltaSeconds: number) => void;
  skip: () => void;
};

export function useRestTimer(persistenceKey: string | null): RestTimerView {
  const [timer, setTimer] = useAtom(restTimerAtom);
  const preferences = useAtomValue(workoutPreferencesAtom);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const chimedForRef = useRef<string | null>(null);

  // 복원: 화면에 들어올 때 sessionStorage에 살아있는 타이머가 있으면 이어받는다.
  useEffect(() => {
    if (!persistenceKey) return;
    const restored = readStoredRestTimer(persistenceKey, Date.now());
    if (restored) {
      // 복원된 타이머의 만료음은 울리지 않는다 — 이미 지난 일이다.
      chimedForRef.current = restoreKey(restored);
      setTimer(restored);
    }
  }, [persistenceKey, setTimer]);

  // 틱: 리렌더만 유발한다. 누적 카운터가 아니므로 백그라운드 스로틀에 영향받지 않는다.
  useEffect(() => {
    if (!timer) return;
    const id = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    const onVisible = () => setNowMs(Date.now());
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [timer]);

  // 만료: 사운드는 타이머당 한 번만.
  useEffect(() => {
    if (!timer) return;
    if (!isExpired(timer, nowMs)) return;
    const key = restoreKey(timer);
    if (chimedForRef.current === key) return;
    chimedForRef.current = key;
    if (preferences.restSoundEnabled) playRestChime();
  }, [timer, nowMs, preferences.restSoundEnabled]);

  // Wake Lock: 설정이 켜져 있고 타이머가 도는 동안만. 탭 복귀 시 재획득한다.
  useEffect(() => {
    if (!preferences.restWakeLockEnabled || !timer) {
      void releaseWakeLock();
      return;
    }
    void acquireWakeLock();
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void releaseWakeLock();
    };
  }, [preferences.restWakeLockEnabled, timer]);

  const persist = useCallback(
    (next: RestTimerState | null) => {
      setTimer(next);
      writeStoredRestTimer(persistenceKey, next);
    },
    [persistenceKey, setTimer],
  );

  const start = useCallback(
    (input: { exerciseId: string; exerciseName: string; setIndex: number }) => {
      // 처방(restSeconds)은 PR5에서 이 위에 얹힌다. 지금은 프리셋 -> 전역 기본값.
      const targetSeconds = resolveRestSecondsForExercise(
        preferences as Pick<WorkoutPreferences, "restDefaultSeconds" | "restPresets">,
        { exerciseId: input.exerciseId, exerciseName: input.exerciseName },
      );
      const next: RestTimerState = {
        exerciseId: input.exerciseId,
        setIndex: input.setIndex,
        startedAtMs: Date.now(),
        targetSeconds,
      };
      chimedForRef.current = null;
      // 완료 탭은 사용자 제스처다 — 이 시점에 오디오를 언락해야 만료음이 울린다.
      if (preferences.restSoundEnabled) primeRestChime();
      setNowMs(Date.now());
      persist(next);
    },
    [persist, preferences],
  );

  const extend = useCallback(
    (deltaSeconds: number) => {
      if (!timer) return;
      const nextTarget = Math.max(5, Math.min(600, timer.targetSeconds + deltaSeconds));
      chimedForRef.current = null;
      persist({ ...timer, targetSeconds: nextTarget });
    },
    [persist, timer],
  );

  const skip = useCallback(() => {
    chimedForRef.current = null;
    persist(null);
  }, [persist]);

  return useMemo(() => {
    if (!timer) {
      return { active: false, remaining: 0, target: 0, ratio: 0, start, extend, skip };
    }
    return {
      active: true,
      remaining: remainingSeconds(timer, nowMs),
      target: timer.targetSeconds,
      ratio: progressRatio(timer, nowMs),
      start,
      extend,
      skip,
    };
  }, [timer, nowMs, start, extend, skip]);
}

/**
 * 시작 전용 경량 훅. 카드처럼 깊은 곳에서 쓰라고 분리했다 — 틱·Wake Lock·만료음 같은
 * 부수효과는 화면에 한 번만 마운트되는 useRestTimer가 전담한다.
 */
export function useStartRestTimer() {
  const setTimer = useSetAtom(restTimerAtom);
  const preferences = useAtomValue(workoutPreferencesAtom);
  const persistenceKey = useAtomValue(restPersistenceKeyAtom);

  return useCallback(
    (input: { exerciseId: string; exerciseName: string; setIndex: number }) => {
      const targetSeconds = resolveRestSecondsForExercise(
        preferences as Pick<WorkoutPreferences, "restDefaultSeconds" | "restPresets">,
        { exerciseId: input.exerciseId, exerciseName: input.exerciseName },
      );
      const next: RestTimerState = {
        exerciseId: input.exerciseId,
        setIndex: input.setIndex,
        startedAtMs: Date.now(),
        targetSeconds,
      };
      // 완료 탭은 사용자 제스처다 — 이 시점에 언락해야 만료음이 울린다.
      if (preferences.restSoundEnabled) primeRestChime();
      setTimer(next);
      writeStoredRestTimer(persistenceKey, next);
    },
    [persistenceKey, preferences, setTimer],
  );
}

function restoreKey(state: RestTimerState): string {
  return `${state.exerciseId}:${state.setIndex}:${state.startedAtMs}`;
}
