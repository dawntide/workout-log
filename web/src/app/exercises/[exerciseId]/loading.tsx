// PERF: 운동 상세 라우트 loading.tsx - 페이지 진입 시 즉각 피드백
const skeletonStyle: React.CSSProperties = {
  background:
    "linear-gradient(90deg, var(--v2-paper-2) 0%, var(--v2-paper-3) 50%, var(--v2-paper-2) 100%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-shimmer 1.4s ease infinite",
  borderRadius: "var(--v2-r-1)",
};

export default function ExerciseDetailLoading() {
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

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ ...skeletonStyle, height: 36, width: "55%", borderRadius: "var(--v2-r-0)" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ ...skeletonStyle, height: 22, width: 84, borderRadius: "var(--v2-r-pill)" }} />
              <div style={{ ...skeletonStyle, height: 22, width: 100, borderRadius: "var(--v2-r-pill)" }} />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(144px, 1fr))",
              gap: "var(--v2-s-3)",
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                style={{
                  minHeight: 132,
                  borderRadius: "var(--v2-r-1)",
                  padding: 16,
                  background: "var(--v2-paper)",
                  boxShadow: "var(--v2-elev-1)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ ...skeletonStyle, height: 12, width: "50%", borderRadius: "var(--v2-r-0)" }} />
                <div>
                  <div style={{ ...skeletonStyle, height: 34, width: "58%", borderRadius: "var(--v2-r-0)" }} />
                  <div style={{ ...skeletonStyle, height: 14, width: "70%", marginTop: 8, borderRadius: "var(--v2-r-0)" }} />
                </div>
              </div>
            ))}
          </div>
        </header>

        <section style={{ display: "grid", gap: "var(--v2-s-3)" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ ...skeletonStyle, height: 12, width: "25%", borderRadius: "var(--v2-r-0)" }} />
            <div style={{ ...skeletonStyle, height: 24, width: "45%", borderRadius: "var(--v2-r-0)" }} />
            <div style={{ ...skeletonStyle, height: 16, width: "65%", borderRadius: "var(--v2-r-0)" }} />
          </div>
          <div
            style={{
              borderRadius: "var(--v2-r-1)",
              padding: "var(--v2-s-3)",
              background: "var(--v2-paper-2)",
            }}
          >
            <div style={{ ...skeletonStyle, height: 280, width: "100%", borderRadius: "var(--v2-r-1)" }} />
          </div>
        </section>

        <section style={{ display: "grid", gap: "var(--v2-s-3)" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ ...skeletonStyle, height: 12, width: "30%", borderRadius: "var(--v2-r-0)" }} />
            <div style={{ ...skeletonStyle, height: 24, width: "40%", borderRadius: "var(--v2-r-0)" }} />
            <div style={{ ...skeletonStyle, height: 16, width: "70%", borderRadius: "var(--v2-r-0)" }} />
          </div>
          <div style={{ height: 1, background: "var(--v2-hairline)" }} />
          <div style={{ display: "grid", gap: 8 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
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
                <div style={{ ...skeletonStyle, height: 24, width: 48, borderRadius: "var(--v2-r-pill)" }} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
