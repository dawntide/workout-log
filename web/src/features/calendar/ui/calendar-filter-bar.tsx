"use client";

import { memo } from "react";
import Link from "next/link";
import { APP_ROUTES } from "@/lib/app-routes";

type CalendarFilterBarProps = {
  locale: "ko" | "en";
  selectedPlanName: string | null;
  onOpenPlanPicker: () => void;
};

const PILL_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  background: "var(--v2-paper)",
  border: "none",
  borderRadius: "var(--v2-r-2)",
  padding: "8px 14px",
  cursor: "pointer",
  fontFamily: "var(--v2-f-display)",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  color: "var(--v2-ink-2)",
  textDecoration: "none",
  boxShadow: "var(--v2-elev-1)",
} as const;

export const CalendarFilterBar = memo(function CalendarFilterBar({
  locale,
  selectedPlanName,
  onOpenPlanPicker,
}: CalendarFilterBarProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--v2-s-2)",
        marginBottom: "var(--v2-s-6)",
      }}
    >
      <button
        type="button"
        onClick={onOpenPlanPicker}
        aria-label={
          selectedPlanName
            ? locale === "ko"
              ? "플랜 변경"
              : "Change plan"
            : locale === "ko"
              ? "플랜 선택"
              : "Select plan"
        }
        className="v2-pressable"
        style={{
          ...PILL_STYLE,
          justifyContent: "space-between",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {selectedPlanName ?? (locale === "ko" ? "플랜 선택" : "Select plan")}
        </span>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 16, flexShrink: 0 }}
        >
          filter_list
        </span>
      </button>

      <Link
        href={APP_ROUTES.plansManage}
        aria-label={locale === "ko" ? "플랜 관리 열기" : "Open plan management"}
        className="v2-pressable"
        style={{ ...PILL_STYLE, flexShrink: 0 }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          tune
        </span>
        <span>{locale === "ko" ? "관리" : "Manage"}</span>
      </Link>
    </div>
  );
});
