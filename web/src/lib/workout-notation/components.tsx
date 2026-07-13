"use client";

import type { CSSProperties, ReactNode } from "react";
import type {
  PerformedSetInput,
  PrescriptionInput,
} from "@workout/core/workout-notation/format";
import { summarizePerformedHistory } from "@workout/core/workout-notation/format";
import { bodyweightAddedSuffix } from "@workout/core/bodyweight-load";

/**
 * 맨몸 운동 총무게 병기 컨텍스트. weightKg는 이미 총무게(체중+추가)로 환산된 값이어야
 * 하며, 이 컨텍스트가 주어지면 무게 토큰 뒤에 `(+20)`/`(체중)` 병기를 렌더한다.
 */
type BodyweightLoadContext = {
  exerciseName?: string;
  bodyweightKg?: number | null;
  locale?: "ko" | "en";
};

function loadSuffix(
  weightKg: number,
  ctx: BodyweightLoadContext | undefined,
): string | null {
  if (!ctx?.exerciseName) return null;
  return bodyweightAddedSuffix(
    ctx.exerciseName,
    weightKg,
    ctx.bodyweightKg,
    ctx.locale,
  );
}

type TokenColor =
  | "weight"
  | "reps"
  | "dim"
  | "warning"
  | "inherit";

const COLOR_VAR: Record<TokenColor, string | undefined> = {
  weight: "var(--v2-c-weight)",
  reps: "var(--v2-c-reps)",
  dim: "var(--v2-ink-3)",
  warning: "var(--v2-c-warning)",
  inherit: undefined,
};

function Token({
  color,
  children,
}: {
  color: TokenColor;
  children: ReactNode;
}) {
  return <span style={{ color: COLOR_VAR[color] }}>{children}</span>;
}

const INLINE_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--v2-s-1)",
};

/**
 * 처방 표기 inline 컴포넌트. 색상 분리: sets/구분자=dim, reps=초록, weight=보라, RPE=warning.
 * 예: `3 × 5+ @ 100kg RPE 8`
 */
export function PrescriptionInline({
  sets,
  reps,
  weightKg,
  weightSuffix,
  percent,
  rpe,
  lastSetAmrap,
  style,
  className = "v2-mono-label",
}: PrescriptionInput & { style?: CSSProperties; className?: string }) {
  if (!Number.isFinite(sets) || !Number.isFinite(reps) || sets < 1 || reps < 1) {
    return null;
  }
  const repsText = `${reps}${lastSetAmrap ? "+" : ""}`;
  const isWeight =
    typeof weightKg === "number" &&
    (weightKg > 0 || (weightKg === 0 && Boolean(weightSuffix)));
  const intensityText = isWeight
    ? `${weightKg}kg`
    : typeof percent === "number" && percent > 0
      ? `${percent}%`
      : null;
  // 추가중량 병기는 weight 표기일 때만 (맨몸 운동 총무게 옆 `(+10)` 등).
  const suffixText = isWeight && weightSuffix ? weightSuffix : null;
  const rpeText =
    typeof rpe === "number" && rpe > 0 ? `RPE ${rpe}` : null;

  return (
    <span className={className} style={{ ...INLINE_STYLE, ...style }}>
      {sets > 1 && (
        <>
          <Token color="dim">{sets}</Token>
          <Token color="dim">×</Token>
        </>
      )}
      <Token color="reps">{repsText}</Token>
      {intensityText && (
        <>
          <Token color="dim">@</Token>
          <Token color="weight">{intensityText}</Token>
          {suffixText && <Token color="dim">{suffixText}</Token>}
        </>
      )}
      {rpeText && <Token color="warning">{rpeText}</Token>}
    </span>
  );
}

/**
 * 수행 로그 1세트 inline. `100kg × 5` 또는 `100kg × 8+`.
 * 무게 0 이하/미입력은 `—`.
 */
export function PerformedSetInline({
  weightKg,
  reps,
  isAmrap,
  load,
  style,
  className = "v2-mono-label",
}: PerformedSetInput & {
  load?: BodyweightLoadContext;
  style?: CSSProperties;
  className?: string;
}) {
  const suffix = weightKg > 0 ? loadSuffix(weightKg, load) : null;
  return (
    <span className={className} style={{ ...INLINE_STYLE, ...style }}>
      <Token color="weight">{weightKg > 0 ? weightKg : "—"}</Token>
      {suffix && <Token color="dim">{suffix}</Token>}
      <Token color="dim">×</Token>
      <Token color="reps">
        {reps}
        {isAmrap ? "+" : ""}
      </Token>
    </span>
  );
}

/**
 * 수행 로그 요약 inline. compact 조건 만족 시 한 줄 `100kg × 5 × 3` 형태로 wrapper(span) 1개,
 * 아니면 세트별 칩 가로 나열 (overflow auto).
 *
 * 스타일 prop:
 * - `compactWrapperStyle`: compact 모드의 wrapper span에 적용 (예: `marginRight: auto`)
 * - `chipStyle`: expanded 모드의 각 칩에 적용 (compact일 땐 wrapper에도 적용)
 * - `containerStyle`: expanded 모드 컨테이너 div
 */
export function PerformedHistoryInline({
  sets,
  load,
  compactWrapperStyle,
  chipStyle,
  containerStyle,
  className = "v2-mono-label",
}: {
  sets: PerformedSetInput[];
  load?: BodyweightLoadContext;
  compactWrapperStyle?: CSSProperties;
  chipStyle?: CSSProperties;
  containerStyle?: CSSProperties;
  className?: string;
}) {
  const view = summarizePerformedHistory(sets);
  if (view.mode === "compact") {
    const suffix = view.weightKg > 0 ? loadSuffix(view.weightKg, load) : null;
    return (
      <span
        className={className}
        style={{ ...INLINE_STYLE, ...chipStyle, ...compactWrapperStyle }}
      >
        <Token color="weight">{view.weightKg > 0 ? view.weightKg : "—"}</Token>
        {suffix && <Token color="dim">{suffix}</Token>}
        <Token color="dim">×</Token>
        <Token color="reps">{view.reps}</Token>
        {view.sets > 1 && (
          <>
            <Token color="dim">×</Token>
            <Token color="dim">{view.sets}</Token>
          </>
        )}
      </span>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--v2-s-1)",
        overflowX: "auto",
        scrollbarWidth: "none",
        ...containerStyle,
      }}
    >
      {view.sets.map((s, i) => (
        <PerformedSetInline
          key={i}
          weightKg={s.weightKg}
          reps={s.reps}
          isAmrap={s.isAmrap}
          load={load}
          className={className}
          style={{ flexShrink: 0, ...chipStyle }}
        />
      ))}
    </div>
  );
}
