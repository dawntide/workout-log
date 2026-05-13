"use client";

import { useState, type ReactNode } from "react";
import {
  V2Anchor,
  V2Card,
  V2Chip,
  V2DotsLoader,
  V2EmptyState,
  V2Hairline,
  V2IconBtn,
  V2Inline,
  V2MetricCard,
  V2NavRow,
  V2PrimaryBtn,
  V2SecondaryBtn,
  V2SectionHeader,
  V2Sheet,
  V2Stack,
} from "@/components/v2/primitives";

const CARD_TONES = ["paper", "inset", "strong", "accent", "danger", "success"] as const;
const CHIP_TONES = [
  "neutral",
  "accent",
  "weight",
  "reps",
  "volume",
  "onerm",
  "pr",
  "success",
  "warning",
  "danger",
  "info",
] as const;
const METRIC_TONES = [
  "neutral",
  "weight",
  "reps",
  "volume",
  "onerm",
  "pr",
  "success",
] as const;

const PAPER_TOKENS = [
  "--v2-bg",
  "--v2-paper",
  "--v2-paper-2",
  "--v2-paper-3",
  "--v2-paper-4",
];
const INK_TOKENS = ["--v2-ink", "--v2-ink-2", "--v2-ink-3", "--v2-ink-4"];
const ACCENT_TOKENS = [
  "--v2-accent",
  "--v2-accent-2",
  "--v2-accent-weak",
  "--v2-accent-ink",
];
const METRIC_TOKENS = [
  "--v2-c-weight",
  "--v2-c-reps",
  "--v2-c-volume",
  "--v2-c-onerm",
  "--v2-c-pr",
  "--v2-c-success",
  "--v2-c-warning",
  "--v2-c-danger",
  "--v2-c-info",
];
const SPACING_TOKENS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const RADIUS_TOKENS = [
  { name: "--v2-r-1", px: 8 },
  { name: "--v2-r-2", px: 12 },
  { name: "--v2-r-3", px: 16 },
  { name: "--v2-r-4", px: 20 },
  { name: "--v2-r-5", px: 28 },
  { name: "--v2-r-pill", px: 9999 },
];
const ELEV_TOKENS = ["--v2-elev-1", "--v2-elev-2", "--v2-elev-3"];
const TYPE_CLASSES = [
  ["v2-display", "Display 56 / 760"],
  ["v2-h1", "Heading 1 — 30 / 700"],
  ["v2-h2", "Heading 2 — 22 / 700"],
  ["v2-h3", "Heading 3 — 17 / 620"],
  ["v2-body", "Body — 15 / 400"],
  ["v2-small", "Small — 13 / 400"],
  ["v2-label", "LABEL · 11 / 700 / +0.08em"],
  ["v2-eyebrow", "EYEBROW · 10 / 700 / +0.16em"],
] as const;

export function DesignSystemCatalog() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [demoTheme, setDemoTheme] = useState("SYSTEM");

  return (
    <div
      data-theme-preference={theme}
      style={{
        background: "var(--v2-bg)",
        minHeight: "100vh",
        color: "var(--v2-ink)",
        fontFamily: "var(--v2-f-text)",
        padding: "var(--v2-s-6)",
      }}
    >
      <header
        style={{
          maxWidth: 960,
          margin: "0 auto var(--v2-s-7)",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "var(--v2-s-4)",
        }}
      >
        <div>
          <p className="v2-eyebrow" style={{ marginBottom: 6 }}>
            IronGraph · V2 Quiet Premium
          </p>
          <h1 className="v2-h1">Design System Catalog</h1>
          <p
            className="v2-small"
            style={{ marginTop: 4, color: "var(--v2-ink-3)" }}
          >
            All tokens, primitives and patterns the app should be assembled from.
          </p>
        </div>
        <V2Inline gap={2}>
          <V2SecondaryBtn
            icon="light_mode"
            onClick={() => setTheme("light")}
            tone={theme === "light" ? "neutral" : "neutral"}
            style={
              theme === "light"
                ? { background: "var(--v2-accent-weak)", color: "var(--v2-accent-ink)" }
                : undefined
            }
          >
            Light
          </V2SecondaryBtn>
          <V2SecondaryBtn
            icon="dark_mode"
            onClick={() => setTheme("dark")}
            style={
              theme === "dark"
                ? { background: "var(--v2-accent-weak)", color: "var(--v2-accent-ink)" }
                : undefined
            }
          >
            Dark
          </V2SecondaryBtn>
        </V2Inline>
      </header>

      <main style={{ maxWidth: 960, margin: "0 auto" }}>
        <V2Stack gap={7}>
          {/* ── Tokens ─────────────────────────────── */}
          <Section eyebrow="01" title="Color tokens">
            <V2Stack gap={5}>
              <TokenSwatchRow title="Surface (paper)" tokens={PAPER_TOKENS} />
              <TokenSwatchRow title="Ink" tokens={INK_TOKENS} />
              <TokenSwatchRow title="Accent" tokens={ACCENT_TOKENS} />
              <TokenSwatchRow title="Metric / domain" tokens={METRIC_TOKENS} />
            </V2Stack>
          </Section>

          <Section eyebrow="02" title="Typography">
            <V2Card tone="paper">
              <V2Stack gap={3}>
                {TYPE_CLASSES.map(([cls, label]) => (
                  <div key={cls}>
                    <p
                      className="v2-eyebrow"
                      style={{ marginBottom: 4, color: "var(--v2-ink-3)" }}
                    >
                      {cls}
                    </p>
                    <p className={cls}>{label}</p>
                  </div>
                ))}
                <V2Hairline style={{ margin: "var(--v2-s-2) 0" }} />
                <V2Inline gap={4} align="baseline" wrap>
                  <span className="v2-num-xl">88</span>
                  <span className="v2-num-lg">56</span>
                  <span className="v2-num-md">32</span>
                  <span className="v2-num-sm">18</span>
                  <span className="v2-mono-label">12,480 KG</span>
                </V2Inline>
              </V2Stack>
            </V2Card>
          </Section>

          <Section eyebrow="03" title="Spacing · Radius · Elevation">
            <V2Stack gap={4}>
              <V2Card tone="paper">
                <p className="v2-label" style={{ marginBottom: 8 }}>
                  Spacing — 4-pt grid
                </p>
                <V2Inline gap={3} align="flex-end" wrap>
                  {SPACING_TOKENS.map((step) => (
                    <V2Stack key={step} gap={1} align="center">
                      <div
                        style={{
                          width: `var(--v2-s-${step})`,
                          height: `var(--v2-s-${step})`,
                          background: "var(--v2-accent)",
                          borderRadius: "var(--v2-r-1)",
                        }}
                      />
                      <span className="v2-mono-label">s-{step}</span>
                    </V2Stack>
                  ))}
                </V2Inline>
              </V2Card>

              <V2Card tone="paper">
                <p className="v2-label" style={{ marginBottom: 8 }}>
                  Border radius
                </p>
                <V2Inline gap={3} align="center" wrap>
                  {RADIUS_TOKENS.map((r) => (
                    <V2Stack key={r.name} gap={1} align="center">
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          background: "var(--v2-paper-3)",
                          borderRadius: `var(${r.name})`,
                          boxShadow: "var(--v2-elev-1)",
                        }}
                      />
                      <span className="v2-mono-label">
                        {r.name.replace("--v2-", "")}
                      </span>
                    </V2Stack>
                  ))}
                </V2Inline>
              </V2Card>

              <V2Card tone="paper">
                <p className="v2-label" style={{ marginBottom: 8 }}>
                  Elevation
                </p>
                <V2Inline gap={4} align="center" wrap>
                  {ELEV_TOKENS.map((e) => (
                    <V2Stack key={e} gap={1} align="center">
                      <div
                        style={{
                          width: 96,
                          height: 64,
                          background: "var(--v2-paper)",
                          borderRadius: "var(--v2-r-2)",
                          boxShadow: `var(${e})`,
                        }}
                      />
                      <span className="v2-mono-label">
                        {e.replace("--v2-", "")}
                      </span>
                    </V2Stack>
                  ))}
                </V2Inline>
              </V2Card>
            </V2Stack>
          </Section>

          {/* ── Primitives ─────────────────────────── */}
          <Section eyebrow="04" title="V2Card · 6 tones">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "var(--v2-s-3)",
              }}
            >
              {CARD_TONES.map((tone) => (
                <V2Card key={tone} tone={tone}>
                  <p className="v2-label" style={{ marginBottom: 4 }}>
                    {tone}
                  </p>
                  <p className="v2-body" style={{ margin: 0 }}>
                    카드 본문 sample
                  </p>
                </V2Card>
              ))}
            </div>
          </Section>

          <Section eyebrow="05" title="V2Chip · 11 tones">
            <V2Card tone="paper">
              <V2Inline gap={2} wrap>
                {CHIP_TONES.map((tone) => (
                  <V2Chip key={tone} tone={tone}>
                    {tone}
                  </V2Chip>
                ))}
              </V2Inline>
              <V2Hairline style={{ margin: "var(--v2-s-3) 0" }} />
              <V2Inline gap={2} wrap>
                <V2Chip tone="accent" icon="bolt">
                  with icon
                </V2Chip>
                <V2Chip tone="pr" icon="workspace_premium">
                  PR
                </V2Chip>
                <V2Chip tone="success" solid icon="check">
                  solid
                </V2Chip>
              </V2Inline>
            </V2Card>
          </Section>

          <Section eyebrow="06" title="Buttons">
            <V2Card tone="paper">
              <V2Stack gap={4}>
                <div>
                  <p className="v2-label" style={{ marginBottom: 8 }}>
                    Primary
                  </p>
                  <V2Inline gap={2} wrap>
                    <V2PrimaryBtn icon="play_arrow">세션 시작</V2PrimaryBtn>
                    <V2PrimaryBtn>저장</V2PrimaryBtn>
                    <V2PrimaryBtn disabled>비활성</V2PrimaryBtn>
                    <V2PrimaryBtn as="a" href="#" icon="add">
                      as=&quot;a&quot;
                    </V2PrimaryBtn>
                  </V2Inline>
                </div>
                <div>
                  <p className="v2-label" style={{ marginBottom: 8 }}>
                    Secondary
                  </p>
                  <V2Inline gap={2} wrap>
                    <V2SecondaryBtn icon="close">취소</V2SecondaryBtn>
                    <V2SecondaryBtn icon="edit">편집</V2SecondaryBtn>
                    <V2SecondaryBtn icon="delete" tone="danger">
                      삭제
                    </V2SecondaryBtn>
                    <V2SecondaryBtn as="a" href="#">
                      링크
                    </V2SecondaryBtn>
                  </V2Inline>
                </div>
                <div>
                  <p className="v2-label" style={{ marginBottom: 8 }}>
                    Icon
                  </p>
                  <V2Inline gap={2} wrap>
                    <V2IconBtn icon="edit" label="편집" />
                    <V2IconBtn icon="add" label="추가" tone="accent" />
                    <V2IconBtn icon="close" label="닫기" tone="ghost" />
                    <V2IconBtn icon="check" label="확인" tone="accent" fill />
                  </V2Inline>
                </div>
                <div>
                  <p className="v2-label" style={{ marginBottom: 8 }}>
                    Anchor
                  </p>
                  <V2Inline gap={3} wrap>
                    <V2Anchor href="#">accent</V2Anchor>
                    <V2Anchor href="#" tone="ink" underline>
                      ink + underline
                    </V2Anchor>
                    <V2Anchor href="#" tone="danger">
                      danger
                    </V2Anchor>
                  </V2Inline>
                </div>
              </V2Stack>
            </V2Card>
          </Section>

          <Section eyebrow="07" title="V2MetricCard">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "var(--v2-s-3)",
              }}
            >
              {METRIC_TONES.map((tone) => (
                <V2MetricCard
                  key={tone}
                  label={tone.toUpperCase()}
                  value={tone === "pr" ? "175" : "12,480"}
                  unit={tone === "reps" ? "회" : "kg"}
                  tone={tone}
                  trend={
                    tone === "volume"
                      ? { direction: "up", text: "+8%" }
                      : tone === "weight"
                        ? { direction: "down", text: "-2%" }
                        : undefined
                  }
                />
              ))}
            </div>
          </Section>

          <Section eyebrow="08" title="V2SectionHeader">
            <V2Card tone="paper">
              <V2SectionHeader
                eyebrow="TODAY'S SESSION"
                title="가슴 + 삼두"
                action={<V2IconBtn icon="more_horiz" label="옵션" />}
              />
              <V2SectionHeader
                eyebrow="WEEKLY VOLUME"
                title="12,480 kg"
                level="h3"
              />
            </V2Card>
          </Section>

          <Section eyebrow="09" title="V2NavRow (settings list)">
            <V2Card tone="paper" padding={0}>
              <V2Stack gap="0" as="ul" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                <li>
                  <V2NavRow
                    as="a"
                    href="#"
                    icon="person"
                    label="계정"
                    value="me@example.com"
                  />
                </li>
                <li>
                  <V2NavRow
                    as="button"
                    icon="palette"
                    label="테마"
                    value="시스템"
                  />
                </li>
                <li>
                  <V2NavRow
                    as="button"
                    icon="language"
                    label="언어"
                    value="한국어"
                    badge={<V2Chip tone="info">NEW</V2Chip>}
                  />
                </li>
                <li>
                  <V2NavRow
                    as="div"
                    icon="info"
                    label="버전"
                    value="0.1.0"
                    trailing="none"
                  />
                </li>
              </V2Stack>
            </V2Card>
            <V2Card tone="paper" padding={0} style={{ marginTop: "var(--v2-s-3)" }}>
              <V2Stack
                gap="0"
                as="ul"
                style={{ listStyle: "none", margin: 0, padding: 0 }}
              >
                <li>
                  <V2NavRow
                    icon="contrast"
                    label="테마"
                    value={demoTheme === "LIGHT" ? "라이트" : demoTheme === "DARK" ? "다크" : "시스템"}
                    expandable
                    expanded={expandedRow === "theme"}
                    onExpandedChange={(next) =>
                      setExpandedRow(next ? "theme" : null)
                    }
                    expandedContent={
                      <V2Stack gap={1}>
                        {[
                          { value: "LIGHT", label: "라이트" },
                          { value: "DARK", label: "다크" },
                          { value: "SYSTEM", label: "시스템 따름" },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setDemoTheme(opt.value)}
                            className="v2-pressable"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "10px 12px",
                              background:
                                demoTheme === opt.value
                                  ? "var(--v2-accent-weak)"
                                  : "transparent",
                              color:
                                demoTheme === opt.value
                                  ? "var(--v2-accent-ink)"
                                  : "var(--v2-ink)",
                              border: "none",
                              borderRadius: "var(--v2-r-2)",
                              cursor: "pointer",
                              fontFamily: "var(--v2-f-display)",
                              fontSize: 14,
                              fontWeight: 600,
                              textAlign: "left",
                            }}
                          >
                            <span>{opt.label}</span>
                            {demoTheme === opt.value ? (
                              <span
                                className="material-symbols-outlined"
                                style={{
                                  fontSize: 18,
                                  color: "var(--v2-accent)",
                                  fontVariationSettings: "'FILL' 1, 'wght' 600",
                                }}
                                aria-hidden
                              >
                                check
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </V2Stack>
                    }
                  />
                </li>
              </V2Stack>
            </V2Card>
          </Section>

          <Section eyebrow="10" title="V2EmptyState · V2DotsLoader · V2Hairline">
            <V2Stack gap={3}>
              <V2EmptyState
                icon="calendar_month"
                title="아직 기록된 세션이 없습니다"
                description="플랜을 시작하거나 즉시 기록할 수 있어요."
                action={
                  <V2PrimaryBtn as="a" href="#" icon="add">
                    세션 시작
                  </V2PrimaryBtn>
                }
              />
              <V2Card tone="paper">
                <V2Inline gap={3} align="center">
                  <V2DotsLoader />
                  <span className="v2-small">로딩 dots</span>
                </V2Inline>
              </V2Card>
              <V2Card tone="paper">
                <p className="v2-label" style={{ marginBottom: 8 }}>
                  Hairline
                </p>
                <p className="v2-body" style={{ marginBottom: 8 }}>
                  위쪽 컨텐츠
                </p>
                <V2Hairline />
                <p className="v2-body" style={{ marginTop: 8 }}>
                  아래쪽 컨텐츠
                </p>
              </V2Card>
            </V2Stack>
          </Section>

          <Section eyebrow="11" title="V2Sheet (interactive)">
            <V2Card tone="paper">
              <V2Inline gap={3} align="center" wrap>
                <V2PrimaryBtn icon="open_in_new" onClick={() => setSheetOpen(true)}>
                  Sheet 열기
                </V2PrimaryBtn>
                <span className="v2-small">ESC로 닫힙니다</span>
              </V2Inline>
            </V2Card>
          </Section>

          <Section eyebrow="12" title="Pattern · 운동 카드 sample">
            <V2Card tone="paper">
              <V2SectionHeader
                eyebrow="TODAY'S SESSION"
                title="가슴 + 삼두"
                level="h3"
                action={<V2Chip tone="accent">D1</V2Chip>}
              />
              <V2Stack gap={3}>
                {[
                  { name: "벤치프레스", summary: "5 × 5 @ 100 kg" },
                  { name: "인클라인 덤벨", summary: "4 × 8 @ 26 kg" },
                  { name: "케이블 트라이셉", summary: "3 × 12" },
                ].map((ex) => (
                  <V2Inline key={ex.name} gap={3} justify="space-between" align="baseline">
                    <span className="v2-body" style={{ fontWeight: 600 }}>
                      {ex.name}
                    </span>
                    <span className="v2-mono-label" style={{ color: "var(--v2-ink-3)" }}>
                      {ex.summary}
                    </span>
                  </V2Inline>
                ))}
                <V2Hairline style={{ margin: "var(--v2-s-2) 0" }} />
                <V2Inline gap={5} justify="flex-start">
                  <Metric label="SETS" value="12" />
                  <Metric label="VOLUME" value="9,840" unit="kg" />
                </V2Inline>
                <V2PrimaryBtn as="a" href="#" icon="play_arrow" full>
                  세션 시작
                </V2PrimaryBtn>
              </V2Stack>
            </V2Card>
          </Section>
        </V2Stack>

        <V2Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          ariaLabel="Demo sheet"
          height="60%"
        >
          <div style={{ padding: "var(--v2-s-5)" }}>
            <V2SectionHeader title="Sheet 예시" eyebrow="DEMO" level="h2" />
            <p className="v2-body">
              바텀시트는 ESC 키, 백드롭 클릭, 외부 트리거로 닫힙니다.
            </p>
            <V2Inline gap={2} style={{ marginTop: "var(--v2-s-4)" }}>
              <V2PrimaryBtn onClick={() => setSheetOpen(false)}>닫기</V2PrimaryBtn>
              <V2SecondaryBtn onClick={() => setSheetOpen(false)}>취소</V2SecondaryBtn>
            </V2Inline>
          </div>
        </V2Sheet>
      </main>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <V2SectionHeader eyebrow={eyebrow} title={title} level="h2" />
      {children}
    </section>
  );
}

function TokenSwatchRow({
  title,
  tokens,
}: {
  title: string;
  tokens: string[];
}) {
  return (
    <V2Card tone="paper">
      <p className="v2-label" style={{ marginBottom: 8 }}>
        {title}
      </p>
      <V2Inline gap={2} wrap>
        {tokens.map((t) => (
          <V2Stack key={t} gap={1} align="center">
            <div
              style={{
                width: 56,
                height: 56,
                background: `var(${t})`,
                borderRadius: "var(--v2-r-2)",
                boxShadow: "inset 0 0 0 1px var(--v2-hairline)",
              }}
            />
            <span className="v2-mono-label">{t.replace("--v2-", "")}</span>
          </V2Stack>
        ))}
      </V2Inline>
    </V2Card>
  );
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div>
      <p className="v2-label" style={{ marginBottom: 2 }}>
        {label}
      </p>
      <span className="v2-num-sm">{value}</span>
      {unit ? (
        <span className="v2-small" style={{ marginLeft: 4, color: "var(--v2-ink-3)" }}>
          {unit}
        </span>
      ) : null}
    </div>
  );
}
