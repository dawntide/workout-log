"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

// ironlog 셸 푸터(mode·statusRight·keyHints) 등록 컨텍스트 — V2BottomDockProvider
// 패턴 미러(redesign-target.md §6 TermShell 확장). 화면이 자기 푸터를 등록하면
// 셸(절대 unmount 안 되는 chrome)이 읽어 렌더한다. [⏎]log=저장 등 액션은 onPress.

export type TermModeTone =
  | "normal"
  | "logging"
  | "rest"
  | "saving"
  | "pr"
  | "fail";

export type TermKeyHintItem = {
  key: string;
  label: string;
  onPress?: () => void;
};

export type TermFooterRegistration = {
  id: string;
  mode?: string;
  modeTone?: TermModeTone;
  statusRight?: string;
  keyHints?: TermKeyHintItem[];
};

type ContextValue = {
  registration: TermFooterRegistration | null;
  setRegistration: Dispatch<SetStateAction<TermFooterRegistration | null>>;
};

const TermKeyHintContext = createContext<ContextValue | null>(null);

export function TermKeyHintProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] =
    useState<TermFooterRegistration | null>(null);
  const value = useMemo(
    () => ({ registration, setRegistration }),
    [registration],
  );
  return (
    <TermKeyHintContext.Provider value={value}>
      {children}
    </TermKeyHintContext.Provider>
  );
}

// 셸이 현재 등록된 푸터를 읽는다(없으면 null → 셸 기본값).
export function useTermFooterRegistration(): TermFooterRegistration | null {
  return useContext(TermKeyHintContext)?.registration ?? null;
}

// 화면이 푸터를 등록한다(언마운트/전환 시 해제). registration은 호출부에서 useMemo로
// 안정화할 것 — 그래야 mode/statusRight가 실제로 바뀔 때만 셸이 갱신된다.
export function useRegisterTermFooter(
  registration: TermFooterRegistration | null,
): void {
  const setRegistration = useContext(TermKeyHintContext)?.setRegistration;
  const id = registration?.id;

  useEffect(() => {
    if (!setRegistration || !registration) return;
    setRegistration(registration);
  }, [setRegistration, registration]);

  useEffect(() => {
    if (!setRegistration || !id) return;
    return () => {
      setRegistration((current) => (current?.id === id ? null : current));
    };
  }, [setRegistration, id]);
}
