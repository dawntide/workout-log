"use client";

import { forwardRef, useState, type KeyboardEvent } from "react";

export type CellInputProps = {
  value: string;
  placeholder: string;
  color: string;
  ariaLabel: string;
  onChange: (raw: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  allowDecimal?: boolean;
  /** 셀 배경 — paper 기본값. terminal은 transparent 등으로 override. */
  bg?: string;
  /** focus ring 색 — paper 기본 --v2-accent. terminal은 --term-amber 등. */
  focusRing?: string;
};

// 세트 행 숫자 입력 셀 — workout-set-row.tsx에서 추출(paper WorkoutSetRow +
// terminal TermSetRow 공유). 스타일은 bg/focusRing props로만 분기, 동작은 동일.
export const CellInput = forwardRef<HTMLInputElement, CellInputProps>(
  function CellInput(
    {
      value,
      placeholder,
      color,
      ariaLabel,
      onChange,
      onKeyDown,
      allowDecimal,
      bg = "var(--v2-paper-2)",
      focusRing = "var(--v2-accent)",
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    // 입력 중에는 사용자가 친 raw 문자열(draft)을 그대로 표시한다.
    // store의 weightKg는 매 입력마다 최소 플레이트 단위로 스냅되는데(예: 8 → 7.5),
    // 그 스냅값을 controlled value로 되돌려 쓰면 iOS Safari에서 커서가 끝으로 튀고
    // "8" 같은 중간 입력이 즉시 7.5로 바뀌어 백스페이스가 막힌다.
    // focus 동안에는 draft를 보여주고, blur 시 null로 비워 정규화된 store 값으로 복귀한다.
    const [draft, setDraft] = useState<string | null>(null);
    const displayValue = draft ?? value;
    return (
      <input
        ref={ref}
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        pattern={allowDecimal ? "[0-9]*[.]?[0-9]*" : "[0-9]*"}
        enterKeyHint="next"
        autoComplete="off"
        value={displayValue}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          onChange(raw);
        }}
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          setFocused(true);
          setDraft(e.currentTarget.value);
          try {
            e.currentTarget.select();
          } catch {
            // ignore
          }
        }}
        onBlur={() => {
          setFocused(false);
          setDraft(null);
        }}
        className="v2-num-sm"
        style={{
          width: "100%",
          minWidth: 0,
          minHeight: "var(--v2-touch)",
          padding: "var(--v2-s-1) var(--v2-s-2)",
          borderRadius: "var(--v2-r-1)",
          background: bg,
          color,
          textAlign: "center",
          border: "none",
          outline: "none",
          boxShadow: focused ? `inset 0 0 0 2px ${focusRing}` : undefined,
        }}
      />
    );
  },
);
