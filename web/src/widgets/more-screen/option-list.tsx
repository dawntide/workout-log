/** 라디오 스타일 선택 목록 — 테마·언어·운동 목적 행이 공유한다. */
export function OptionList<T extends string>({
  options,
  selected,
  onSelect,
  disabled,
}: {
  options: Array<{ value: T; label: string }>;
  selected: T;
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--v2-s-1)",
      }}
      role="radiogroup"
    >
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onSelect(option.value)}
            className="v2-pressable v2-font-display"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "var(--v2-s-3) var(--v2-s-3)",
              minHeight: "var(--v2-s-8)",
              background: active ? "var(--v2-accent-weak)" : "transparent",
              color: active ? "var(--v2-accent-ink)" : "var(--v2-ink)",
              border: "none",
              borderRadius: "var(--v2-r-2)",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
              fontSize: "var(--v2-t-14)",
              fontWeight: 600,
              textAlign: "left",
            }}
          >
            <span>{option.label}</span>
            {active ? (
              <span
                className="material-symbols-outlined"
                style={{
                  fontSize: "var(--v2-t-18)",
                  color: "var(--v2-accent)",
                  fontVariationSettings: "'FILL' 1, 'wght' 600",
                }}
                aria-hidden
              >
                check
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
