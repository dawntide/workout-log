"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  LOCALE_COOKIE_NAME,
  type AppCopy,
  type AppLocale,
} from "@/lib/i18n/messages";

type LocaleContextValue = {
  locale: AppLocale;
  copy: AppCopy;
  setLocale: (locale: AppLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function writeLocaleCookie(locale: AppLocale) {
  if (typeof document === "undefined") return;
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

function applyDocumentLocale(locale: AppLocale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
}

/**
 * initialCopy는 서버(LocaleShell)에서 getAppCopy(initialLocale)로 계산해 prop으로 넘긴다.
 * 클라이언트는 getAppCopy(전 로케일 카탈로그, messages.ts ~850줄)를 정적 import하지 않으므로
 * 초기 클라이언트 번들에서 카탈로그가 빠진다(SSR·초기 렌더는 initialCopy로 정합).
 * 로케일 전환은 드무므로 그때만 messages를 동적 import해 대상 로케일 copy를 로드한다.
 */
export function LocaleProvider({
  initialLocale,
  initialCopy,
  children,
}: {
  initialLocale: AppLocale;
  initialCopy: AppCopy;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);
  const [copy, setCopy] = useState<AppCopy>(initialCopy);

  useEffect(() => {
    applyDocumentLocale(locale);
    writeLocaleCookie(locale);
  }, [locale]);

  const setLocale = useCallback(
    (nextLocale: AppLocale) => {
      startTransition(() => {
        setLocaleState(nextLocale);
      });
      if (nextLocale === initialLocale) {
        // 초기 로케일은 이미 로드된 initialCopy를 재사용(추가 fetch 없음).
        setCopy(initialCopy);
        return;
      }
      // 다른 로케일로 전환할 때만 카탈로그 청크를 동적 로드.
      void import("@/lib/i18n/messages").then((m) => {
        setCopy(m.getAppCopy(nextLocale));
      });
    },
    [initialLocale, initialCopy],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, copy, setLocale }),
    [locale, copy, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}
