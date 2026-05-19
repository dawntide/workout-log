// PERF: 플랜 관리 라우트 loading.tsx — V2 primitive 기반 hero/카드 구조에 맞춘 스켈레톤.
const skeletonStyle: React.CSSProperties = {
  background:
    "linear-gradient(90deg, var(--v2-paper) 0%, var(--v2-paper-3) 50%, var(--v2-paper) 100%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-shimmer 1.4s ease infinite",
  borderRadius: "var(--v2-r-1)",
};

export default function PlansManageLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-5)" }}>
      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* ── Hero ── */}
      <div
        style={{
          padding: "var(--v2-s-5)",
          borderRadius: "var(--v2-r-3)",
          background: "var(--v2-paper)",
          boxShadow: "var(--v2-elev-1)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-4)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
          <div style={{ ...skeletonStyle, height: 12, width: 120, borderRadius: "var(--v2-r-0)" }} />
          <div style={{ ...skeletonStyle, height: 28, width: 160, borderRadius: "var(--v2-r-0)" }} />
          <div style={{ ...skeletonStyle, height: 13, width: "70%", borderRadius: "var(--v2-r-0)" }} />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "var(--v2-s-2)",
          }}
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: "var(--v2-paper)",
                boxShadow: "var(--v2-elev-1)",
                borderRadius: "var(--v2-r-3)",
                padding: "var(--v2-s-4)",
              }}
            >
              <div style={{ ...skeletonStyle, height: 10, width: "70%", marginBottom: 6, borderRadius: "var(--v2-r-0)" }} />
              <div style={{ ...skeletonStyle, height: 22, width: "50%", borderRadius: "var(--v2-r-0)" }} />
            </div>
          ))}
        </div>
        <div style={{ ...skeletonStyle, height: 44, borderRadius: "var(--v2-r-3)" }} />
      </div>

      {/* ── Filter / Search ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-3)" }}>
        <div style={{ ...skeletonStyle, height: 36, borderRadius: "var(--v2-r-pill)" }} />
        <div style={{ ...skeletonStyle, height: 48, borderRadius: "var(--v2-r-2)" }} />
      </div>

      {/* ── Plan Cards ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-3)" }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: "var(--v2-paper)",
              borderRadius: "var(--v2-r-3)",
              boxShadow: "var(--v2-elev-1)",
              padding: "var(--v2-s-5)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--v2-s-4)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}>
              <div style={{ display: "flex", gap: "var(--v2-s-1)" }}>
                <div style={{ ...skeletonStyle, height: 22, width: 70, borderRadius: "var(--v2-r-pill)" }} />
                <div style={{ ...skeletonStyle, height: 22, width: 70, borderRadius: "var(--v2-r-pill)" }} />
              </div>
              <div style={{ ...skeletonStyle, height: 22, width: "55%", borderRadius: "var(--v2-r-0)" }} />
              <div style={{ ...skeletonStyle, height: 13, width: "40%", borderRadius: "var(--v2-r-0)" }} />
              <div style={{ ...skeletonStyle, height: 12, width: "30%", borderRadius: "var(--v2-r-0)" }} />
            </div>

            {/* TM grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: "var(--v2-s-2)",
                padding: "var(--v2-s-3)",
                borderRadius: "var(--v2-r-2)",
                background: "var(--v2-paper-2)",
              }}
            >
              {Array.from({ length: 4 }).map((_, j) => (
                <div
                  key={j}
                  style={{
                    padding: "var(--v2-s-2) var(--v2-s-3)",
                    background: "var(--v2-paper)",
                    borderRadius: "var(--v2-r-1)",
                  }}
                >
                  <div style={{ ...skeletonStyle, height: 10, width: "70%", marginBottom: 4, borderRadius: "var(--v2-r-0)" }} />
                  <div style={{ ...skeletonStyle, height: 14, width: "60%", borderRadius: "var(--v2-r-0)" }} />
                </div>
              ))}
            </div>

            {/* Action */}
            <div style={{ ...skeletonStyle, height: 44, borderRadius: "var(--v2-r-3)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
