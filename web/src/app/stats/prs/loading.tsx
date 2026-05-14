// PERF: PR 이력 라우트 loading.tsx
const skeletonStyle: React.CSSProperties = {
  background:
    "linear-gradient(90deg, var(--v2-paper-2) 0%, var(--v2-paper-3) 50%, var(--v2-paper-2) 100%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-shimmer 1.4s ease infinite",
  borderRadius: "var(--v2-r-1)",
};

export default function PrHistoryLoading() {
  return (
    <div>
      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div style={{ display: "grid", gap: "var(--v2-s-5)", paddingBottom: "var(--v2-s-8)" }}>
        <header style={{ display: "grid", gap: "var(--v2-s-4)", paddingTop: "var(--v2-s-2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ ...skeletonStyle, width: 36, height: 36, borderRadius: "50%" }} />
            <div style={{ ...skeletonStyle, height: 12, width: 80, borderRadius: "var(--v2-r-0)" }} />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ ...skeletonStyle, height: 36, width: "55%", borderRadius: "var(--v2-r-0)" }} />
            <div style={{ ...skeletonStyle, height: 16, width: "78%", borderRadius: "var(--v2-r-0)" }} />
            <div style={{ ...skeletonStyle, height: 12, width: "30%", borderRadius: "var(--v2-r-0)" }} />
          </div>
        </header>

        <section style={{ display: "grid", gap: "var(--v2-s-3)" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={`days-${i}`}
                style={{ ...skeletonStyle, height: 32, width: 60, borderRadius: "var(--v2-r-pill)" }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={`ex-${i}`}
                style={{ ...skeletonStyle, height: 32, width: 96, borderRadius: "var(--v2-r-pill)" }}
              />
            ))}
          </div>
        </section>

        <div style={{ height: 1, background: "var(--v2-hairline)" }} />

        <section style={{ display: "grid", gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto auto",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                borderRadius: "var(--v2-r-1)",
                background: "var(--v2-paper)",
                boxShadow: "var(--v2-elev-1)",
              }}
            >
              <div>
                <div style={{ ...skeletonStyle, height: 16, width: "55%" }} />
                <div style={{ ...skeletonStyle, height: 14, width: "72%", marginTop: 8, borderRadius: "var(--v2-r-0)" }} />
              </div>
              <div style={{ ...skeletonStyle, height: 24, width: 62, borderRadius: "var(--v2-r-pill)" }} />
              <div style={{ ...skeletonStyle, height: 18, width: 18, borderRadius: "50%" }} />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
