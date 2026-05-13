import type { CSSProperties } from "react";

// PERF: 스토어 라우트 loading.tsx - 라우트 전환 시 즉각 피드백
const skeletonStyle: CSSProperties = {
  background: "linear-gradient(90deg, var(--v2-paper-2) 0%, var(--v2-paper-3) 50%, var(--v2-paper-2) 100%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-shimmer 1.4s ease infinite",
  borderRadius: 8,
};

export default function ProgramStoreLoading() {
  return (
    <div>
      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Search Input Skeleton */}
      <div style={{ ...skeletonStyle, height: 48, borderRadius: 12, marginBottom: "var(--v2-s-4)" }} />

      {/* 공식 프로그램 섹션 스켈레톤 */}
      <div>
        <div style={{ ...skeletonStyle, height: 22, width: "35%", marginBottom: "var(--v2-s-2)" }} />
        <div style={{ ...skeletonStyle, height: 14, width: "65%", borderRadius: 4, marginBottom: "var(--v2-s-4)" }} />

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: "var(--v2-paper)",
                borderRadius: 16,
                padding: "var(--v2-s-5)",
                marginBottom: "var(--v2-s-4)",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--v2-s-2)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...skeletonStyle, height: 14, width: 44, borderRadius: 4, marginBottom: 8 }} />
                  <div style={{ ...skeletonStyle, height: 24, width: "70%", borderRadius: 6, marginBottom: 8 }} />
                  <div style={{ ...skeletonStyle, height: 14, width: "50%", borderRadius: 4 }} />
                </div>
                <div style={{ display: "flex", gap: 4, marginLeft: "var(--v2-s-2)" }}>
                  <div style={{ ...skeletonStyle, height: 20, width: 40, borderRadius: 10 }} />
                  <div style={{ ...skeletonStyle, height: 20, width: 50, borderRadius: 10 }} />
                </div>
              </div>

              {/* Description */}
              <div style={{ ...skeletonStyle, height: 13, width: "85%", marginBottom: 6, borderRadius: 4 }} />
              <div style={{ ...skeletonStyle, height: 13, width: "40%", marginBottom: "var(--v2-s-2)", borderRadius: 4 }} />

              {/* Meta items */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--v2-s-4)", marginBottom: "var(--v2-s-4)", background: "var(--v2-paper)", padding: "var(--v2-s-2) var(--v2-s-4)", borderRadius: 10 }}>
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ ...skeletonStyle, height: 10, width: 30, borderRadius: 2 }} />
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <div style={{ ...skeletonStyle, height: 14, width: 14, borderRadius: "50%" }} />
                      <div style={{ ...skeletonStyle, height: 14, width: 40, borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Intensity bar + CTA */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--v2-s-2)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ ...skeletonStyle, height: 10, width: 40, borderRadius: 2, marginBottom: 6 }} />
                  <div style={{ display: "flex", gap: 3 }}>
                    {[1, 2, 3, 4, 5].map((_, barIdx) => (
                      <div key={barIdx} style={{ ...skeletonStyle, height: 6, flex: 1, borderRadius: 9999 }} />
                    ))}
                  </div>
                </div>
                <div style={{ ...skeletonStyle, height: 38, width: 80, borderRadius: 10, flexShrink: 0 }} />
              </div>

            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
