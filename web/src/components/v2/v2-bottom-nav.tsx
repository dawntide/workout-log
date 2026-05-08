"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { APP_ROUTES } from "@/lib/app-routes";
import { useV2BottomDockRegistration } from "./v2-bottom-dock-context";
import { V2ActionDock, type V2ActionDockItem } from "./primitives";
import { V2LibrarySheet, type LibraryTab } from "./v2-library-sheet";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type SheetKey = "library" | null;

const LIBRARY_SHEET_ID = "v2-sheet-library";

function libraryTabForPath(pathname: string): LibraryTab {
  if (isActive(pathname, "/plans")) return "plans";
  if (isActive(pathname, "/program-store")) return "programs";
  return "exercises";
}

const HOME_DECKS = [
  { key: "today", icon: "today", labelKo: "오늘", labelEn: "Today" },
  { key: "progress", icon: "trending_up", labelKo: "진행", labelEn: "Progress" },
  { key: "history", icon: "history", labelKo: "히스토리", labelEn: "History" },
];

export function V2BottomNav() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const bottomDockRegistration = useV2BottomDockRegistration();
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("exercises");
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // 메뉴 정책: 액션 독 버튼은 시트, URL 라우트는 화면.
  // 라우트 진입 시 시트를 자동으로 덮지 않아 레거시/신규 화면이 겹쳐 보이는 혼선을 막는다.
  const close = () => setSheet(null);

  useEffect(() => {
    setSheet(null);
  }, [pathname]);

  const homeDeckParam = searchParams.get("deck") ?? "today";
  const items = useMemo<V2ActionDockItem[]>(() => {
    const fallbackHomeDeckItems: V2ActionDockItem[] = HOME_DECKS.map((d) => ({
      key: `home-${d.key}`,
      icon: d.icon,
      label: locale === "ko" ? d.labelKo : d.labelEn,
      href: d.key === "today" ? "/" : `/?deck=${d.key}`,
      active: pathname === "/" && homeDeckParam === d.key,
    }));

    const homeDeckItems =
      pathname === "/" && bottomDockRegistration
        ? bottomDockRegistration.items
        : fallbackHomeDeckItems;

    return [
      {
        key: "start",
        icon: "play_arrow",
        label: locale === "ko" ? "시작" : "Start",
        href: "/workout/log",
        primary: true,
        active: isActive(pathname, "/workout/log"),
      },
      ...homeDeckItems,
      {
        key: "plan",
        icon: "event_note",
        label: locale === "ko" ? "계획" : "Plan",
        href: APP_ROUTES.calendarHome,
        active: isActive(pathname, APP_ROUTES.calendarHome),
      },
      {
        key: "library",
        icon: "inventory_2",
        label: locale === "ko" ? "라이브러리" : "Library",
        onClick: () => {
          if (sheet === "library") setSheet(null);
          else {
            setLibraryTab(libraryTabForPath(pathname));
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
        href: "/settings",
        active: isActive(pathname, "/settings") || isActive(pathname, "/stats"),
      },
    ];
  }, [bottomDockRegistration, homeDeckParam, locale, pathname, sheet]);

  const activeIndex = useMemo(() => {
    const index = items.findIndex((item) => item.active);
    return index >= 0 ? index : 1;
  }, [items]);

  const activateItem = useCallback(
    (item: V2ActionDockItem) => {
      if (item.href) {
        setSheet(null);
        router.push(item.href);
        return;
      }
      item.onClick?.();
    },
    [router],
  );

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".app-main");
    if (!root) return;

    const shouldIgnore = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return true;
      return Boolean(
        target.closest(
          [
            ".v2-action-dock",
            "[role='dialog']",
            "[data-no-swipe='true']",
            "input",
            "textarea",
            "select",
            "[contenteditable='true']",
          ].join(","),
        ),
      );
    };

    const onTouchStart = (event: TouchEvent) => {
      if (sheet || shouldIgnore(event.target)) {
        touchStartRef.current = null;
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const onTouchEnd = (event: TouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || sheet) return;
      const touch = event.changedTouches[0];
      if (!touch) return;

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX < 64 || absX < absY * 1.35) return;

      const nextIndex = dx < 0 ? activeIndex + 1 : activeIndex - 1;
      const nextItem = items[nextIndex];
      if (!nextItem) return;
      activateItem(nextItem);
    };

    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchend", onTouchEnd);
    };
  }, [activateItem, activeIndex, items, sheet]);

  return (
    <>
      <V2ActionDock items={items} />
      <V2LibrarySheet
        open={sheet === "library"}
        onClose={close}
        defaultTab={libraryTab}
        controlsId={LIBRARY_SHEET_ID}
      />
    </>
  );
}
