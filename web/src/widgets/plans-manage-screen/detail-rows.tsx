import { V2Card, V2Stack } from "@/components/v2/primitives";

/** 라벨 + 값(+주석) 읽기 전용 행. 시트 상단 정보 그리드와 REF5 패널이 공유한다. */
export function PlanDetailRow({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <V2Card tone="inset" padding="var(--v2-s-3) var(--v2-s-4)" radius="var(--v2-r-2)">
      <p className="v2-eyebrow" style={{ margin: 0, color: "var(--v2-ink-3)" }}>
        {label}
      </p>
      <p
        className="v2-body"
        style={{
          margin: 0,
          marginTop: "var(--v2-s-1)",
          color: "var(--v2-ink)",
          wordBreak: "break-word",
        }}
      >
        {value}
      </p>
      {note ? (
        <p
          className="v2-small"
          style={{
            margin: 0,
            marginTop: "var(--v2-s-2)",
            color: "var(--v2-ink-2)",
            wordBreak: "break-word",
          }}
        >
          {note}
        </p>
      ) : null}
    </V2Card>
  );
}

/** 한 타깃(운동)의 입력 필드들을 묶는 카드. */
export function StrengthEditRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <V2Card tone="inset" padding="var(--v2-s-3) var(--v2-s-4)" radius="var(--v2-r-2)">
      <V2Stack gap={3}>
        <strong
          className="v2-body"
          style={{ color: "var(--v2-ink)", fontWeight: 700 }}
        >
          {label}
        </strong>
        {children}
      </V2Stack>
    </V2Card>
  );
}

/** 라벨 + 입력 컨트롤 한 쌍. */
export function StrengthEditField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <V2Stack gap={1}>
      <span
        className="v2-eyebrow"
        style={{ color: "var(--v2-ink-3)" }}
      >
        {label}
      </span>
      {children}
    </V2Stack>
  );
}

/** 입력 필드를 자동 폭으로 흘리는 공용 그리드(최소 140px). */
export function StrengthFieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: "var(--v2-s-3)",
      }}
    >
      {children}
    </div>
  );
}
