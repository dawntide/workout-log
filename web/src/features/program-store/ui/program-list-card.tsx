"use client";

import {
  V2Chip,
  V2PrimaryBtn,
  V2SecondaryBtn,
  type V2ChipTone,
} from "@/components/v2/primitives";
import { V2Icon } from "@/components/v2/primitives/v2-icon";
import { formatProgramDisplayName } from "@/features/program-store/model/view";
import {
  getProgramDetailInfo,
  type ProgramListItem,
} from "@workout/core/program-store/model";

function tagChipTone(tag: string): V2ChipTone {
  const normalized = tag.toLowerCase().trim();
  if (["manual", "fixed", "custom"].some((k) => normalized.includes(k))) {
    return "neutral";
  }
  if (
    ["beginner", "novice", "starter", "입문", "초보"].some((k) =>
      normalized.includes(k),
    )
  ) {
    return "info";
  }
  if (
    ["amrap", "top-set", "topset", "top set", "rpe", "rir"].some((k) =>
      normalized.includes(k),
    )
  ) {
    return normalized.includes("amrap") ? "warning" : "onerm";
  }
  if (
    ["strength", "power", "hypertrophy", "근력", "파워", "근비대"].some((k) =>
      normalized.includes(k),
    )
  ) {
    return "accent";
  }
  if (
    ["linear", "progression", "wave", "periodization", "선형", "주기화"].some(
      (k) => normalized.includes(k),
    )
  ) {
    return "weight";
  }
  if (
    ["base", "variant", "template", "library", "operator"].some((k) =>
      normalized.includes(k),
    )
  ) {
    return "accent";
  }
  return "neutral";
}

function programCardBadge(item: ProgramListItem, locale: "ko" | "en") {
  const tags = (item.template.tags ?? []).map((tag) => tag.toLowerCase());
  const isBeginnerProgram = tags.some((tag) =>
    ["novice", "beginner", "입문", "초보"].includes(tag),
  );

  if (item.source === "CUSTOM") {
    return {
      label: locale === "ko" ? "커스텀" : "Custom",
      color: "var(--v2-c-info)",
    };
  }

  if (isBeginnerProgram) {
    return {
      label: locale === "ko" ? "입문 추천" : "Beginner Pick",
      color: "var(--v2-c-success)",
    };
  }

  return {
    label: locale === "ko" ? "공식" : "Official",
    color: "var(--v2-accent)",
  };
}

type ProgramListCardProps = {
  item: ProgramListItem;
  locale: "ko" | "en";
  onPress: () => void;
};

export function ProgramListCard({
  item,
  locale,
  onPress,
}: ProgramListCardProps) {
  const info = getProgramDetailInfo(item.template, locale);
  const tags = Array.isArray(item.template.tags) ? item.template.tags : [];
  const isMarket = item.source === "MARKET";
  const badge = programCardBadge(item, locale);

  const difficultyStat = info.stats.find((stat) => stat.key === "difficulty");
  const frequencyStat = info.stats.find((stat) => stat.key === "frequency");
  const cycleStat = info.stats.find((stat) => stat.key === "cycle");
  const splitStat = info.stats.find((stat) => stat.key === "split");
  const periodStat = info.stats.find((stat) => stat.key === "duration");

  const levelLabel =
    difficultyStat?.value ?? (locale === "ko" ? "일반" : "Standard");
  const frequencyLabel = frequencyStat?.value ?? splitStat?.value ?? null;
  const durationLabel = cycleStat?.value ?? periodStat?.value ?? null;

  const intensityMap: Record<string, number> = {
    Beginner: 2,
    Intermediate: 3,
    Advanced: 4,
    Standard: 3,
    초급: 2,
    중급: 3,
    고급: 4,
    일반: 3,
  };
  const intensityFill = intensityMap[levelLabel] ?? 3;

  const metaItems = [
    durationLabel
      ? {
          icon: "calendar_today",
          label: locale === "ko" ? "기간" : "Duration",
          value: durationLabel,
        }
      : null,
    frequencyLabel
      ? {
          icon: "event_repeat",
          label: locale === "ko" ? "빈도" : "Frequency",
          value: frequencyLabel,
        }
      : null,
    {
      icon: "leaderboard",
      label: locale === "ko" ? "난이도" : "Difficulty",
      value: levelLabel,
    },
  ].filter(
    (meta): meta is { icon: string; label: string; value: string } =>
      meta !== null,
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPress}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onPress();
      }}
      className="v2-pressable"
      style={{
        background: "var(--v2-paper)",
        borderRadius: "var(--v2-r-3)",
        padding: "var(--v2-s-6)",
        cursor: "pointer",
        marginBottom: "var(--v2-s-4)",
        outline: "none",
        boxShadow: "var(--v2-elev-1)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "var(--v2-s-2)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            className="v2-mono-label"
            style={{
              fontSize: "var(--v2-t-eyebrow)",
              letterSpacing: "0.1em",
              padding: "2px var(--v2-s-2)",
              borderRadius: "var(--v2-r-0)",
              display: "inline-block",
              textTransform: "uppercase",
              color: badge.color,
              background: `color-mix(in srgb, ${badge.color} 15%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${badge.color} 20%, transparent)`,
            }}
          >
            {badge.label}
          </span>
          <h2
            className="v2-h2"
            style={{
              fontSize: "var(--v2-t-20)",
              margin: "var(--v2-s-1) 0 2px",
              lineHeight: 1.2,
            }}
          >
            {formatProgramDisplayName(item.name)}
          </h2>
          {item.subtitle ? (
            <p
              className="v2-small"
              style={{ color: "var(--v2-ink-2)", margin: 0 }}
            >
              {item.subtitle}
            </p>
          ) : null}
        </div>
        {tags.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--v2-s-1)",
              justifyContent: "flex-end",
              flexShrink: 0,
              marginLeft: "var(--v2-s-2)",
            }}
          >
            {tags.slice(0, 2).map((tag) => (
              <V2Chip key={tag} tone={tagChipTone(tag)}>
                {tag}
              </V2Chip>
            ))}
          </div>
        ) : null}
      </div>

      {item.description ? (
        <p
          className="v2-small"
          style={{
            color: "var(--v2-ink-2)",
            margin: "0 0 var(--v2-s-2)",
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {item.description}
        </p>
      ) : null}

      {metaItems.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--v2-s-4)",
            marginBottom: "var(--v2-s-4)",
            background: "var(--v2-paper-2)",
            padding: "var(--v2-s-2) var(--v2-s-4)",
            borderRadius: "var(--v2-r-2)",
          }}
        >
          {metaItems.map((meta) => (
            <div
              key={meta.label}
              style={{ display: "flex", flexDirection: "column", gap: 2 }}
            >
              <span className="v2-eyebrow">{meta.label}</span>
              <span
                className="v2-small"
                style={{
                  color: "var(--v2-ink)",
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--v2-s-1)",
                }}
              >
                <V2Icon
                  name={meta.icon}
                  style={{ fontSize: "var(--v2-t-14)" }}
                />
                {meta.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--v2-s-2)",
        }}
      >
        <div style={{ flex: 1 }}>
          <span
            className="v2-eyebrow"
            style={{ display: "block", marginBottom: "var(--v2-s-1)" }}
          >
            {locale === "ko" ? "강도" : "Intensity"}
          </span>
          <div style={{ display: "flex", gap: "var(--v2-s-1)" }}>
            {[1, 2, 3, 4, 5].map((index) => (
              <div
                key={index}
                style={{
                  height: 6,
                  flex: 1,
                  borderRadius: "var(--v2-r-pill)",
                  background:
                    index <= intensityFill
                      ? "var(--v2-accent)"
                      : "var(--v2-paper-4)",
                }}
              />
            ))}
          </div>
        </div>
        <span
          onClick={(event) => event.stopPropagation()}
          style={{ flexShrink: 0 }}
        >
          {isMarket ? (
            <V2PrimaryBtn
              onClick={onPress}
              style={{
                padding: "var(--v2-s-3) var(--v2-s-5)",
                minHeight: "var(--v2-s-8)",
                fontSize: "var(--v2-t-small)",
              }}
            >
              {locale === "ko" ? "시작하기" : "Start"}
            </V2PrimaryBtn>
          ) : (
            <V2SecondaryBtn
              onClick={onPress}
              style={{
                padding: "var(--v2-s-3) var(--v2-s-5)",
                minHeight: "var(--v2-s-8)",
                fontSize: "var(--v2-t-small)",
              }}
            >
              {locale === "ko" ? "편집" : "Edit"}
            </V2SecondaryBtn>
          )}
        </span>
      </div>
    </div>
  );
}
