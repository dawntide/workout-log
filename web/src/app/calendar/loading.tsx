// 캘린더 라우트 loading.tsx — 진입 시 스켈레톤 UI 즉각 피드백
const skeletonStyle: React.CSSProperties = {
  background:
    "linear-gradient(90deg, var(--v2-paper-2) 0%, var(--v2-paper-3) 50%, var(--v2-paper-2) 100%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-shimmer 1.4s ease infinite",
  borderRadius: "var(--v2-r-1)",
};

export default function CalendarLoading() {
  return (
    <div>
      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* ── Page Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: "var(--v2-s-2)",
          marginBottom: "var(--v2-s-6)",
        }}
      >
        <div
          style={{
            ...skeletonStyle,
            height: 24,
            width: "30%",
            borderRadius: "var(--v2-r-0)",
          }}
        />
      </div>

      {/* ── Filter Bar ── */}
      <div
        style={{
          display: "flex",
          gap: "var(--v2-s-2)",
          marginBottom: "var(--v2-s-6)",
        }}
      >
        <div
          style={{
            ...skeletonStyle,
            height: 32,
            width: 100,
            borderRadius: "var(--v2-r-2)",
          }}
        />
      </div>

      {/* ── Calendar Grid ── */}
      <div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            textAlign: "center",
            marginBottom: "var(--v2-s-2)",
          }}
        >
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              style={{ display: "flex", justifyContent: "center" }}
            >
              <div
                style={{
                  ...skeletonStyle,
                  height: 14,
                  width: 20,
                  borderRadius: "var(--v2-r-0)",
                }}
              />
            </div>
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, week) => (
          <div
            key={`week-${week}`}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              textAlign: "center",
            }}
          >
            {Array.from({ length: 7 }).map((_, day) => (
              <div
                key={day}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 36,
                  height: 36,
                  margin: "4px auto",
                  borderRadius: "50%",
                  ...skeletonStyle,
                  background: "var(--v2-paper)",
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* ── Recent Past Logs ── */}
      <div style={{ marginTop: "var(--v2-s-7)" }}>
        <div
          style={{
            ...skeletonStyle,
            height: 20,
            width: "35%",
            marginBottom: "var(--v2-s-4)",
          }}
        />
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: "var(--v2-s-4)",
              padding: "12px 16px",
              marginBottom: "var(--v2-s-2)",
              borderRadius: "var(--v2-r-3)",
              background: "var(--v2-paper)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                flex: 1,
              }}
            >
              <div style={{ ...skeletonStyle, height: 16, width: "70%" }} />
              <div
                style={{
                  ...skeletonStyle,
                  height: 12,
                  width: "50%",
                  borderRadius: "var(--v2-r-0)",
                }}
              />
            </div>
            <div
              style={{
                ...skeletonStyle,
                height: 28,
                width: 60,
                borderRadius: "var(--v2-r-1)",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
