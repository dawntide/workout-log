export function V2DotsLoader({
  size = 6,
  label = "Loading",
}: {
  size?: number;
  label?: string;
}) {
  const dotStyle = {
    width: size,
    height: size,
    borderRadius: "50%",
    background: "var(--v2-paper-4)",
    display: "inline-block",
    animation: "v2-dot-bounce 1.2s infinite ease-in-out",
  } as const;

  return (
    <>
      <span
        role="status"
        aria-live="polite"
        aria-label={label}
        className="v2-dots-loader"
        style={{
          display: "inline-flex",
          gap: size,
          padding: "var(--v2-s-4)",
        }}
      >
        <span style={{ ...dotStyle, animationDelay: "0s" }} aria-hidden />
        <span style={{ ...dotStyle, animationDelay: "0.15s" }} aria-hidden />
        <span style={{ ...dotStyle, animationDelay: "0.3s" }} aria-hidden />
      </span>
    </>
  );
}
