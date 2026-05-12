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
  gap: "6px",
  background: "var(--color-surface-container-low)",
  border: "none",
  borderRadius: "12px",
  padding: "8px 14px",
  cursor: "pointer",
  fontFamily: "var(--font-label-family)",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--color-text-muted)",
  textDecoration: "none",
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
        gap: "10px",
        marginBottom: "var(--space-lg)",
      }}
    >
      <button
        type="button"
        onClick={onOpenPlanPicker}
        aria-label={
          selectedPlanName
            ? locale === "ko" ? "플랜 변경" : "Change plan"
            : locale === "ko" ? "플랜 선택" : "Select plan"
        }
        style={{
          ...PILL_STYLE,
          justifyContent: "space-between",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selectedPlanName ?? (locale === "ko" ? "플랜 선택" : "Select plan")}
        </span>
        <span className="material-symbols-outlined" style={{ fontSize: "16px", flexShrink: 0 }}>filter_list</span>
      </button>

      <Link
        href={APP_ROUTES.plansManage}
        aria-label={locale === "ko" ? "플랜 관리 열기" : "Open plan management"}
        style={{
          ...PILL_STYLE,
          flexShrink: 0,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>tune</span>
        <span>{locale === "ko" ? "관리" : "Manage"}</span>
      </Link>
    </div>
  );
});
