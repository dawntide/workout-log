import {
  V2Card,
  V2Chip,
  V2EmptyState,
  V2Stack,
} from "@/components/v2/primitives";
import { formatKg } from "@/features/plans-manage/model/plan-view";
import { buildRef5WindowProgressRows } from "@/features/ref5/model/window-progress";
import type { Ref5Status } from "@workout/core/program-engine/ref5-status";

import { PlanDetailRow } from "./detail-rows";
import type { LocaleKey } from "./view-types";

export function Ref5StatusPanel({
  status,
  locale,
  loading,
}: {
  status: Ref5Status | null;
  locale: LocaleKey;
  loading: boolean;
}) {
  if (!status) {
    return (
      <V2EmptyState
        icon={loading ? "hourglass_empty" : "sync_problem"}
        title={
          loading
            ? locale === "ko" ? "REF5 진행 상태를 불러오는 중..." : "Loading REF5 state..."
            : locale === "ko" ? "REF5 진행 상태를 불러오지 못했습니다." : "REF5 state is unavailable."
        }
        tone="inset"
      />
    );
  }

  const directStandards = [
    ["SQ H3", status.directStandardsKg.sqH3Kg],
    ["BP focus", status.directStandardsKg.bpFocusKg],
    ["PULL focus total", status.directStandardsKg.pullFocusTotalKg],
    ["DL", status.directStandardsKg.deadliftKg],
    ["OHP", status.directStandardsKg.ohpKg],
  ] as const;
  const derivedStandards = [
    ["SQ H2", status.derivedStandardsKg.sqH2Kg],
    ["SQ volume", status.derivedStandardsKg.sqVolumeKg],
    ["BP volume", status.derivedStandardsKg.bpVolumeKg],
    ["PULL volume total", status.derivedStandardsKg.pullVolumeTargetTotalKg],
  ] as const;
  const controlRefs = [
    ["SQ", status.controlRefsKg.sqKg],
    ["BP", status.controlRefsKg.bpKg],
    ["PULL total", status.controlRefsKg.pullTotalKg],
    ["DL", status.controlRefsKg.deadliftKg],
    ["OHP", status.controlRefsKg.ohpKg],
  ] as const;
  const auxiliaryCaps = [
    ["DL max", status.auxiliaryCapsKg.deadliftMaxKg],
    ["OHP max", status.auxiliaryCapsKg.ohpMaxKg],
  ] as const;
  const structureReviewLifts = (["SQ", "BP", "PULL"] as const).filter(
    (lift) => status.structureReview[lift],
  );
  const windowProgressRows = buildRef5WindowProgressRows(status, locale);

  return (
    <V2Card tone="inset" padding="var(--v2-s-4)" radius="var(--v2-r-2)">
      <V2Stack gap={4}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--v2-s-2)" }}>
          <strong className="v2-body" style={{ color: "var(--v2-ink)" }}>
            {locale === "ko" ? "REF5 적응 상태" : "REF5 adaptive state"}
          </strong>
          <V2Chip tone="info">v{status.protocolVersion}</V2Chip>
          <V2Chip tone="neutral">r{status.revision}</V2Chip>
          {status.pendingMicro.pending ? (
            <V2Chip tone="warning">{locale === "ko" ? "마이크로 세션 대기" : "Micro pending"}</V2Chip>
          ) : null}
          {structureReviewLifts.map((lift) => (
            <V2Chip key={lift} tone="danger">
              {locale === "ko" ? `${lift} 구조 재검토` : `${lift} structure review`}
            </V2Chip>
          ))}
        </div>

        <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-2)" }}>
          {locale === "ko"
            ? "REF5 런타임은 1RM/e1RM·TM이나 주차를 사용하지 않습니다. 아래 값은 완료 로그를 재생해 계산한 읽기 전용 상태입니다."
            : "REF5 runtime uses no 1RM/e1RM, TM, or cycle grid. These read-only values are rebuilt from the completion ledger."}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--v2-s-2)" }}>
          <PlanDetailRow label={locale === "ko" ? "다음 포커스" : "Next focus"} value={status.nextFocus} />
          <PlanDetailRow label={locale === "ko" ? "다음 스쿼트 하드" : "Next squat hard"} value={status.nextSquatHard} />
        </div>

        {status.pendingMicro.reasons.length > 0 ? (
          <p className="v2-small" style={{ margin: 0, color: "var(--v2-c-warning)" }}>
            {`${locale === "ko" ? "마이크로 사유" : "Micro reasons"}: ${status.pendingMicro.reasons.join(", ")}`}
          </p>
        ) : null}

        <V2Stack gap={2}>
          <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
            {locale === "ko" ? "진행 창" : "Progression windows"}
          </span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))", gap: "var(--v2-s-2)" }}>
            {windowProgressRows.map((row) => (
              <PlanDetailRow
                key={row.key}
                label={row.label}
                value={`${row.current}/${row.threshold} · ${locale === "ko" ? "판정 완료" : "judged"} ${row.completed}`}
              />
            ))}
          </div>
        </V2Stack>

        <V2Stack gap={2}>
          <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
            {locale === "ko" ? "직접 기준 / 파생 기준" : "Direct / derived standards"}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--v2-s-2)" }}>
            {[...directStandards, ...derivedStandards].map(([label, value]) => (
              <V2Chip key={label} tone="weight">{label} {formatKg(value)} kg</V2Chip>
            ))}
          </div>
        </V2Stack>

        <V2Stack gap={2}>
          <span className="v2-eyebrow" style={{ color: "var(--v2-ink-3)" }}>
            {locale === "ko" ? "제어 REF / 보조 상한" : "Control REFs / auxiliary caps"}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--v2-s-2)" }}>
            {controlRefs.map(([label, value]) => (
              <V2Chip key={`ref-${label}`} tone="neutral">REF {label} {formatKg(value)}</V2Chip>
            ))}
            {auxiliaryCaps.map(([label, value]) => (
              <V2Chip key={label} tone="accent">{label} {formatKg(value)} kg</V2Chip>
            ))}
          </div>
        </V2Stack>

        {status.pullLock ? (
          <p className="v2-small" style={{ margin: 0, color: "var(--v2-ink-2)" }}>
            {`PULL ${locale === "ko" ? "창 고정" : "window lock"} ${status.pullLock.windowId}: +${formatKg(status.pullLock.focusAddedKg)} / +${formatKg(status.pullLock.volumeAddedKg)} kg`}
          </p>
        ) : null}
      </V2Stack>
    </V2Card>
  );
}
