// PERF: 플랜 관리 라우트 loading.tsx — 새 hero + plan-card-v2 형태에 맞춘 스켈레톤
const skeletonStyle: React.CSSProperties = {
  background:
    "linear-gradient(90deg, var(--v2-paper) 0%, var(--v2-paper-3) 50%, var(--v2-paper) 100%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-shimmer 1.4s ease infinite",
  borderRadius: 8,
};

export default function PlansManageLoading() {
  return (
    <div>
      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* ── Hero ── */}
      <section>
        <div
          style={{
            padding: "22px 22px 24px",
            borderRadius: 24,
            background: "var(--v2-paper)",
            marginBottom: "var(--v2-s-4)",
          }}
        >
          <div style={{ ...skeletonStyle, height: 12, width: 120, marginBottom: 8, borderRadius: 4 }} />
          <div style={{ ...skeletonStyle, height: 28, width: 160, marginBottom: 6, borderRadius: 6 }} />
          <div style={{ ...skeletonStyle, height: 13, width: "70%", marginBottom: 18, borderRadius: 4 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ background: "var(--v2-paper-2)", borderRadius: 14, padding: "12px 12px 14px" }}>
                <div style={{ ...skeletonStyle, height: 10, width: "70%", marginBottom: 6, borderRadius: 4 }} />
                <div style={{ ...skeletonStyle, height: 22, width: "50%", borderRadius: 4 }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        {/* ── Search ── */}
        <div style={{ marginBottom: "var(--v2-s-4)" }}>
          <div style={{ ...skeletonStyle, height: 48, borderRadius: 12 }} />
        </div>

        {/* ── Plan Cards ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: "var(--v2-paper)",
                borderRadius: 18,
                padding: "18px 18px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <div style={{ ...skeletonStyle, height: 18, width: 70, borderRadius: 999 }} />
                  <div style={{ ...skeletonStyle, height: 18, width: 70, borderRadius: 999 }} />
                </div>
                <div style={{ ...skeletonStyle, height: 22, width: "55%", borderRadius: 6 }} />
                <div style={{ ...skeletonStyle, height: 13, width: "40%", borderRadius: 4 }} />
                <div style={{ ...skeletonStyle, height: 12, width: "30%", marginTop: 4, borderRadius: 4 }} />
              </div>

              {/* TM grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 6,
                  padding: 10,
                  borderRadius: 12,
                  background: "var(--v2-paper-2)",
                }}
              >
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} style={{ padding: "6px 8px", background: "var(--v2-paper)", borderRadius: 10 }}>
                    <div style={{ ...skeletonStyle, height: 10, width: "70%", marginBottom: 4, borderRadius: 4 }} />
                    <div style={{ ...skeletonStyle, height: 14, width: "60%", borderRadius: 4 }} />
                  </div>
                ))}
              </div>

              {/* actions */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <div style={{ ...skeletonStyle, height: 42, borderRadius: 12 }} />
                <div style={{ ...skeletonStyle, height: 42, width: 110, borderRadius: 12 }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
