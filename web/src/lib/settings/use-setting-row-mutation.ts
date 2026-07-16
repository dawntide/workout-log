"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createBrowserSettingStore,
  type PersistSettingFn,
  type SettingStore,
  type SettingValue,
  updateSetting,
} from "./update-setting";

type UseSettingRowMutationOptions<T extends SettingValue> = {
  key: string;
  fallbackValue: T;
  serverValue?: T;
  store?: SettingStore;
  persistServer: PersistSettingFn<T>;
  successMessage?: string;
  rollbackNotice?: string;
  errorToMessage?: (error: unknown) => string;
  noticeTtlMs?: number;
};

type CommitIgnored = {
  ignored: true;
};

type CommitCompleted<T extends SettingValue> = {
  ignored: false;
  ok: boolean;
  value: T;
  message: string | null;
};

type CommitResult<T extends SettingValue> = CommitIgnored | CommitCompleted<T>;

type UseSettingRowMutationReturn<T extends SettingValue> = {
  value: T;
  pending: boolean;
  error: string | null;
  notice: string | null;
  setNotice: (next: string | null) => void;
  commit: (nextValue: T) => Promise<CommitResult<T>>;
};

const DEFAULT_NOTICE_TTL_MS = 2200;

function resolveBrowserLocale(): "ko" | "en" {
  if (typeof document !== "undefined") {
    const lang = document.documentElement.lang.trim().toLowerCase();
    if (lang.startsWith("ko")) return "ko";
    if (lang.startsWith("en")) return "en";
  }
  if (typeof navigator !== "undefined") {
    const lang = String(navigator.language ?? "").trim().toLowerCase();
    if (lang.startsWith("ko")) return "ko";
  }
  return "en";
}

export function useSettingRowMutation<T extends SettingValue>({
  key,
  fallbackValue,
  serverValue,
  store: storeFromProps,
  persistServer,
  successMessage = resolveBrowserLocale() === "ko" ? "변경사항을 저장했습니다." : "Changes saved.",
  rollbackNotice = resolveBrowserLocale() === "ko" ? "저장 실패로 이전 값으로 되돌렸습니다." : "Save failed, so the previous value was restored.",
  errorToMessage,
  noticeTtlMs = DEFAULT_NOTICE_TTL_MS,
}: UseSettingRowMutationOptions<T>): UseSettingRowMutationReturn<T> {
  const store = useMemo(() => storeFromProps ?? createBrowserSettingStore(), [storeFromProps]);
  const resolvedServerValue = (serverValue ?? fallbackValue) as T;

  // SSR와 hydration의 첫 렌더는 같은 server/fallback 값을 사용한다.
  // 브라우저 캐시는 mount 후 반영해 저장된 값으로 인한 text mismatch를 막는다.
  const [value, setValue] = useState<T>(resolvedServerValue);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const valueRef = useRef(value);
  const hadCachedAtInitRef = useRef(false);
  const didReadInitialCacheRef = useRef(false);
  const lastResolvedServerValueRef = useRef<T>(resolvedServerValue);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (didReadInitialCacheRef.current) return;
    didReadInitialCacheRef.current = true;
    const cached = store.read(key);
    hadCachedAtInitRef.current = cached !== undefined;
    if (cached === undefined) return;
    const nextValue = cached as T;
    valueRef.current = nextValue;
    setValue(nextValue);
  }, [key, store]);

  useEffect(() => {
    if (pending) return;
    const previousResolvedServerValue = lastResolvedServerValueRef.current;
    if (Object.is(previousResolvedServerValue, resolvedServerValue)) return;
    lastResolvedServerValueRef.current = resolvedServerValue;

    // Sync from server only when local value still points to the previous server snapshot.
    if (hadCachedAtInitRef.current) return;
    if (!Object.is(valueRef.current, previousResolvedServerValue)) return;

    setValue(resolvedServerValue);
    valueRef.current = resolvedServerValue;
  }, [pending, resolvedServerValue]);

  useEffect(() => {
    if (!notice) return;
    if (noticeTtlMs <= 0) return;
    const timer = window.setTimeout(() => {
      setNotice(null);
    }, noticeTtlMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [notice, noticeTtlMs]);

  const commit = useCallback(
    async (nextValue: T): Promise<CommitResult<T>> => {
      if (pending) {
        return { ignored: true };
      }

      setPending(true);
      setError(null);
      setNotice(null);

      const result = await updateSetting<T>({
        key,
        nextValue,
        getCurrentValue: () => valueRef.current,
        applyValue: (next) => {
          valueRef.current = next;
          setValue(next);
        },
        store,
        persistServer,
        errorToMessage,
      });

      setPending(false);

      if (result.ok) {
        setNotice(successMessage);
        return {
          ignored: false,
          ok: true,
          value: result.value,
          message: successMessage,
        };
      }

      setError(result.message);
      setNotice(rollbackNotice);
      return {
        ignored: false,
        ok: false,
        value: result.value,
        message: result.message,
      };
    },
    [errorToMessage, key, pending, persistServer, rollbackNotice, store, successMessage],
  );

  return {
    value,
    pending,
    error,
    notice,
    setNotice,
    commit,
  };
}

export type {
  UseSettingRowMutationOptions,
  UseSettingRowMutationReturn,
  CommitResult,
  CommitIgnored,
  CommitCompleted,
};
