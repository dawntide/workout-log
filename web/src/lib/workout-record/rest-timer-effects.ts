/**
 * 휴식 타이머의 브라우저 어댑터 — 사운드·Wake Lock·세션 복원.
 * 순수 로직은 rest-timer.ts에 있고, 여기는 DOM/브라우저 API만 만진다.
 */

import { parseRestTimerState, type RestTimerState } from "./rest-timer";

const REST_STORAGE_PREFIX = "workout-log.rest.v1.";

export function restStorageKey(persistenceKey: string): string {
  return `${REST_STORAGE_PREFIX}${persistenceKey}`;
}

/**
 * 휴식은 본질적으로 탭 단위 휘발 상태라 sessionStorage를 쓴다.
 * 드래프트(IndexedDB/localStorage) 스키마는 건드리지 않는다 — 복원 호환성 검사와
 * 마이그레이션을 끌어들일 이유가 없다(계획서 §3.5).
 */
export function readStoredRestTimer(
  persistenceKey: string | null,
  nowMs: number,
): RestTimerState | null {
  if (!persistenceKey || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(restStorageKey(persistenceKey));
    if (!raw) return null;
    return parseRestTimerState(JSON.parse(raw), nowMs);
  } catch {
    return null;
  }
}

export function writeStoredRestTimer(
  persistenceKey: string | null,
  state: RestTimerState | null,
): void {
  if (!persistenceKey || typeof window === "undefined") return;
  try {
    const key = restStorageKey(persistenceKey);
    if (state) {
      window.sessionStorage.setItem(key, JSON.stringify(state));
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // 프라이빗 모드·용량 초과 — 타이머는 계속 동작해야 하므로 삼킨다.
  }
}

type AudioContextCtor = typeof AudioContext;

let audioContext: AudioContext | null = null;

function resolveAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * 사용자 제스처(완료 탭) 시점에 불러 오디오를 언락한다. 자동재생 정책 때문에
 * 제스처 밖에서 만든 컨텍스트는 suspended로 남아 만료음이 울리지 않는다.
 */
export function primeRestChime(): void {
  const Ctor = resolveAudioContextCtor();
  if (!Ctor) return;
  try {
    if (!audioContext) audioContext = new Ctor();
    if (audioContext.state === "suspended") void audioContext.resume();
  } catch {
    audioContext = null;
  }
}

/** 에셋 없이 짧은 비프 두 번. 실패해도 조용히 넘어간다(타이머가 우선). */
export function playRestChime(): void {
  const Ctor = resolveAudioContextCtor();
  if (!Ctor) return;
  try {
    if (!audioContext) audioContext = new Ctor();
    if (audioContext.state === "suspended") void audioContext.resume();

    const ctx = audioContext;
    const start = ctx.currentTime;
    for (const [index, offset] of [0, 0.18].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(index === 0 ? 880 : 1174, start + offset);
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.12, start + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.16);
    }
  } catch {
    // 오디오 실패는 타이머 동작을 막지 않는다.
  }
}

type WakeLockSentinelLike = { released: boolean; release: () => Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

let wakeLock: WakeLockSentinelLike | null = null;

export function isWakeLockSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return Boolean((navigator as WakeLockNavigator).wakeLock);
}

export async function acquireWakeLock(): Promise<void> {
  if (!isWakeLockSupported()) return;
  if (wakeLock && !wakeLock.released) return;
  try {
    wakeLock = await (navigator as WakeLockNavigator).wakeLock!.request("screen");
  } catch {
    wakeLock = null;
  }
}

export async function releaseWakeLock(): Promise<void> {
  if (!wakeLock) return;
  try {
    if (!wakeLock.released) await wakeLock.release();
  } catch {
    // 이미 해제됐거나 탭이 숨겨진 상태 — 무시한다.
  } finally {
    wakeLock = null;
  }
}
