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
  /**
   * 입력값을 이 배수로 스냅한다(예: 0.5, 2.5). 0/미지정이면 스냅하지 않는다.
   * 운동 기록 화면의 RPE(0.5 스냅)와 동일하게, 매 입력마다 스냅된 값을 store에
   * 반영하되 화면에는 사용자가 친 raw(draft)를 보여줘 타이핑은 자유롭게 유지한다.
   */
  step?: number;
  /**
   * 허용 소수 자릿수. 미지정 시 step에서 파생(정수 step→0자리), step도 없으면 무제한.
   * 무게 입력처럼 과도한 소수(예: 100.7777)를 막는 용도.
   */
  decimals?: number;
  className?: string;
};

/** step 값에서 허용 소수 자릿수를 파생한다(0.5→1, 2.5→1, 0.25→2, 1→0). */
function decimalsFromStep(step: number | undefined): number | null {
  if (!step || step <= 0) return null;
  const frac = String(step).split(".")[1];
  return frac ? frac.length : 0;
}

function roundToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * 네이티브 숫자 입력 필드. 휠 피커 대신 기본 iOS 숫자 키패드를 띄운다.
 * 운동 기록 화면의 CellInput과 동일하게 type="text" + inputMode + pattern 조합을
 * 사용하고, 디자인 가이드의 통일된 숫자 입력(workout-number) 스타일을 따른다.
 * 입력값은 속성(min/max·allowDecimal·step·decimals)에 맞춰 유효성 검사된다.
 */
export function NumberKeypadField({
  value,
  min,
  max,
  onChange,
  ariaLabel,
  allowDecimal = false,
  step,
  decimals,
  className,
}: NumberKeypadFieldProps) {
  // focus 동안에는 사용자가 친 raw 문자열(draft)을 그대로 보여준다.
  // store 값은 매 입력마다 클램프·스냅되는데, 그 값을 controlled value로
  // 되돌려 쓰면 iOS Safari에서 커서가 끝으로 튀므로 draft로 분리한다.
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = draft ?? String(value);

  const maxDecimals = decimals ?? decimalsFromStep(step);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  // 입력 중 문자열 정제: 숫자/소수점만, 소수점은 1개로 제한, 소수 자릿수 제한.
  const clean = (raw: string): string => {
    if (!allowDecimal) return raw.replace(/[^0-9]/g, "");
    const filtered = raw.replace(/[^0-9.]/g, "");
    const dot = filtered.indexOf(".");
    if (dot === -1) return filtered;
    const intPart = filtered.slice(0, dot);
    // 두 번째 이후의 소수점은 버린다(1.2.3 → 1.23 방지).
    let decPart = filtered.slice(dot + 1).replace(/\./g, "");
    if (maxDecimals != null) {
      if (maxDecimals === 0) return intPart;
      decPart = decPart.slice(0, maxDecimals);
    }
    return `${intPart}.${decPart}`;
  };

  const toNum = (cleaned: string) =>
    allowDecimal ? parseFloat(cleaned) : parseInt(cleaned, 10);

  // 최종 저장값: 범위 클램프 → step 스냅 → 다시 클램프 → 소수 정리.
  const finalize = (n: number): number => {
    let v = clamp(n);
    if (step && step > 0) v = clamp(Math.round(v / step) * step);
    if (maxDecimals != null) v = roundToDecimals(v, maxDecimals);
    return v;
  };

  const handleChange = (raw: string) => {
    const cleaned = clean(raw);
    setDraft(cleaned);
    const num = toNum(cleaned);
    if (Number.isNaN(num)) return;
    onChange(finalize(num));
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setDraft(null);
    const num = toNum(clean(event.currentTarget.value));
    onChange(Number.isNaN(num) ? finalize(min) : finalize(num));
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
