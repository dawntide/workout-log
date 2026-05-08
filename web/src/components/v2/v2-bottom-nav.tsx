"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { V2ActionDock, type V2ActionDockItem } from "./primitives";
import { V2MoreSheet } from "./v2-more-sheet";
import { V2PlanSheet } from "./v2-plan-sheet";
import { V2LibrarySheet, type LibraryTab } from "./v2-library-sheet";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type SheetKey = "plan" | "library" | "more" | null;

const PLAN_SHEET_ID = "v2-sheet-plan";
const LIBRARY_SHEET_ID = "v2-sheet-library";
const MORE_SHEET_ID = "v2-sheet-more";

/**
 * 라우트 → 자동으로 펼칠 시트 / 라이브러리 탭 매핑.
 * /calendar, /exercises, /plans, /program-store, /stats 진입 시
 * 적절한 시트를 자동으로 띄운다 (migration UI-1).
 */
function deriveSheetFromPath(
  pathname: string,
): { sheet: SheetKey; libraryTab?: LibraryTab } {
  if (isActive(pathname, "/calendar")) return { sheet: "plan" };
  if (isActive(pathname, "/exercises"))
    return { sheet: "library", libraryTab: "exercises" };
  if (isActive(pathname, "/plans"))
    return { sheet: "library", libraryTab: "plans" };
  if (isActive(pathname, "/program-store"))
    return { sheet: "library", libraryTab: "programs" };
  if (isActive(pathname, "/stats")) return { sheet: "more" };
  return { sheet: null };
}

export function V2BottomNav() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { copy, locale } = useLocale();
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("exercises");

  // 라우트 변경 시 자동으로 시트 열기/닫기
  useEffect(() => {
    const derived = deriveSheetFromPath(pathname);
    setSheet(derived.sheet);
    if (derived.libraryTab) setLibraryTab(derived.libraryTab);
  }, [pathname]);

  // UI-2: 시트와 라우트의 상태 일치.
  // 라우트가 자동으로 띄운 시트라면, 닫을 때 라우트도 함께 정리한다 — 같은 컨텐츠가
  // 페이지와 시트 양쪽에 남아 있는 혼선을 방지. 수동 오픈은 단순 dismiss.
  const close = () => {
    const routeOpened = deriveSheetFromPath(pathname).sheet === sheet;
    setSheet(null);
    if (!routeOpened) return;
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  const items: V2ActionDockItem[] = [
    {
      key: "start",
      icon: "play_arrow",
      label: copy.nav.log,
      href: "/workout/log",
      primary: true,
      active: isActive(pathname, "/workout/log"),
    },
    {
      key: "today",
      icon: "today",
      label: copy.nav.home,
      href: "/",
      active: isActive(pathname, "/"),
    },
    {
      key: "plan",
      icon: "event_note",
      label: locale === "ko" ? "계획" : "Plan",
      onClick: () => setSheet(sheet === "plan" ? null : "plan"),
      active: sheet === "plan" || isActive(pathname, "/calendar"),
      expanded: sheet === "plan",
      controls: PLAN_SHEET_ID,
    },
    {
      key: "library",
      icon: "inventory_2",
      label: locale === "ko" ? "라이브러리" : "Library",
      onClick: () => {
        if (sheet === "library") setSheet(null);
        else {
          setLibraryTab("exercises");
          setSheet("library");
        }
      },
      active:
        sheet === "library" ||
        isActive(pathname, "/exercises") ||
        isActive(pathname, "/plans") ||
        isActive(pathname, "/program-store"),
      expanded: sheet === "library",
      controls: LIBRARY_SHEET_ID,
    },
    {
      key: "more",
      icon: "more_horiz",
      label: locale === "ko" ? "더보기" : "More",
      onClick: () => setSheet(sheet === "more" ? null : "more"),
      active:
        sheet === "more" ||
        isActive(pathname, "/settings") ||
        isActive(pathname, "/stats"),
      expanded: sheet === "more",
      controls: MORE_SHEET_ID,
    },
  ];

  return (
    <>
      <V2ActionDock items={items} />
      <V2PlanSheet
        open={sheet === "plan"}
        onClose={close}
        controlsId={PLAN_SHEET_ID}
      />
      <V2LibrarySheet
        open={sheet === "library"}
        onClose={close}
        defaultTab={libraryTab}
        controlsId={LIBRARY_SHEET_ID}
      />
      <V2MoreSheet
        open={sheet === "more"}
        onClose={close}
        controlsId={MORE_SHEET_ID}
      />
    </>
  );
}
