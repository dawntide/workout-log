"use client";

import { useState } from "react";
import { V2Card, V2PrimaryBtn, V2SecondaryBtn, V2TextField } from "@/components/v2/primitives";

type Locale = "ko" | "en";

// 하이브리드 "검증(AMRAP) 세션 진입 — 체중 확인" 안내.
// 풀업 AMRAP이 총중량으로 TM을 좌우하므로, 이 순간에만 체중 갱신/유지를 권고한다.
// 매번 입력시키지 않고 "유지"가 한 탭. presentational — 영속화/디스미스는 호출부가 담당.
export function BodyweightCheckBanner({
  currentKg,
  locale,
  submitting = false,
  onUpdate,
  onKeep,
}: {
  currentKg: number | null;
  locale: Locale;
  submitting?: boolean;
  onUpdate: (kg: number) => void;
  onKeep: () => void;
}) {
  const [value, setValue] = useState(currentKg !== null ? String(currentKg) : "");

  const parsed = Number(value);
  const canUpdate = Number.isFinite(parsed) && parsed > 0 && !submitting;

  return (
    <V2Card tone="accent" padding="var(--v2-s-4)" radius="var(--v2-r-2)">
      <div style={{ display: "grid", gap: "var(--v2-s-3)" }}>
        <div style={{ display: "grid", gap: "var(--v2-s-1)" }}>
          <p className="v2-label" style={{ color: "var(--v2-accent-ink)" }}>
            {locale === "ko" ? "검증 세션 · 체중 확인" : "Validation session · Bodyweight"}
          </p>
          <p className="v2-small" style={{ color: "var(--v2-ink-2)", maxWidth: "62ch" }}>
            {locale === "ko"
              ? "오늘은 풀업 AMRAP이 TM을 결정하는 검증 세션입니다. 총중량 추세가 정확하려면 오늘 체중을 확인하세요. 그대로면 유지하세요."
              : "Today's pull-up AMRAP drives your TM. Confirm today's bodyweight for an accurate total-load trend, or keep the current value."}
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
