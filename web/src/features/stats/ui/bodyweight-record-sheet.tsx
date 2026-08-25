"use client";

import { useEffect, useState } from "react";

import { useLocale } from "@/components/locale-provider";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import { V2PrimaryBtn, V2Stack } from "@/components/v2/primitives";

// 서버(bodyweight-service)와 같은 범위. 밖이면 오타로 보고 거부한다.
const MIN_KG = 20;
const MAX_KG = 500;

/** 서버 기본값과 어긋나는 값을 화면에 띄우지 않도록, 없으면 흔한 출발점을 쓴다. */
const FALLBACK_KG = 70;

function normalize(value: number) {
  return Math.round(Math.max(MIN_KG, Math.min(MAX_KG, value)) * 10) / 10;
}

/**
 * 체중 기록 시트. 날짜는 받지 않는다 — "지금" 기록이 기본이고, 같은 시각 재기록은
 * 서버가 덮어쓰므로 별도 수정 UI 없이 고쳐 적기가 성립한다(계획서 §7-4).
 */
export function BodyweightRecordSheet({
  open,
  onClose,
  currentKg,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  currentKg: number | null;
  onSubmit: (valueKg: number) => Promise<void>;
}) {
  const { locale } = useLocale();
  const ko = locale === "ko";
  const [draft, setDraft] = useState(() => normalize(currentKg ?? FALLBACK_KG));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 시트를 열 때마다 최신값에서 출발한다 — 닫았다 열면 이전 draft가 남아 있으면 안 된다.
  useEffect(() => {
    if (!open) return;
    setDraft(normalize(currentKg ?? FALLBACK_KG));
    setError(null);
  }, [open, currentKg]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(normalize(draft));
      onClose();
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : ko
            ? "저장하지 못했습니다."
            : "Failed to save.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={ko ? "체중 기록" : "Record bodyweight"}
      description={ko ? "지금 시각으로 기록합니다" : "Recorded at the current time"}
      closeLabel={ko ? "닫기" : "Close"}
    >
      <V2Stack gap={4}>
        <V2Stack gap={1}>
          <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
            {ko ? "체중 (kg)" : "Bodyweight (kg)"}
          </span>
          <NumberKeypadField
            value={draft}
            min={MIN_KG}
            max={MAX_KG}
            onChange={setDraft}
            allowDecimal
            decimals={1}
            ariaLabel={ko ? "체중 kg" : "Bodyweight kg"}
          />
        </V2Stack>

        {error ? (
          <p className="v2-small" role="alert" style={{ color: "var(--v2-c-danger)" }}>
            {error}
          </p>
        ) : null}

        <V2PrimaryBtn onClick={submit} disabled={submitting}>
          {submitting ? (ko ? "저장 중…" : "Saving…") : ko ? "기록" : "Record"}
        </V2PrimaryBtn>
      </V2Stack>
    </BottomSheet>
  );
}
