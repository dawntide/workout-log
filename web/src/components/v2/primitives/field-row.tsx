"use client";

export function V2FieldRow({
  label,
  unit,
  value,
  color,
  active,
  onSelect,
  small = false,
}: {
  label: string;
  unit?: string;
  value: string;
  color: string;
  active: boolean;
  onSelect: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        cursor: "pointer",
        padding: "4px 0",
        opacity: active ? 1 : 0.5,
        background: "transparent",
        border: "none",
        width: "100%",
        textAlign: "left",
        transition: "opacity var(--v2-d-1) var(--v2-e-out)",
      }}
      aria-pressed={active}
    >
      <span
        className="v2-label"
        style={{ color: active ? color : "var(--v2-ink-3)" }}
      >
        {label}
      </span>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
        <span
          className={small ? "v2-num-md" : "v2-num-lg"}
          style={{ color, fontSize: small ? 32 : 56 }}
        >
          {value}
        </span>
        {unit && (
          <span className="v2-h3" style={{ color: "var(--v2-ink-3)" }}>
            {unit}
          </span>
        )}
      </span>
    </button>
  );
}
