"use client";

import { useState, type CSSProperties } from "react";
import { V2Card, V2PrimaryBtn, V2SecondaryBtn, V2TextField } from "@/components/v2/primitives";
import { useThemeSkin } from "@/components/use-theme-skin";

type Locale = "ko" | "en";

type Props = {
  currentKg: number | null;
  locale: Locale;
  submitting?: boolean;
  onUpdate: (kg: number) => void;
  onKeep: () => void;
};

// "중량풀업 세션 — 체중 확인" 안내. 중량풀업은 총중량(체중+추가)으로 기록·추적되므로,
// 중량풀업을 수행하는 모든 프로그램에서 (마지막 확인 후 14일+일 때) 체중 갱신/유지를 권고한다.
// 매번 입력시키지 않고 "유지"가 한 탭. presentational — 영속화/디스미스는 호출부가 담당.
// terminal 스킨에선 TUI(box-frame · 사각 input · bracket 키힌트)로 분기(paper 버튼 잔재 제거).
export function BodyweightCheckBanner(props: Props) {
  const skin = useThemeSkin();
  if (skin === "terminal") return <BodyweightCheckBannerTerminal {...props} />;
  return <BodyweightCheckBannerPaper {...props} />;
}

function BodyweightCheckBannerPaper({
  currentKg,
  locale,
  submitting = false,
  onUpdate,
  onKeep,
}: Props) {
  const [value, setValue] = useState(currentKg !== null ? String(currentKg) : "");

  const parsed = Number(value);
  const canUpdate = Number.isFinite(parsed) && parsed > 0 && !submitting;

  return (
    <V2Card tone="accent" padding="var(--v2-s-4)" radius="var(--v2-r-2)">
      <div style={{ display: "grid", gap: "var(--v2-s-3)" }}>
        <div style={{ display: "grid", gap: "var(--v2-s-1)" }}>
          <p className="v2-label" style={{ color: "var(--v2-accent-ink)" }}>
            {locale === "ko" ? "중량풀업 · 체중 확인" : "Weighted pull-up · Bodyweight"}
          </p>
          <p className="v2-small" style={{ color: "var(--v2-ink-2)", maxWidth: "62ch" }}>
            {locale === "ko"
              ? "오늘 중량풀업이 있어요. 총중량(체중+추가)을 정확히 기록·추적하려면 오늘 체중을 확인하세요. 그대로면 유지하세요."
              : "Today includes weighted pull-ups. Confirm today's bodyweight for an accurate total-load record, or keep the current value."}
          </p>
        </div>

        <V2TextField
          size="sm"
          type="number"
          inputMode="decimal"
          icon="monitor_weight"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label={locale === "ko" ? "오늘 체중(kg)" : "Today's bodyweight (kg)"}
          trailing={<span className="v2-label" style={{ color: "var(--v2-ink-2)" }}>kg</span>}
        />

        <div style={{ display: "flex", gap: "var(--v2-s-2)", flexWrap: "wrap" }}>
          <V2PrimaryBtn
            icon="check"
            disabled={!canUpdate}
            onClick={() => {
              if (canUpdate) onUpdate(Math.round(parsed * 10) / 10);
            }}
          >
            {locale === "ko" ? "업데이트" : "Update"}
          </V2PrimaryBtn>
          <V2SecondaryBtn icon="do_not_disturb_on" onClick={onKeep}>
            {locale === "ko" ? "유지" : "Keep"}
          </V2SecondaryBtn>
        </div>
      </div>
    </V2Card>
  );
}

function BodyweightCheckBannerTerminal({
  currentKg,
  locale,
  submitting = false,
  onUpdate,
  onKeep,
}: Props) {
  const [value, setValue] = useState(currentKg !== null ? String(currentKg) : "");

  const parsed = Number(value);
  const canUpdate = Number.isFinite(parsed) && parsed > 0 && !submitting;

  const keyBtn = (active: boolean, enabled: boolean): CSSProperties => ({
    fontFamily: "var(--term-mono)",
    fontSize: "var(--v2-t-14)",
    minHeight: "var(--v2-touch)",
    padding: "0 var(--v2-s-3)",
    display: "inline-flex",
    alignItems: "center",
    background: active ? "var(--term-amber)" : "transparent",
    color: active ? "var(--term-bg)" : enabled ? "var(--term-amber)" : "var(--term-ghost)",
    boxShadow: active ? "none" : "inset 0 0 0 1px var(--term-line-box)",
    border: "none",
    cursor: enabled ? "pointer" : "not-allowed",
    whiteSpace: "nowrap",
  });

  return (
    <div
      style={{
        padding: "var(--v2-s-4)",
        background: "var(--term-panel)",
        boxShadow: "inset 0 0 0 1px var(--term-line-box)",
        display: "grid",
        gap: "var(--v2-s-3)",
      }}
    >
      <div style={{ display: "grid", gap: "var(--v2-s-1)" }}>
        <p className="v2-mono-label" style={{ color: "var(--term-amber)" }}>
          {locale === "ko" ? "‹ 중량풀업 · 체중 확인 ›" : "‹ weighted pull-up · bodyweight ›"}
        </p>
        <p
          className="v2-mono-label"
          style={{ color: "var(--term-dim)", maxWidth: "62ch", lineHeight: 1.5 }}
        >
          {locale === "ko"
            ? "오늘 중량풀업이 있어요. 총중량(체중+추가)을 정확히 기록·추적하려면 오늘 체중을 확인하세요. 그대로면 유지하세요."
            : "Today includes weighted pull-ups. Confirm today's bodyweight for an accurate total-load record, or keep the current value."}
        </p>
      </div>

      <div style={{ display: "flex", gap: "var(--v2-s-2)", alignItems: "center", flexWrap: "wrap" }}>
        <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>BW</span>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label={locale === "ko" ? "오늘 체중(kg)" : "Today's bodyweight (kg)"}
          style={{
            width: 88,
            minHeight: "var(--v2-touch)",
            padding: "0 var(--v2-s-2)",
            background: "var(--term-inset)",
            color: "var(--term-cyan)",
            border: "none",
            outline: "none",
            fontFamily: "var(--term-mono)",
            fontSize: "var(--v2-t-16)",
          }}
        />
        <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>kg</span>
        <button
          type="button"
          disabled={!canUpdate}
          onClick={() => {
            if (canUpdate) onUpdate(Math.round(parsed * 10) / 10);
          }}
          style={keyBtn(canUpdate, canUpdate)}
        >
          {locale === "ko" ? "[⏎ 업데이트]" : "[⏎ update]"}
        </button>
        <button type="button" onClick={onKeep} style={keyBtn(false, true)}>
          {locale === "ko" ? "[유지]" : "[keep]"}
        </button>
      </div>
    </div>
  );
}
