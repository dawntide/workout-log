"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { V2Icon } from "@/components/v2/primitives/v2-icon";

export type BottomSheetPrimaryAction = {
  ariaLabel: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: ReactNode;
};

function DefaultCheckIcon() {
  return <V2Icon name="check" weight={600} style={{ fontSize: "var(--v2-t-20)" }} />;
}

export function BottomSheetActionHeader({
  title,
  description,
  closeLabel,
  onClose,
  action,
  onPointerDown,
}: {
  title: string;
  description?: string;
  closeLabel: string;
  onClose: () => void;
  action: BottomSheetPrimaryAction;
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  return (
    <header className="mobile-bottom-sheet-header" onPointerDown={onPointerDown}>
      <button
        type="button"
        className="mobile-bottom-sheet-btn v2-tap-44"
        onClick={onClose}
        aria-label={closeLabel}
      >
        <V2Icon name="close" weight={500} style={{ fontSize: "var(--v2-t-20)" }} />
      </button>
      <div className="mobile-bottom-sheet-title">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <button
        type="button"
        className="mobile-bottom-sheet-btn mobile-bottom-sheet-btn--action v2-tap-44"
        onClick={action.onPress}
        aria-label={action.ariaLabel}
        disabled={action.disabled}
      >
        {action.icon ?? <DefaultCheckIcon />}
      </button>
    </header>
  );
}
