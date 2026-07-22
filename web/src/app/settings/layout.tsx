"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  SettingsModalHeaderActionProvider,
  useSettingsModalHeaderActionState,
} from "@/components/settings/settings-modal-header-action";
import { useLocale } from "@/components/locale-provider";
import { MoreScreen } from "@/widgets/more-screen";
import { BottomSheet } from "@/components/ui/bottom-sheet";

function modalTitleFromPathname(
  pathname: string,
  titles: ReturnType<typeof useLocale>["copy"]["settings"]["modalTitles"],
  detailTitle: string,
  debugTitle: string,
) {
  if (pathname.startsWith("/settings/minimum-plate")) return titles.minimumPlate;
  if (pathname.startsWith("/settings/data-export")) return titles.dataExport;
  if (pathname.startsWith("/settings/data")) return titles.data;
  if (pathname.startsWith("/settings/account")) return titles.account;
  if (pathname.startsWith("/settings/debug")) return debugTitle;
  return detailTitle;
}

function modalDescriptionFromPathname(
  pathname: string,
  descriptions: ReturnType<typeof useLocale>["copy"]["settings"]["modalDescriptions"],
) {
  if (pathname.startsWith("/settings/data")) {
    return descriptions.data;
  }
  return descriptions.default;
}

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/settings";
  const router = useRouter();
  const isRoot = pathname === "/settings";
  const closeTimerRef = useRef<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(true);

  useEffect(() => {
    if (isRoot) return;
    setSheetOpen(true);
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, [isRoot, pathname]);

  useEffect(
    () => () => {
      if (closeTimerRef.current === null) return;
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    },
    [],
  );

  const handleClose = useCallback(() => {
    if (closeTimerRef.current !== null) return;
    setSheetOpen(false);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      router.push("/settings");
    }, 400);
  }, [router]);

  return (
    <SettingsModalHeaderActionProvider>
      {/*
       * MoreScreen은 항상 이 위치(첫 번째 자식)에 렌더링됩니다.
       * isRoot 조건에 따라 최상위 컴포넌트 타입이 바뀌었던 기존 구조와 달리,
       * 동일한 React 트리 위치를 유지하므로 라우트 이동 시 remount가 발생하지 않습니다.
       */}
      <MoreScreen />
      {!isRoot && (
        <SettingsSheetOverlay pathname={pathname} sheetOpen={sheetOpen} onClose={handleClose}>
          {children}
        </SettingsSheetOverlay>
      )}
    </SettingsModalHeaderActionProvider>
  );
}

function SettingsSheetOverlay({
  pathname,
  sheetOpen,
  onClose,
  children,
}: {
  pathname: string;
  sheetOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const headerAction = useSettingsModalHeaderActionState();
  const { copy, locale } = useLocale();
  const panelClassName = "settings-child-modal-panel";
  const debugTitle = locale === "ko" ? "디버그 도구" : "Debug Tools";

  return (
    <BottomSheet
      open={sheetOpen}
      onClose={onClose}
      title={modalTitleFromPathname(pathname, copy.settings.modalTitles, copy.settings.detailTitle, debugTitle)}
      description={modalDescriptionFromPathname(pathname, copy.settings.modalDescriptions)}
      closeLabel={copy.settings.close}
      panelClassName={panelClassName}
      primaryAction={headerAction}
    >
      <div>{children}</div>
    </BottomSheet>
  );
}
