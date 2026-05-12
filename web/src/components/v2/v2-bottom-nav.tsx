"use client";

import { useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { APP_ROUTES } from "@/lib/app-routes";
import { useV2BottomDockRegistration } from "./v2-bottom-dock-context";
import { V2ActionDock, type V2ActionDockItem } from "./primitives";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const HOME_DECKS = [
  { key: "today", icon: "today", labelKo: "오늘", labelEn: "Today" },
  { key: "progress", icon: "trending_up", labelKo: "진행", labelEn: "Progress" },
];

export function V2BottomNav() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const { locale } = useLocale();
  const bottomDockRegistration = useV2BottomDockRegistration();

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
        key: "store",
        icon: "storefront",
        label: locale === "ko" ? "스토어" : "Store",
        href: APP_ROUTES.programStore,
        active: isActive(pathname, "/program-store"),
      },
      {
        key: "more",
        icon: "more_horiz",
        label: locale === "ko" ? "더보기" : "More",
        href: "/settings",
        active: isActive(pathname, "/settings") || isActive(pathname, "/stats"),
      },
    ];
  }, [bottomDockRegistration, homeDeckParam, locale, pathname]);

  return <V2ActionDock items={items} />;
}
