// 운동 기록 라우트 loading.tsx — 라우트 전환 시 즉각 피드백
const skeletonStyle: React.CSSProperties = {
  background:
    "linear-gradient(90deg, var(--v2-paper-2) 0%, var(--v2-paper-3) 50%, var(--v2-paper-2) 100%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-shimmer 1.4s ease infinite",
  borderRadius: "var(--v2-r-1)",
};

export default function WorkoutRecordLoading() {
  return (
    <div
      style={{
        paddingBlock: "var(--v2-s-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--v2-s-4)",
      }}
    >
      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* ── Plan Selector Strip ── */}
      <section className="plan-selector-strip">
        <div
          style={{
            ...skeletonStyle,
            height: 12,
            width: 80,
            borderRadius: 4,
            marginBottom: "var(--v2-s-1)",
          }}
        />
        <div
          style={{ ...skeletonStyle, height: 24, width: "60%", borderRadius: 6 }}
        />
      </section>

      {/* ── Today Session ── */}
      <section>
        <div className="session-progress-header">
          <div className="session-progress-header__top-row">
            <div
              className="session-progress-header__title-group"
              style={{ display: "flex", flexDirection: "column", gap: 6 }}
            >
              <div
                style={{
                  ...skeletonStyle,
                  height: 12,
                  width: 50,
                  borderRadius: 4,
                }}
              />
              <div
                style={{
                  ...skeletonStyle,
                  height: 28,
                  width: 140,
                  borderRadius: 6,
                }}
              />
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: "var(--v2-s-1)",
              marginTop: "var(--v2-s-3)",
            }}
          >
            <div
              style={{
                ...skeletonStyle,
                height: 24,
                width: 70,
                borderRadius: "var(--v2-r-2)",
              }}
            />
            <div
              style={{
                ...skeletonStyle,
                height: 24,
                width: 90,
                borderRadius: "var(--v2-r-2)",
              }}
            />
            <div
              style={{
                ...skeletonStyle,
                height: 24,
                width: 60,
                borderRadius: "var(--v2-r-2)",
              }}
            />
          </div>
        </div>

        <div
          className="last-session-banner"
          style={{ marginBottom: "var(--v2-s-4)" }}
        >
          <div
            style={{
              ...skeletonStyle,
              width: 36,
              height: 36,
              borderRadius: "50%",
              flexShrink: 0,
            }}
          />
          <div
            className="last-session-banner__body"
            style={{ display: "flex", flexDirection: "column", gap: 4 }}
          >
            <div
              style={{
                ...skeletonStyle,
                height: 12,
                width: 60,
                borderRadius: 4,
              }}
            />
            <div
              style={{
                ...skeletonStyle,
                height: 16,
                width: 120,
                borderRadius: 4,
              }}
            />
            <div
              style={{
                ...skeletonStyle,
                height: 12,
                width: 80,
                borderRadius: 4,
              }}
            />
          </div>
          <div
            className="last-session-banner__stat"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              alignItems: "center",
            }}
          >
            <div
              style={{
                ...skeletonStyle,
                height: 20,
                width: 24,
                borderRadius: 4,
              }}
            />
            <div
              style={{
                ...skeletonStyle,
                height: 10,
                width: 30,
                borderRadius: 4,
              }}
            />
          </div>
        </div>

        <div>
          {Array.from({ length: 2 }).map((_, i) => (
            <article
              key={i}
              className="exercise-card"
              aria-label="Exercise Loading"
            >
              <div className="exercise-card__header">
                <div
                  className="exercise-card__name-row"
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <div
                    style={{
                      ...skeletonStyle,
                      height: 20,
                      width: "40%",
                      borderRadius: 6,
                    }}
                  />
                  <div
                    style={{
                      ...skeletonStyle,
                      height: 20,
                      width: 48,
                      borderRadius: 6,
                    }}
                  />
                </div>
                <div className="exercise-card__header-actions">
                  <div
                    style={{
                      ...skeletonStyle,
                      height: 32,
                      width: 32,
                      borderRadius: "var(--v2-r-1)",
                    }}
                  />
                </div>
              </div>

              <div className="set-table">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1.5fr 2fr 1.5fr",
                    gap: "var(--v2-s-1)",
                    padding: "8px 16px",
                  }}
                >
                  <div
                    style={{ ...skeletonStyle, height: 12, borderRadius: 4 }}
                  />
                  <div
                    style={{ ...skeletonStyle, height: 12, borderRadius: 4 }}
                  />
                  <div
                    style={{ ...skeletonStyle, height: 12, borderRadius: 4 }}
                  />
                  <div
                    style={{ ...skeletonStyle, height: 12, borderRadius: 4 }}
                  />
                </div>

                <div role="list">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div
                      key={j}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1.5fr 2fr 1.5fr",
                        gap: "var(--v2-s-1)",
                        alignItems: "center",
                        padding: "4px 16px",
                        marginBottom: "var(--v2-s-1)",
                      }}
                    >
                      <div
                        style={{
                          ...skeletonStyle,
                          height: 14,
                          width: 14,
                          margin: "0 auto",
                          borderRadius: "50%",
                        }}
                      />
                      <div
                        style={{
                          ...skeletonStyle,
                          height: 44,
                          borderRadius: "var(--v2-r-1)",
                        }}
                      />
                      <div
                        style={{
                          ...skeletonStyle,
                          height: 44,
                          borderRadius: "var(--v2-r-1)",
                        }}
                      />
                      <div
                        style={{
                          ...skeletonStyle,
                          height: 24,
                          width: 24,
                          margin: "0 auto",
                          borderRadius: "50%",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  padding: "12px",
                  borderTop: "1px dashed var(--v2-hairline)",
                  background: "var(--v2-paper)",
                }}
              >
                <div
                  style={{
                    ...skeletonStyle,
                    height: 18,
                    width: 80,
                    borderRadius: 6,
                  }}
                />
              </div>
            </article>
          ))}
        </div>

        <div
          style={{
            marginBottom: "var(--v2-s-4)",
            display: "flex",
            justifyContent: "center",
            padding: "var(--v2-s-4)",
            borderRadius: "var(--v2-r-3)",
            background: "var(--v2-paper)",
            border: "1px dashed var(--v2-hairline)",
          }}
        >
          <div
            style={{ ...skeletonStyle, height: 24, width: 140, borderRadius: 6 }}
          />
        </div>

        <div style={{ marginBottom: "var(--v2-s-4)" }}>
          <div
            style={{
              ...skeletonStyle,
              height: 12,
              width: 60,
              marginBottom: 6,
              borderRadius: 4,
            }}
          />
          <div
            style={{
              ...skeletonStyle,
              height: 80,
              width: "100%",
              borderRadius: "var(--v2-r-3)",
            }}
          />
        </div>

        <div className="finish-workout-cta">
          <div
            style={{
              ...skeletonStyle,
              height: 52,
              width: "100%",
              borderRadius: "var(--v2-r-2)",
            }}
          />
        </div>
      </section>
    </div>
  );
}
