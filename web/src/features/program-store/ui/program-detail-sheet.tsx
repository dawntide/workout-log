"use client";

import type { CSSProperties, ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  V2Chip,
  V2PrimaryBtn,
  V2SelectableRow,
  V2SecondaryBtn,
  type V2ChipTone,
} from "@/components/v2/primitives";
import { V2Icon } from "@/components/v2/primitives/v2-icon";
import {
  getProgramDescription,
  getProgramDetailInfo,
  isRef5Template,
  type ProgramListItem,
  type ProgramStoreLocale,
  type ProgramSessionDraft,
  type ProgramTemplate,
} from "@workout/core/program-store/model";
import { getWendler531VariantPresentation } from "@/features/program-store/model/view";

// ─── Local helpers ────────────────────────────────────────────────────────────

function formatName(name: string): string {
  return String(name)
    .replace(/\s*\(base[^)]*\)\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function tagChipTone(tag: string): V2ChipTone {
  const t = tag.toLowerCase().trim();
  if (["manual", "fixed", "custom"].some((k) => t.includes(k))) {
    return "neutral";
  }
  if (
    ["beginner", "novice", "starter", "입문", "초보"].some((k) => t.includes(k))
  ) {
    return "info";
  }
  if (
    ["amrap", "top-set", "topset", "top set", "rpe", "rir"].some((k) =>
      t.includes(k),
    )
  ) {
    return t.includes("amrap") ? "warning" : "onerm";
  }
  if (
    ["strength", "power", "hypertrophy", "근력", "파워", "근비대"].some((k) =>
      t.includes(k),
    )
  ) {
    return "accent";
  }
  if (
    ["linear", "progression", "wave", "periodization", "선형", "주기화"].some(
      (k) => t.includes(k),
    )
  ) {
    return "weight";
  }
  return "neutral";
}

const INTENSITY_MAP: Record<string, number> = {
  Beginner: 2,
  Intermediate: 3,
  Advanced: 4,
  Standard: 3,
  초급: 2,
  중급: 3,
  고급: 4,
  일반: 3,
};

function moduleName(
  module: string,
  locale: ProgramStoreLocale,
  ref5 = false,
) {
  if (module === "SQUAT") return locale === "ko" ? "스쿼트" : "Squat";
  if (module === "BENCH") return locale === "ko" ? "벤치프레스" : "Bench Press";
  if (module === "DEADLIFT") return locale === "ko" ? "데드리프트" : "Deadlift";
  if (module === "OHP")
    return locale === "ko" ? "오버헤드 프레스" : "Overhead Press";
  if (module === "PULL") {
    if (ref5) return locale === "ko" ? "중량 풀업" : "Weighted Pull-Up";
    return locale === "ko" ? "풀업 / 로우" : "Pull-Up / Row";
  }
  return module;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function IntensityBars({ level }: { level: string }) {
  const filled = INTENSITY_MAP[level] ?? 3;
  return (
    <div style={{ display: "flex", gap: "var(--v2-s-1)", alignItems: "flex-end" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            width: 5,
            height: i <= filled ? 14 : 10,
            borderRadius: "var(--v2-r-0)",
            backgroundColor:
              i <= filled ? "var(--v2-c-warning)" : "var(--v2-paper-4)",
            transition: "background-color 0.2s",
          }}
        />
      ))}
    </div>
  );
}

function StatBentoCell({
  icon,
  value,
  label,
  children,
}: {
  icon?: string;
  value?: string;
  label: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--v2-paper-2)",
        borderRadius: "var(--v2-r-3)",
        padding: "var(--v2-s-4)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--v2-s-1)",
        textAlign: "center",
      }}
    >
      {icon && (
        <V2Icon
          name={icon}
          style={{
            fontSize: "var(--v2-t-h2)",
            color: "var(--v2-accent)",
            marginBottom: 2,
          }}
        />
      )}
      {children}
      {value && (
        <span
          className="v2-num-sm"
          style={{
            fontSize: "var(--v2-t-20)",
            color: "var(--v2-ink)",
          }}
        >
          {value}
        </span>
      )}
      <span className="v2-eyebrow" style={{ marginTop: 2 }}>
        {label}
      </span>
    </div>
  );
}

type ArchItem = { icon: string; title: string; desc: string };

function ArchitectureGrid({ items }: { items: ArchItem[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "var(--v2-s-4)",
      }}
    >
      {items.map((item) => (
        <div
          key={item.title}
          style={{
            display: "flex",
            gap: "var(--v2-s-2)",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "var(--v2-r-2)",
              background: "var(--v2-paper-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <V2Icon
              name={item.icon}
              style={{ fontSize: "var(--v2-t-20)", color: "var(--v2-accent)" }}
            />
          </div>
          <div>
            <p
              className="v2-body"
              style={{
                fontSize: "var(--v2-t-small)",
                fontWeight: 700,
                marginBottom: "var(--v2-s-1)",
              }}
            >
              {item.title}
            </p>
            <p
              className="v2-small"
              style={{
                fontSize: "var(--v2-t-label)",
                color: "var(--v2-ink-2)",
                lineHeight: 1.5,
              }}
            >
              {item.desc}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Architecture items builder ───────────────────────────────────────────────

function buildArchItems(
  item: ProgramListItem,
  locale: ProgramStoreLocale,
): ArchItem[] {
  const info = getProgramDetailInfo(item.template, locale);
  const items: ArchItem[] = [];

  const typeStat = info.stats.find((s) => s.key === "type");
  items.push({
    icon: "equalizer",
    title: locale === "ko" ? "진행 방식" : "Progression Mode",
    desc:
      typeStat?.value === (locale === "ko" ? "자동 진행" : "Auto Progression")
        ? locale === "ko"
          ? "알고리즘 기반 자동 중량 산출과 세트 흐름을 따릅니다."
          : "Uses algorithm-driven load targets and progression across the cycle."
        : locale === "ko"
          ? "고정 세션 구조를 바탕으로 중량과 볼륨을 직접 조절합니다."
          : "Keeps sessions fixed so you can control load and volume directly.",
  });

  const freqStat = info.stats.find((s) => s.key === "frequency");
  const cycleStat = info.stats.find((s) => s.key === "cycle");
  const splitStat = info.stats.find((s) => s.key === "split");
  const durationStat = info.stats.find((s) => s.key === "duration");
  items.push({
    icon: "event_repeat",
    title: locale === "ko" ? "훈련 일정" : "Training Rhythm",
    desc:
      // LOGIC: 빈도·사이클, manual: 분할·기간 순으로 사용 가능한 값을 노출한다.
      [
        freqStat?.value ?? splitStat?.value,
        cycleStat?.value ?? durationStat?.value,
      ]
        .filter((value) => value && value !== "-")
        .join(" · ") ||
      (locale === "ko"
        ? "반복 가능한 주간 훈련 리듬을 중심으로 설계되었습니다."
        : "Built around a repeatable weekly training rhythm."),
  });

  if (info.modules && info.modules.length > 0) {
    const ref5 = isRef5Template(item.template);
    const moduleNames = info.modules
      .map((m) => moduleName(m, locale, ref5))
      .join(", ");
    items.push({
      icon: "fitness_center",
      title: locale === "ko" ? "훈련 모듈" : "Lift Modules",
      desc: moduleNames,
    });
  } else if (info.sessions && info.sessions.length > 0) {
    items.push({
      icon: "view_agenda",
      title: locale === "ko" ? "세션 구성" : "Session Structure",
      desc:
        locale === "ko"
          ? `${info.sessions.length}개 세션 · ${info.sessions.reduce((acc, s) => acc + s.exercises.length, 0)}개 종목`
          : `${info.sessions.length} sessions · ${info.sessions.reduce((acc, s) => acc + s.exercises.length, 0)} exercises`,
    });
  } else {
    items.push({
      icon: "swap_horiz",
      title: locale === "ko" ? "종목 구성" : "Exercise Mix",
      desc:
        locale === "ko"
          ? "목적에 맞는 종목 흐름으로 구성되었습니다."
          : "Built as a balanced exercise mix around the program goal.",
    });
  }

  const diffStat = info.stats.find((s) => s.key === "difficulty");
  const hasProgression = Boolean(info.progressionNote);
  items.push({
    icon: "speed",
    title: locale === "ko" ? "강도 기준" : "Intensity Profile",
    desc: hasProgression
      ? `${diffStat?.value ?? (locale === "ko" ? "일반" : "Standard")} · ${info.progressionNote}`
      : locale === "ko"
        ? `${diffStat?.value ?? "일반"} 수준 난이도로 설계된 프로그램입니다.`
        : `Built around a ${diffStat?.value ?? "Standard"} training profile.`,
  });

  return items;
}

// ─── Main component ───────────────────────────────────────────────────────────

export type ProgramDetailSheetCustomizeDraft = {
  name: string;
  baseTemplate: ProgramTemplate;
  sessions: ProgramSessionDraft[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  item: ProgramListItem | null;
  variants?: ProgramListItem[];
  saving: boolean;
  onSelectVariant?: (item: ProgramListItem) => void;
  onStart: () => void;
  onCustomize: () => void;
  onDelete?: () => void;
};

const sectionEyebrowStyle: CSSProperties = {
  display: "block",
  marginBottom: "var(--v2-s-2)",
};

export function ProgramDetailSheet({
  open,
  onClose,
  item,
  variants = [],
  saving,
  onSelectVariant,
  onStart,
  onCustomize,
  onDelete,
}: Props) {
  const { locale } = useLocale();
  if (!item) return null;

  const info = getProgramDetailInfo(item.template, locale);
  const programDescription = getProgramDescription(item.template, locale);
  const tags = Array.isArray(item.template.tags) ? item.template.tags : [];
  const isCustom = item.source === "CUSTOM";
  const canCustomize = !isRef5Template(item.template);
  const hasVariants = variants.length > 1;
  const activeVariant = hasVariants
    ? getWendler531VariantPresentation(item.template.slug, locale)
    : null;
  const programName = hasVariants
    ? "Jim Wendler 5/3/1"
    : formatName(item.template.name);

  const cycleStat = info.stats.find((s) => s.key === "cycle");
  const frequencyStat = info.stats.find((s) => s.key === "frequency");
  const splitStat = info.stats.find((s) => s.key === "split");
  const durationStat = info.stats.find((s) => s.key === "duration");
  const difficultyStat = info.stats.find((s) => s.key === "difficulty");
  const difficultyLevel =
    difficultyStat?.value ?? (locale === "ko" ? "일반" : "Standard");

  // 자동 진행(LOGIC) 프로그램은 사이클·주당 빈도를, 세션 고정(manual) 프로그램은
  // 기간·분할을 노출한다. 데이터 모델에 맞춰 셀의 라벨/아이콘/값을 함께 전환해
  // manual 프로그램에서 "-"만 뜨던 문제를 해결한다.
  const isUsableStat = (value: string | undefined): value is string =>
    Boolean(value) && value !== "-";

  // 1열: 기간 디스크립터 — 사이클 길이(LOGIC) 우선, 없으면 총 기간(manual)
  const primaryCell = isUsableStat(cycleStat?.value)
    ? {
        icon: "calendar_today",
        value: cycleStat!.value,
        label: locale === "ko" ? "사이클" : "Cycle",
      }
    : isUsableStat(durationStat?.value)
      ? {
          icon: "all_inclusive",
          value: durationStat!.value,
          label: locale === "ko" ? "기간" : "Duration",
        }
      : {
          icon: "calendar_today",
          value: "-",
          label: locale === "ko" ? "사이클" : "Cycle",
        };

  // 2열: 주간 리듬 — 주당 빈도(LOGIC) 우선, 없으면 분할 수(manual). 라벨이 단위를
  // 설명하므로 값은 숫자만 남긴다.
  const numericValue = (raw: string) => raw.match(/\d+/)?.[0] ?? raw;
  const secondaryCell = isUsableStat(frequencyStat?.value)
    ? {
        icon: "event_repeat",
        value: numericValue(frequencyStat!.value),
        label: locale === "ko" ? "주당 빈도" : "Days/Wk",
      }
    : isUsableStat(splitStat?.value)
      ? {
          icon: "splitscreen",
          value: numericValue(splitStat!.value),
          label: locale === "ko" ? "분할" : "Split",
        }
      : {
          icon: "event_repeat",
          value: "-",
          label: locale === "ko" ? "주당 빈도" : "Days/Wk",
        };

  // ── Level badge metadata ──
  const levelBadge = (() => {
    if (difficultyLevel === "초급" || difficultyLevel === "Beginner")
      return { label: "BEGINNER", color: "var(--v2-c-info)" };
    if (difficultyLevel === "중급" || difficultyLevel === "Intermediate")
      return { label: "INTERMEDIATE", color: "var(--v2-accent)" };
    if (difficultyLevel === "고급" || difficultyLevel === "Advanced")
      return { label: "ADVANCED", color: "var(--v2-c-warning)" };
    if (isCustom) return { label: "CUSTOM", color: "var(--v2-c-info)" };
    return { label: "STANDARD", color: "var(--v2-accent)" };
  })();

  const archItems = buildArchItems(item, locale);
  const logbookStats = info.stats.filter((s) => s.key !== "difficulty");
  const hasSessions = Boolean(info.sessions && info.sessions.length > 0);

  const header = (
    <div
      style={{
        padding: "var(--v2-s-1) 0 var(--v2-s-4)",
        marginBottom: "var(--v2-s-4)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "var(--v2-s-2)",
          marginBottom: "var(--v2-s-1)",
        }}
      >
        <div style={{ display: "flex", gap: "var(--v2-s-1)", flexWrap: "wrap" }}>
          {tags.slice(0, 3).map((tag) => (
            <V2Chip key={tag} tone={tagChipTone(tag)}>
              {tag}
            </V2Chip>
          ))}
        </div>
        <div
          style={{
            padding: "var(--v2-s-1) var(--v2-s-3)",
            borderRadius: "var(--v2-r-0)",
            background: `color-mix(in srgb, ${levelBadge.color} 14%, var(--v2-paper-2))`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${levelBadge.color} 28%, transparent)`,
            flexShrink: 0,
          }}
        >
          <span
            className="v2-mono-label"
            style={{
              fontSize: "var(--v2-t-eyebrow)",
              letterSpacing: "0.12em",
              color: levelBadge.color,
              textTransform: "uppercase",
            }}
          >
            {levelBadge.label}
          </span>
        </div>
      </div>

      <h1 className="v2-h2" style={{ lineHeight: 1.15 }}>
        {programName}
      </h1>

      {tags.length > 3 && (
        <div
          style={{
            display: "flex",
            gap: "var(--v2-s-1)",
            flexWrap: "wrap",
            marginTop: "var(--v2-s-1)",
          }}
        >
          {tags.slice(3).map((tag) => (
            <V2Chip key={tag} tone={tagChipTone(tag)}>
              {tag}
            </V2Chip>
          ))}
        </div>
      )}
    </div>
  );

  const footer = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--v2-s-2)",
        paddingTop: "var(--v2-s-1)",
      }}
    >
      <V2PrimaryBtn
        full
        disabled={saving || !item.template.latestVersion}
        onClick={onStart}
      >
        {activeVariant
          ? locale === "ko"
            ? `${activeVariant.label} 방식으로 시작하기`
            : `Start ${activeVariant.label}`
          : locale === "ko"
            ? "이 프로그램으로 시작하기"
            : "Start This Program"}
      </V2PrimaryBtn>
      {canCustomize ? (
        <V2SecondaryBtn full onClick={onCustomize}>
          {activeVariant
            ? locale === "ko"
              ? `${activeVariant.label} 방식 커스터마이징`
              : `Customize ${activeVariant.label}`
            : locale === "ko"
              ? "커스터마이징해서 사용하기"
              : "Customize Before Starting"}
        </V2SecondaryBtn>
      ) : null}
      {isCustom && onDelete && (
        <V2SecondaryBtn full tone="danger" onClick={onDelete}>
          {locale === "ko" ? "커스텀 프로그램 삭제" : "Delete Custom Program"}
        </V2SecondaryBtn>
      )}
    </div>
  );

  return (
    <BottomSheet
      open={open}
      title={locale === "ko" ? "프로그램 상세" : "Program Details"}
      onClose={onClose}
      closeLabel={locale === "ko" ? "닫기" : "Close"}
      header={header}
      footer={footer}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--v2-s-7)",
        }}
      >
        {hasVariants && onSelectVariant ? (
          <div>
            <span className="v2-eyebrow" style={sectionEyebrowStyle}>
              {locale === "ko" ? "방식 선택" : "Choose a Variant"}
            </span>
            <div
              role="radiogroup"
              aria-label={locale === "ko" ? "5/3/1 방식" : "5/3/1 variant"}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--v2-s-2)",
              }}
            >
              {variants.map((variant) => {
                const presentation = getWendler531VariantPresentation(
                  variant.template.slug,
                  locale,
                );
                return (
                  <V2SelectableRow
                    key={variant.template.id}
                    selected={variant.template.id === item.template.id}
                    onClick={() => onSelectVariant(variant)}
                    title={presentation.label}
                    description={presentation.description}
                  />
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ── Bento Stats Grid ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "var(--v2-s-2)",
          }}
        >
          <StatBentoCell
            icon={primaryCell.icon}
            value={primaryCell.value}
            label={primaryCell.label}
          />
          <StatBentoCell
            icon={secondaryCell.icon}
            value={secondaryCell.value}
            label={secondaryCell.label}
          />
          <StatBentoCell label={locale === "ko" ? "강도" : "Intensity"}>
            <IntensityBars level={difficultyLevel} />
            <span
              className="v2-body"
              style={{
                fontSize: "var(--v2-t-16)",
                fontWeight: 700,
                color: "var(--v2-ink)",
                lineHeight: 1,
                marginTop: 2,
              }}
            >
              {difficultyLevel}
            </span>
          </StatBentoCell>
        </div>

        {/* ── Program Overview ── */}
        {programDescription && (
          <div>
            <span className="v2-eyebrow" style={sectionEyebrowStyle}>
              {locale === "ko" ? "프로그램 소개" : "Program Overview"}
            </span>
            <p
              className="v2-body"
              style={{
                fontSize: "var(--v2-t-14)",
                color: "var(--v2-ink)",
                lineHeight: 1.65,
              }}
            >
              {programDescription}
            </p>
          </div>
        )}

        {/* ── Program Architecture ── */}
        <div>
          <span className="v2-eyebrow" style={sectionEyebrowStyle}>
            {locale === "ko" ? "프로그램 구성" : "Program Architecture"}
          </span>
          <ArchitectureGrid items={archItems} />
        </div>

        {/* ── Session Breakdown ── */}
        {hasSessions && info.sessions && (
          <div>
            <span className="v2-eyebrow" style={sectionEyebrowStyle}>
              {locale === "ko" ? "세션 구성" : "Session Breakdown"}
            </span>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--v2-s-2)",
              }}
            >
              {info.sessions.map((session) => (
                <div
                  key={session.key}
                  style={{
                    background: "var(--v2-paper)",
                    borderRadius: "var(--v2-r-2)",
                    overflow: "hidden",
                    boxShadow: "var(--v2-elev-1)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--v2-s-1)",
                      padding: "6px var(--v2-s-2)",
                      background: "var(--v2-paper-3)",
                    }}
                  >
                    <span className="label label-program label-sm">
                      {session.key}
                    </span>
                    <span
                      className="v2-small"
                      style={{
                        fontWeight: 600,
                        color: "var(--v2-ink-2)",
                      }}
                    >
                      {locale === "ko"
                        ? `세션 ${session.key}`
                        : `Session ${session.key}`}
                    </span>
                  </div>
                  <div style={{ padding: "var(--v2-s-2)" }}>
                    {session.exercises.map((ex, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "var(--v2-s-2)",
                          padding: "var(--v2-s-1) 0px",
                        }}
                      >
                        <span
                          className="v2-body"
                          style={{ fontSize: "var(--v2-t-small)", color: "var(--v2-ink)" }}
                        >
                          {ex.name}
                        </span>
                        {ex.setsReps && (
                          <span
                            className="v2-mono-label"
                            style={{
                              fontSize: "var(--v2-t-12)",
                              color: "var(--v2-ink-2)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {ex.setsReps}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Technical Logbook ── */}
        <div
          style={{
            background: "var(--v2-paper-2)",
            borderRadius: "var(--v2-r-3)",
            padding: "var(--v2-s-4)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "var(--v2-s-4)",
            }}
          >
            <span className="v2-eyebrow">
              {locale === "ko" ? "프로그램 메타" : "Technical Logbook"}
            </span>
            <V2Icon
              name="info"
              style={{ fontSize: "var(--v2-t-16)", color: "var(--v2-ink-3)" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {logbookStats.map((stat) => (
              <div
                key={stat.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  padding: "var(--v2-s-2) 0px",
                }}
              >
                <span
                  className="v2-small"
                  style={{ color: "var(--v2-ink-2)" }}
                >
                  {stat.label}
                </span>
                <span
                  className="v2-small"
                  style={{
                    fontWeight: 700,
                    color: "var(--v2-ink)",
                  }}
                >
                  {stat.value}
                </span>
              </div>
            ))}
            {info.progressionNote && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  paddingTop: 8,
                }}
              >
                <span
                  className="v2-small"
                  style={{ color: "var(--v2-ink-2)" }}
                >
                  {locale === "ko" ? "진행 설정" : "Progression"}
                </span>
                <span
                  className="v2-small"
                  style={{
                    fontWeight: 700,
                    color: "var(--v2-ink)",
                  }}
                >
                  {info.progressionNote}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
