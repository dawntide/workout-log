"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { V2Card } from "@/components/v2/primitives";

type DialogTone = "default" | "danger";

export type AppAlertOptions = {
  title?: string;
  message: string;
  buttonText?: string;
  tone?: DialogTone;
};

export type AppConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: DialogTone;
  closeAsConfirm?: boolean;
  closeAsNull?: boolean; // X/backdrop 닫기 시 null 반환 (confirm/cancel과 구분)
};

type AlertRequest = {
  kind: "alert";
  title: string;
  message: string;
  buttonText: string;
  tone: DialogTone;
  resolve: () => void;
};

type ConfirmRequest = {
  kind: "confirm";
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  tone: DialogTone;
  closeAsConfirm: boolean;
  closeAsNull: boolean;
  resolve: (confirmed: boolean | null) => void;
};

type DialogRequest = AlertRequest | ConfirmRequest;

type AppDialogContextValue = {
  alert: (input: string | AppAlertOptions) => Promise<void>;
  confirm: (input: string | AppConfirmOptions) => Promise<boolean | null>;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

function normalizeAlertInput(input: string | AppAlertOptions, locale: "ko" | "en"): {
  title: string;
  message: string;
  buttonText: string;
  tone: DialogTone;
} {
  if (typeof input === "string") {
    return {
      title: locale === "ko" ? "안내" : "Notice",
      message: input,
      buttonText: locale === "ko" ? "확인" : "OK",
      tone: "default" as const,
    };
  }

  return {
    title: String(input.title ?? "").trim() || (locale === "ko" ? "안내" : "Notice"),
    message: String(input.message ?? "").trim(),
    buttonText: String(input.buttonText ?? "").trim() || (locale === "ko" ? "확인" : "OK"),
    tone: input.tone === "danger" ? "danger" : "default",
  };
}

function normalizeConfirmInput(input: string | AppConfirmOptions, locale: "ko" | "en"): {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  tone: DialogTone;
  closeAsConfirm: boolean;
  closeAsNull: boolean;
} {
  if (typeof input === "string") {
    return {
      title: locale === "ko" ? "확인" : "Confirm",
      message: input,
      confirmText: locale === "ko" ? "확인" : "Confirm",
      cancelText: locale === "ko" ? "취소" : "Cancel",
      tone: "default" as const,
      closeAsConfirm: false,
      closeAsNull: false,
    };
  }

  return {
    title: String(input.title ?? "").trim() || (locale === "ko" ? "확인" : "Confirm"),
    message: String(input.message ?? "").trim(),
    confirmText: String(input.confirmText ?? "").trim() || (locale === "ko" ? "확인" : "Confirm"),
    cancelText: String(input.cancelText ?? "").trim() || (locale === "ko" ? "취소" : "Cancel"),
    tone: input.tone === "danger" ? "danger" : "default",
    closeAsConfirm: input.closeAsConfirm === true,
    closeAsNull: input.closeAsNull === true,
  };
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const queueRef = useRef<DialogRequest[]>([]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    return () => {
      for (const request of queueRef.current) {
        if (request.kind === "confirm") request.resolve(false);
        else request.resolve();
      }
    };
  }, []);

  const active = queue[0] ?? null;

  // 시트 닫기(backdrop/X) 전용 — closeAsConfirm/closeAsNull 옵션 적용
  const closeActiveAsCancel = useCallback(() => {
    if (!active) return;
    if (active.kind === "confirm") {
      if (active.closeAsNull) active.resolve(null);
      else active.resolve(active.closeAsConfirm ? true : false);
    } else {
      active.resolve();
    }
    setQueue((prev) => prev.slice(1));
  }, [active]);

  // 취소 버튼 전용 — 항상 false (closeAsConfirm 무시)
  const closeActiveAsCancelButton = useCallback(() => {
    if (!active) return;
    if (active.kind === "confirm") active.resolve(false);
    else active.resolve();
    setQueue((prev) => prev.slice(1));
  }, [active]);

  const closeActiveAsAccept = useCallback(() => {
    if (!active) return;
    if (active.kind === "confirm") active.resolve(true);
    else active.resolve();
    setQueue((prev) => prev.slice(1));
  }, [active]);

  const alert = useCallback((input: string | AppAlertOptions) => {
    const normalized = normalizeAlertInput(input, locale);
    return new Promise<void>((resolve) => {
      const request: AlertRequest = {
        kind: "alert",
        title: normalized.title,
        message: normalized.message,
        buttonText: normalized.buttonText,
        tone: normalized.tone,
        resolve,
      };
      setQueue((prev) => [...prev, request]);
    });
  }, [locale]);

  const confirm = useCallback((input: string | AppConfirmOptions) => {
    const normalized = normalizeConfirmInput(input, locale);
    return new Promise<boolean | null>((resolve) => {
      const request: ConfirmRequest = {
        kind: "confirm",
        title: normalized.title,
        message: normalized.message,
        confirmText: normalized.confirmText,
        cancelText: normalized.cancelText,
        tone: normalized.tone,
        closeAsConfirm: normalized.closeAsConfirm,
        closeAsNull: normalized.closeAsNull,
        resolve,
      };
      setQueue((prev) => [...prev, request]);
    });
  }, [locale]);

  const contextValue = useMemo<AppDialogContextValue>(
    () => ({
      alert,
      confirm,
    }),
    [alert, confirm],
  );

  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}
      <BottomSheet
        open={Boolean(active)}
        title={active?.title ?? ""}
        description=""
        onClose={closeActiveAsCancel}
        closeLabel={locale === "ko" ? "닫기" : "Close"}
        footer={
          active ? (
            <div
              className="app-dialog-footer"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--v2-s-1)",
                width: "100%",
              }}
            >
              <button
                type="button"
                className="btn btn-primary btn-full"
                onClick={closeActiveAsAccept}
              >
                {active.kind === "confirm" ? active.confirmText : active.buttonText}
              </button>
              {active.kind === "confirm" ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-full"
                  onClick={closeActiveAsCancelButton}
                >
                  {active.cancelText}
                </button>
              ) : null}
            </div>
          ) : null
        }
      >
        {active ? (
          <V2Card
            tone={active.tone === "danger" ? "danger" : "inset"}
            padding="var(--v2-s-4)"
          >
            <p
              className="v2-body"
              style={{ whiteSpace: "pre-line", margin: 0 }}
            >
              {active.message}
            </p>
          </V2Card>
        ) : null}
      </BottomSheet>
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const context = useContext(AppDialogContext);
  if (!context) {
    throw new Error("useAppDialog must be used within AppDialogProvider");
  }
  return context;
}

export function useMaybeAppDialog() {
  return useContext(AppDialogContext);
}
