import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { useLocale } from "@/components/locale-provider";
import { NumberKeypadField } from "@/components/ui/number-keypad-field";
import { V2NavRow, V2PrimaryBtn, V2Stack } from "@/components/v2/primitives";
import { createPersistServerSetting } from "@/lib/settings/settings-api";
import { useSettingRowMutation } from "@/lib/settings/use-setting-row-mutation";
import { SETTINGS_KEYS } from "@/lib/settings/workout-preferences";
import type { SettingsSnapshot } from "@/server/services/settings/get-settings-snapshot";

const MIN_BODYWEIGHT_KG = 20;
const MAX_BODYWEIGHT_KG = 300;
const DEFAULT_BODYWEIGHT_KG = 70;

function normalizeBodyweightKg(value: number) {
  const clipped = Math.max(
    MIN_BODYWEIGHT_KG,
    Math.min(MAX_BODYWEIGHT_KG, value),
  );
  return Math.round(clipped * 10) / 10;
}

/** label(eyebrow)을 위, iOS 키패드 입력을 아래로 쌓는 래퍼. 운동 기록/최소 원판 화면과 동일한 패턴. */
function LabeledKeypadField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <V2Stack gap={1}>
      <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
        {label}
      </span>
      {children}
    </V2Stack>
  );
}

/** 체중 행. 다른 설정 행과 달리 draft를 두고 명시적 저장 버튼을 누를 때만 커밋한다. */
export function BodyweightRow({
  snapshot,
  expanded,
  onToggle,
}: {
  snapshot: SettingsSnapshot | null;
  expanded: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { locale } = useLocale();
  const serverKg = (() => {
    const raw = snapshot?.[SETTINGS_KEYS.bodyweightKg];
    const parsed = Number(raw);
    return normalizeBodyweightKg(
      Number.isFinite(parsed) ? parsed : DEFAULT_BODYWEIGHT_KG,
    );
  })();

  const bodyweight = useSettingRowMutation<number>({
    key: SETTINGS_KEYS.bodyweightKg,
    fallbackValue: DEFAULT_BODYWEIGHT_KG,
    serverValue: serverKg,
    persistServer: createPersistServerSetting<number>(),
    successMessage:
      locale === "ko" ? "몸무게를 저장했습니다." : "Saved bodyweight.",
    rollbackNotice:
      locale === "ko"
        ? "몸무게 저장에 실패했습니다."
        : "Failed to save bodyweight.",
  });

  const [draft, setDraft] = useState(normalizeBodyweightKg(bodyweight.value));

  useEffect(() => {
    if (bodyweight.pending) return;
    setDraft(normalizeBodyweightKg(bodyweight.value));
  }, [bodyweight.pending, bodyweight.value]);

  const normalizedDraft = normalizeBodyweightKg(draft);
  const canSave =
    !bodyweight.pending &&
    normalizedDraft !== normalizeBodyweightKg(bodyweight.value);

  return (
    <V2NavRow
      icon="monitor_weight"
      label={locale === "ko" ? "체중" : "Bodyweight"}
      value={`${normalizeBodyweightKg(bodyweight.value).toFixed(1)} kg`}
      expandable
      expanded={expanded}
      onExpandedChange={onToggle}
      expandedContent={
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--v2-s-2)",
          }}
        >
          <LabeledKeypadField label={locale === "ko" ? "체중 (kg)" : "Bodyweight (kg)"}>
            <NumberKeypadField
              ariaLabel={locale === "ko" ? "체중 (kg)" : "Bodyweight (kg)"}
              value={draft}
              min={MIN_BODYWEIGHT_KG}
              max={MAX_BODYWEIGHT_KG}
              allowDecimal
              step={0.1}
              onChange={(next) => setDraft(normalizeBodyweightKg(next))}
            />
          </LabeledKeypadField>
          <V2PrimaryBtn
            full
            disabled={!canSave}
            onClick={() => {
              void bodyweight.commit(normalizedDraft);
            }}
          >
            {bodyweight.pending
              ? locale === "ko"
                ? "저장 중..."
                : "Saving..."
              : locale === "ko"
                ? "체중 저장"
                : "Save bodyweight"}
          </V2PrimaryBtn>
          <p className="v2-small" style={{ color: "var(--v2-ink-3)" }}>
            {locale === "ko"
              ? "풀업 등 체중 기반 운동의 총 부하 계산에 사용됩니다."
              : "Used for total-load calculations on bodyweight-based exercises like pull-ups."}
          </p>
        </div>
      }
    />
  );
}
