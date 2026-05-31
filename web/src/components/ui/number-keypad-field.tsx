"use client";

import { useState, type FocusEvent } from "react";
import { AppTextInput } from "./form-controls";

export type NumberKeypadFieldProps = {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
  /** decimal 입력 허용 시 iOS 키패드를 소수점 키패드로 표시 */
  allowDecimal?: boolean;
  className?: string;
};

/**
 * 네이티브 숫자 입력 필드. 휠 피커 대신 기본 iOS 숫자 키패드를 띄운다.
 * 운동 기록 화면의 CellInput과 동일하게 type="text" + inputMode + pattern 조합을
 * 사용하고, 디자인 가이드의 통일된 숫자 입력(workout-number) 스타일을 따른다.
 */
export function NumberKeypadField({
  value,
  min,
  max,
  onChange,
  ariaLabel,
  allowDecimal = false,
  className,
}: NumberKeypadFieldProps) {
  // focus 동안에는 사용자가 친 raw 문자열(draft)을 그대로 보여준다.
  // store 값은 매 입력마다 min/max로 클램프되는데, 그 값을 controlled value로
  // 되돌려 쓰면 iOS Safari에서 커서가 끝으로 튀므로 draft로 분리한다.
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = draft ?? String(value);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const parse = (raw: string) => {
    const cleaned = allowDecimal ? raw.replace(/[^0-9.]/g, "") : raw.replace(/[^0-9]/g, "");
    return { cleaned, num: allowDecimal ? parseFloat(cleaned) : parseInt(cleaned, 10) };
  };

  const handleChange = (raw: string) => {
    const { cleaned, num } = parse(raw);
    setDraft(cleaned);
    if (Number.isNaN(num)) return;
    onChange(clamp(num));
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setDraft(null);
    const { num } = parse(event.currentTarget.value);
    onChange(Number.isNaN(num) ? clamp(min) : clamp(num));
  };

  return (
    <AppTextInput
      variant="workout-number"
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      pattern={allowDecimal ? "[0-9]*[.]?[0-9]*" : "[0-9]*"}
      enterKeyHint="done"
      autoComplete="off"
      aria-label={ariaLabel}
      value={displayValue}
      className={className}
      onChange={(event) => handleChange(event.target.value)}
      onFocus={(event) => {
        setDraft(event.currentTarget.value);
        try {
          event.currentTarget.select();
        } catch {
          // ignore
        }
      }}
      onBlur={handleBlur}
    />
  );
}
