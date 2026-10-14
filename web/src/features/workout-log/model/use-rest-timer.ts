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
import { cancelRestPush, scheduleRestPush } from "@/lib/push/rest-push-client";
import { useLocale } from "@/components/locale-provider";
import {
  restPersistenceKeyAtom,
  restTimerAtom,
  workoutPreferencesAtom,
} from "@/features/workout-log/store/workout-log-atoms";

/** 리렌더 주기. 값은 매번 타임스탬프에서 파생하므로 이 값이 정확도를 좌우하지 않는다. */
const TICK_MS = 250;

export type RestTimerStartInput = {
  exerciseId: string;
  exerciseName: string;
  setIndex: number;
  /** 프로그램이 처방한 휴식(초). 있으면 사용자 설정보다 우선한다. */
  prescribedSeconds?: number | null;
};

export type RestTimerView = {
  active: boolean;
  remaining: number;
  target: number;
  ratio: number;
  start: (input: RestTimerStartInput) => void;
  extend: (deltaSeconds: number) => void;
  skip: () => void;
};

export function useRestTimer(persistenceKey: string | null): RestTimerView {
  const [timer, setTimer] = useAtom(restTimerAtom);
  const preferences = useAtomValue(workoutPreferencesAtom);
  const { locale } = useLocale();
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
    (input: RestTimerStartInput) => {
      const targetSeconds = resolveTargetSeconds(preferences, input);
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
      scheduleRestEndPush(next, input.exerciseName, locale);
    },
    [locale, persist, preferences],
  );

  const extend = useCallback(
    (deltaSeconds: number) => {
      if (!timer) return;
      const nextTarget = Math.max(5, Math.min(600, timer.targetSeconds + deltaSeconds));
      chimedForRef.current = null;
      const next = { ...timer, targetSeconds: nextTarget };
      persist(next);
      // 같은 예약을 새 종료 시각으로 덮는다. 문구는 시작 때 것을 그대로 쓴다.
      scheduleRestEndPush(next, null, locale);
    },
    [locale, persist, timer],
  );

  const skip = useCallback(() => {
    chimedForRef.current = null;
    persist(null);
    void cancelRestPush();
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
  const { locale } = useLocale();

  return useCallback(
    (input: RestTimerStartInput) => {
      const targetSeconds = resolveTargetSeconds(preferences, input);
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
      scheduleRestEndPush(next, input.exerciseName, locale);
    },
    [locale, persistenceKey, preferences, setTimer],
  );
}

/** 연장 때 다시 쓰려고 시작 시점 문구를 기억한다(타이머 상태에는 운동 이름이 없다). */
let lastRestPushCopy: { title: string; body: string } | null = null;

/**
 * 휴식 종료 푸시 예약. 이 기기가 알림을 켜 두지 않았으면 클라이언트가 아무것도 보내지
 * 않는다. 화면이 켜져 있어도 예약한다 — 앱을 벗어날지는 지금 알 수 없다.
 */
function scheduleRestEndPush(state: RestTimerState, exerciseName: string | null, locale: string) {
  const ko = locale !== "en";
  if (exerciseName !== null || !lastRestPushCopy) {
    const name = exerciseName?.trim();
    lastRestPushCopy = {
      title: ko ? "휴식 끝" : "Rest is over",
      body: name
        ? ko ? `${name} 다음 세트를 시작하세요.` : `Time for your next set of ${name}.`
        : ko ? "다음 세트를 시작하세요." : "Time for your next set.",
    };
  }
  const remaining = (state.startedAtMs + state.targetSeconds * 1000 - Date.now()) / 1000;
  if (remaining < 1) {
    // 연장 -로 이미 끝난 휴식 — 이전 예약이 남아 늦게 울리지 않게 지운다.
    void cancelRestPush();
    return;
  }
  scheduleRestPush({ delaySeconds: remaining, ...lastRestPushCopy });
}

/**
 * 목표 휴식 시간 해석 — 처방 -> 운동별 프리셋 -> 전역 기본값.
 * 처방이 맨 위인 이유: REF5처럼 프로토콜이 정한 휴식은 판정의 전제라 사용자 설정이
 * 덮으면 안 된다(계획서 docs/rest-timer-plan.md §3.2).
 */
function resolveTargetSeconds(
  preferences: WorkoutPreferences,
  input: RestTimerStartInput,
): number {
  const prescribed = Number(input.prescribedSeconds);
  if (Number.isFinite(prescribed) && prescribed > 0) return Math.round(prescribed);
  return resolveRestSecondsForExercise(preferences, {
    exerciseId: input.exerciseId,
    exerciseName: input.exerciseName,
  });
}

function restoreKey(state: RestTimerState): string {
  return `${state.exerciseId}:${state.setIndex}:${state.startedAtMs}`;
}
