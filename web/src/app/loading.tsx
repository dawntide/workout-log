import type { CSSProperties } from "react";

// PERF: 홈 라우트 loading.tsx - 라우트 전환 시 즉각 피드백
const skeletonStyle: CSSProperties = {
  background: "linear-gradient(90deg, var(--v2-paper-2) 0%, var(--v2-paper-3) 50%, var(--v2-paper-2) 100%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-shimmer 1.4s ease infinite",
  borderRadius: "var(--v2-r-1)",
};

export default function HomeLoading() {
  return (
    <div className="hd-root" style={{ width: "100%" }}>
      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* ── Welcome Header ── */}
      <section className="hd-welcome">
        <div style={{ ...skeletonStyle, height: 14, width: "30%", marginBottom: "6px", borderRadius: "var(--v2-r-0)" }} />
        <div style={{ ...skeletonStyle, height: 28, width: "50%", borderRadius: "var(--v2-r-0)" }} />
      </section>

      {/* ── Today Protocol Card ── */}
      <section className="hd-section">
        <div className="hd-section__header">
          <div style={{ ...skeletonStyle, height: 16, width: "40%", borderRadius: "var(--v2-r-0)" }} />
        </div>
        <div className="hd-protocol inner-shadow-false" style={{ background: "var(--v2-paper)" }}>
          <div className="hd-protocol__inner" style={{ paddingTop: 24, paddingBottom: 24 }}>
            <div style={{ ...skeletonStyle, height: 12, width: "30%", marginBottom: 8, borderRadius: "var(--v2-r-0)" }} />
            <div style={{ ...skeletonStyle, height: 24, width: "70%", marginBottom: 24, borderRadius: "var(--v2-r-0)" }} />
            
            <div className="hd-protocol__progress">
               <div style={{ ...skeletonStyle, height: 12, width: "100%", borderRadius: "var(--v2-r-0)", marginBottom: 8 }} />
               <div style={{ ...skeletonStyle, height: 6, width: "100%", borderRadius: "var(--v2-r-0)" }} />
            </div>

            <div className="hd-protocol__week-dots" style={{ marginBottom: 24, marginTop: 12 }}>
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="hd-protocol__week-day">
                  <div style={{ ...skeletonStyle, height: 12, width: 20, borderRadius: 2 }} />
                  <div style={{ ...skeletonStyle, height: 8, width: 8, borderRadius: "50%", marginTop: 4 }} />
                </div>
              ))}
            </div>

            <div style={{ ...skeletonStyle, height: 50, width: "100%", borderRadius: "var(--v2-r-2)" }} />
          </div>
        </div>
      </section>

      {/* ── Last Entry Bento ── */}
      <section className="hd-section">
        <div className="hd-section__header">
          <div style={{ ...skeletonStyle, height: 16, width: "35%", borderRadius: "var(--v2-r-0)" }} />
          <div style={{ ...skeletonStyle, height: 12, width: "20%", borderRadius: "var(--v2-r-0)", marginLeft: "auto" }} />
        </div>

        <div className="hd-bento-grid">
           {/* Wide Tile */}
           <div className="hd-bento-tile hd-bento-tile--wide col-span-2" style={{ background: "var(--v2-paper)" }}>
             <div>
               <div style={{ ...skeletonStyle, height: 12, width: "40%", marginBottom: 6, borderRadius: "var(--v2-r-0)" }} />
               <div style={{ ...skeletonStyle, height: 28, width: "60%", marginBottom: 6, borderRadius: "var(--v2-r-0)" }} />
               <div style={{ ...skeletonStyle, height: 12, width: "50%", borderRadius: "var(--v2-r-0)" }} />
             </div>
             <div style={{ ...skeletonStyle, width: 44, height: 44, borderRadius: "50%", marginLeft: "auto", alignSelf: "center" }} />
           </div>
           
           {/* Small Tile 1 */}
           <div className="hd-bento-tile" style={{ background: "var(--v2-paper)" }}>
             <div style={{ ...skeletonStyle, height: 12, width: "50%", marginBottom: 6, borderRadius: "var(--v2-r-0)" }} />
             <div style={{ ...skeletonStyle, height: 24, width: "70%", marginBottom: 6, borderRadius: "var(--v2-r-0)" }} />
             <div style={{ ...skeletonStyle, height: 12, width: "60%", borderRadius: "var(--v2-r-0)" }} />
           </div>

           {/* Small Tile 2 */}
           <div className="hd-bento-tile" style={{ background: "var(--v2-paper)" }}>
             <div style={{ ...skeletonStyle, height: 12, width: "50%", marginBottom: 6, borderRadius: "var(--v2-r-0)" }} />
             <div style={{ ...skeletonStyle, height: 24, width: "70%", marginBottom: 6, borderRadius: "var(--v2-r-0)" }} />
             <div style={{ ...skeletonStyle, height: 12, width: "60%", borderRadius: "var(--v2-r-0)" }} />
           </div>
        </div>
      </section>

    </div>
  );
}
