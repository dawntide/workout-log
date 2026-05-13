// PERF: 플랜 히스토리 라우트 loading.tsx — 새 hero + tab strip + log timeline 형태에 맞춘 스켈레톤
const skeletonStyle: React.CSSProperties = {
  background:
    "linear-gradient(90deg, var(--v2-paper-2) 0%, var(--v2-paper-3) 50%, var(--v2-paper-2) 100%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-shimmer 1.4s ease infinite",
  borderRadius: 8,
};

export default function PlanHistoryLoading() {
  return (
    <div>
      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* ── Hero header ── */}
      <section>
        <div
          style={{
            padding: "22px 22px 24px",
            borderRadius: 24,
            background: "var(--v2-paper)",
            marginBottom: "var(--v2-s-4)",
          }}
        >
          <div style={{ ...skeletonStyle, height: 12, width: 100, marginBottom: 8, borderRadius: 4 }} />
          <div style={{ ...skeletonStyle, height: 28, width: 180, marginBottom: 6, borderRadius: 6 }} />
          <div style={{ ...skeletonStyle, height: 13, width: "75%", borderRadius: 4 }} />
        </div>

        {/* ── Plan tab strip ── */}
        <div style={{ display: "flex", gap: 8, padding: "4px 4px 12px", overflow: "hidden" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: "0 0 auto",
                padding: "10px 16px",
                borderRadius: 14,
                background: "var(--v2-paper)",
                minHeight: 52,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <div style={{ ...skeletonStyle, height: 13, width: 80, borderRadius: 4 }} />
              <div style={{ ...skeletonStyle, height: 10, width: 50, borderRadius: 4 }} />
            </div>
          ))}
        </div>

        {/* ── Summary card ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
            padding: "16px 18px",
            borderRadius: 24,
            background: "var(--v2-paper)",
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ padding: "0 12px" }}>
              <div style={{ ...skeletonStyle, height: 10, width: "60%", marginBottom: 6, borderRadius: 4 }} />
              <div style={{ ...skeletonStyle, height: 17, width: "70%", borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </section>

      {/* ── Logs Section ── */}
      <section style={{ marginTop: "var(--v2-s-5)" }}>
        <div style={{ ...skeletonStyle, height: 24, width: 110, marginBottom: 14, borderRadius: 999 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <article
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "56px 1fr",
                gap: 14,
                padding: 14,
                borderRadius: 16,
                background: "var(--v2-paper)",
              }}
            >
              {/* date box */}
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  background: "var(--v2-paper-2)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                }}
              >
                <div style={{ ...skeletonStyle, height: 9, width: 24, borderRadius: 4 }} />
                <div style={{ ...skeletonStyle, height: 18, width: 24, borderRadius: 4 }} />
                <div style={{ ...skeletonStyle, height: 10, width: 18, borderRadius: 4 }} />
              </div>

              {/* body */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                <div style={{ ...skeletonStyle, height: 15, width: "70%", borderRadius: 4 }} />
                <div style={{ display: "flex", gap: 4 }}>
                  <div style={{ ...skeletonStyle, height: 18, width: 60, borderRadius: 999 }} />
                  <div style={{ ...skeletonStyle, height: 18, width: 80, borderRadius: 999 }} />
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 12,
                    background: "var(--v2-paper-2)",
                  }}
                >
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ ...skeletonStyle, height: 9, width: "60%", borderRadius: 4 }} />
                      <div style={{ ...skeletonStyle, height: 15, width: "55%", borderRadius: 4 }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ ...skeletonStyle, height: 36, width: 100, borderRadius: 999 }} />
                  <div style={{ ...skeletonStyle, height: 36, width: 90, borderRadius: 999 }} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
