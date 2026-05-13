"use client";

import { useLocale } from "@/components/locale-provider";
import { V2Card } from "@/components/v2/primitives";
import { BottomSheet } from "./bottom-sheet";

export type FailureProtocolChoice = "cancel" | "hold" | "reset" | "increase";

type FailureProtocolSheetProps = {
  open: boolean;
  title: string;
  message: string;
  /** block-completion: Operator 블록 완료 / greyskull-reset: Greyskull 리셋 기준 도달 */
  mode: "block-completion" | "greyskull-reset";
  onSelect: (choice: FailureProtocolChoice) => void;
};

export function FailureProtocolSheet({
  open,
  title,
  message,
  mode,
  onSelect,
}: FailureProtocolSheetProps) {
  const { locale } = useLocale();
  const isBlockCompletion = mode === "block-completion";

  return (
    <BottomSheet
      open={open}
      title={title}
      description=""
      onClose={() => onSelect("cancel")}
      closeLabel={locale === "ko" ? "닫기" : "Close"}
      footer={
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-xs)",
            width: "100%",
          }}
        >
          {isBlockCompletion ? (
            <>
              <button type="button" className="btn btn-primary btn-full" onClick={() => onSelect("increase")}>
                {locale === "ko" ? "증량하여 저장" : "Increase and Save"}
              </button>
              <button type="button" className="btn btn-secondary btn-full" onClick={() => onSelect("hold")}>
                {locale === "ko" ? "유지하여 저장" : "Keep and Save"}
              </button>
              <button type="button" className="btn btn-danger btn-full" onClick={() => onSelect("reset")}>
                {locale === "ko" ? "감소하여 저장" : "Reduce and Save"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-danger btn-full" onClick={() => onSelect("reset")}>
                {locale === "ko" ? "감소 적용하여 저장" : "Apply Reduction and Save"}
              </button>
              <button type="button" className="btn btn-secondary btn-full" onClick={() => onSelect("hold")}>
                {locale === "ko" ? "무게 유지하여 저장" : "Keep Weight and Save"}
              </button>
              <button type="button" className="btn btn-secondary btn-full" onClick={() => onSelect("increase")}>
                {locale === "ko" ? "무게 증가하여 저장" : "Increase Weight and Save"}
              </button>
            </>
          )}
          <button type="button" className="btn btn-secondary btn-full" onClick={() => onSelect("cancel")}>
            {locale === "ko" ? "취소" : "Cancel"}
          </button>
        </div>
      }
    >
      <V2Card
        tone={mode === "greyskull-reset" ? "danger" : "inset"}
        padding="var(--v2-s-4)"
      >
        <p className="v2-body" style={{ whiteSpace: "pre-line", margin: 0 }}>
          {message}
        </p>
      </V2Card>
    </BottomSheet>
  );
}
