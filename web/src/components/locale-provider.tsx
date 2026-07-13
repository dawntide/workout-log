"use client";

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n/locale-cookie";
// messages(카탈로그)는 타입만 — 값 import 하나라도 있으면 카탈로그가 모든 라우트의
// 클라이언트 그래프에 실린다. 전환 시 /api/locale-copy JSON만 요청한다.
import type { AppCopy, AppLocale } from "@/lib/i18n/messages";

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
 * 클라이언트는 getAppCopy(전 로케일 카탈로그, messages.ts ~850줄)를 import하지
 * 않으므로 클라이언트 그래프에서 카탈로그가 빠진다(SSR·초기 렌더는 initialCopy로 정합).
 * 로케일 전환은 드무므로 그때만 캐시 가능한 JSON 카탈로그를 요청한다.
 *
 * ⚠️ 전제: AppCopy는 순수 직렬화 가능(함수형 카피 금지). #491이 함수형 카피가 남은
 * 상태로 이 방식을 적용해 RSC prop 직렬화 크래시(#493 revert)를 냈다 — 지금은 카피가
 * 전부 문자열이고 messages.serializable.test.ts가 재유입을 차단한다.
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
  const copyRequestSequence = useRef(0);

  useEffect(() => {
    applyDocumentLocale(locale);
    writeLocaleCookie(locale);
  }, [locale]);

  const setLocale = useCallback(
    (nextLocale: AppLocale) => {
      const requestSequence = ++copyRequestSequence.current;
      startTransition(() => {
        setLocaleState(nextLocale);
      });
      if (nextLocale === initialLocale) {
        // 초기 로케일은 이미 로드된 initialCopy를 재사용(추가 fetch 없음).
        setCopy(initialCopy);
        return;
      }
      // 다른 로케일로 전환할 때만 공개 JSON 카탈로그를 가져온다. messages.ts를
      // 실행 가능한 클라이언트 청크로 포함하지 않고 HTTP 캐시를 재사용한다.
      void fetch(`/api/locale-copy?locale=${nextLocale}`, {
        cache: "force-cache",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Locale copy request failed");
          return (await response.json()) as { copy?: AppCopy };
        })
        .then((payload) => {
          if (
            requestSequence === copyRequestSequence.current &&
            payload.copy
          ) {
            setCopy(payload.copy);
          }
        })
        .catch(() => {
          // Keep the currently rendered copy when a rare locale switch fails.
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
