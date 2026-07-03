"use client";

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  LOCALE_COOKIE_NAME,
  getAppCopy,
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

// NOTE: copy는 클라이언트에서 getAppCopy(locale)로 계산한다(초기값·전환 모두).
// 서버에서 getAppCopy 결과(AppCopy)를 prop으로 넘기면 안 된다 — AppCopy에 함수형 카피
// (streak/ariaLabel/exportFailed 등 파라미터화 문자열)가 있어 RSC가 client 컴포넌트 prop으로
// 직렬화하지 못하고 SSR이 크래시한다(#491 F4 회귀, prod 빌드에서만 재현). getAppCopy를 여기서 정적
// import하므로 카탈로그가 클라 번들에 포함되는데, 함수형 카피를 클라가 호출하는 이상 불가피하다.
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: AppLocale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);

  useEffect(() => {
    applyDocumentLocale(locale);
    writeLocaleCookie(locale);
  }, [locale]);

  const setLocale = useCallback(
    (nextLocale: AppLocale) => {
      startTransition(() => {
        setLocaleState(nextLocale);
      });
    },
    []
  );

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    copy: getAppCopy(locale),
    setLocale,
  }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}
