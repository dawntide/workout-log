"use client";

import { type CSSProperties } from "react";
import { TermBadge } from "@/components/v2/terminal";
import { formatProgramDisplayName } from "@/features/program-store/model/view";
import {
  getProgramDescription,
  getProgramDetailInfo,
  type ProgramListItem,
} from "@workout/core/program-store/model";

// paper ProgramListCard와 동일 난이도→강도(1~5) 매핑.
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

// terminal(ironlog) 프로그램 스토어 브라우즈 — paper ProgramStoreBrowseContent의
// terminal 대응. 검색 + 카테고리 탭 + 프로그램 리스트(선택→상세 시트) + 생성.
// market/customListItems는 이미 검색·카테고리 필터됨. 상세/시작/커스터마이즈/생성
// 시트는 화면에서 cascade로 재사용(리스킨). TermShell ViewPane 안 렌더라 외곽 패딩 없음.

type Props = {
  locale: "ko" | "en";
  error: string | null;
  notice: string | null;
  storeQuery: string;
  categoryFilter: string;
  marketListItems: ProgramListItem[];
  customListItems: ProgramListItem[];
  categoryOptions: ReadonlyArray<{ key: string; label: string }>;
  isStoreSettled: boolean;
  onChangeStoreQuery: (value: string) => void;
  onChangeCategoryFilter: (value: string) => void;
  onSelectItem: (item: ProgramListItem) => void;
  onOpenCreateSheet: () => void;
};

export function ProgramStoreTuiBrowse({
  locale,
  error,
  notice,
  storeQuery,
  categoryFilter,
  marketListItems,
  customListItems,
  categoryOptions,
  isStoreSettled,
  onChangeStoreQuery,
  onChangeCategoryFilter,
  onSelectItem,
  onOpenCreateSheet,
}: Props) {
  const ko = locale === "ko";
  return (
    <section
      aria-label={ko ? "프로그램 스토어" : "Program Store"}
      style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-3)" }}
    >
      {/* 검색 */}
      <input
        type="text"
        value={storeQuery}
        onChange={(e) => onChangeStoreQuery(e.target.value)}
        placeholder={ko ? "프로그램 검색…" : "search programs…"}
        aria-label={ko ? "프로그램 검색" : "Search programs"}
        className="v2-mono-label"
        style={{
          minHeight: "var(--v2-touch)",
          padding: "0 var(--v2-s-2)",
          background: "var(--term-inset)",
          border: "none",
          outline: "none",
          color: "var(--term-fg)",
        }}
      />

      {/* 카테고리 탭 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--v2-s-1)" }}>
        {categoryOptions.map((c) => {
          const active = c.key === categoryFilter;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onChangeCategoryFilter(c.key)}
              className="v2-mono-label"
              style={tabStyle(active)}
            >
              [{c.label}
              {active ? "*" : ""}]
            </button>
          );
        })}
      </div>

      {error ? (
        <span className="v2-mono-label" style={{ color: "var(--term-red)" }}>
          {error}
        </span>
      ) : null}
      {notice ? (
        <span className="v2-mono-label" style={{ color: "var(--term-green)" }}>
          {notice}
        </span>
      ) : null}

      {!isStoreSettled ? (
        <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
          …
        </span>
      ) : (
        <>
          <ProgramSection
            label={ko ? "프로그램" : "programs"}
            items={marketListItems}
            emptyText={ko ? "결과 없음" : "no results"}
            locale={locale}
            onSelectItem={onSelectItem}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}>
            <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
              {ko ? "내 프로그램" : "custom"}
            </span>
            {customListItems.map((item) => (
              <ProgramRow key={item.template.id} item={item} locale={locale} onSelect={onSelectItem} />
            ))}
            <button
              type="button"
              onClick={onOpenCreateSheet}
              className="v2-mono-label"
              style={{
                width: "100%",
                minHeight: "var(--v2-touch)",
                padding: "var(--v2-s-2) var(--v2-s-3)",
                background: "transparent",
                border: "none",
                boxShadow: "inset 0 0 0 1px var(--term-line-box)",
                color: "var(--term-cyan)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              [+ {ko ? "프로그램 만들기" : "create program"}]
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function ProgramSection({
  label,
  items,
  emptyText,
  locale,
  onSelectItem,
}: {
  label: string;
  items: ProgramListItem[];
  emptyText: string;
  locale: "ko" | "en";
  onSelectItem: (item: ProgramListItem) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-2)" }}>
      <span className="v2-mono-label" style={{ color: "var(--term-dim)" }}>
        {label}
      </span>
      {items.length === 0 ? (
        <span className="v2-mono-label" style={{ color: "var(--term-ghost)" }}>
          {emptyText}
        </span>
      ) : (
        items.map((item) => (
          <ProgramRow key={item.template.id} item={item} locale={locale} onSelect={onSelectItem} />
        ))
      )}
    </div>
  );
}

// 강도 글리프 바 — block 글리프(▓ fill / ░ track), 5칸. terminal R1 글리프 허용 구역.
function intensityBar(fill: number): string {
  const clamped = Math.max(0, Math.min(5, fill));
  return "▓".repeat(clamped) + "░".repeat(5 - clamped);
}

function ProgramRow({
  item,
  locale,
  onSelect,
}: {
  item: ProgramListItem;
  locale: "ko" | "en";
  onSelect: (item: ProgramListItem) => void;
}) {
  const ko = locale === "ko";
  const tags = (item.template.tags ?? []).slice(0, 2).join(" · ");

  // paper ProgramListCard와 동일 데이터원: getProgramDetailInfo의 stats + 강도 매핑.
  const info = getProgramDetailInfo(item.template, locale);
  const difficultyStat = info.stats.find((s) => s.key === "difficulty");
  const frequencyStat = info.stats.find((s) => s.key === "frequency");
  const cycleStat = info.stats.find((s) => s.key === "cycle");
  const splitStat = info.stats.find((s) => s.key === "split");
  const durationStat = info.stats.find((s) => s.key === "duration");

  const difficultyLevel =
    difficultyStat?.value ?? (ko ? "일반" : "Standard");
  const frequencyValue = frequencyStat?.value ?? splitStat?.value ?? null;
  const cycleValue = cycleStat?.value ?? durationStat?.value ?? null;
  const intensityFill = INTENSITY_MAP[difficultyLevel] ?? 3;

  // paper 카드의 깔끔한 소개글(코드 사전)을 1줄 dim으로. concat된 item.description 대신 사용.
  const description = getProgramDescription(item.template, locale) ?? null;

  // 메타 readout: 사이클 · 빈도 (값이 있을 때만, 의미없는 "-"는 제외).
  const metaParts = [cycleValue, frequencyValue].filter(
    (v): v is string => Boolean(v) && v !== "-",
  );

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="v2-mono-label"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--v2-s-1)",
        minHeight: "var(--v2-touch)",
        padding: "var(--v2-s-2)",
        background: "var(--term-panel)",
        border: "none",
        boxShadow: "inset 0 0 0 1px var(--term-line-box)",
        borderRadius: "var(--v2-r-2)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {/* 헤더: 이름 + 태그 / 배지 / 셰브론 */}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--v2-s-2)",
          width: "100%",
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "var(--term-fg)",
          }}
        >
          {formatProgramDisplayName(item.name)}
          {tags ? (
            <span style={{ color: "var(--term-dim)" }}> · {tags}</span>
          ) : null}
        </span>
        {item.source === "CUSTOM" ? <TermBadge tone="accent">CUSTOM</TermBadge> : null}
        <span style={{ color: "var(--term-ghost)" }}>▸</span>
      </span>

      {/* 소개 1줄(dim) */}
      {description ? (
        <span
          style={{
            color: "var(--term-dim)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {description}
        </span>
      ) : null}

      {/* 메타 readout + 강도 글리프 바 */}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--v2-s-1) var(--v2-s-3)",
          color: "var(--term-dim)",
        }}
      >
        {metaParts.map((part, i) => (
          <span key={i} style={{ color: "var(--term-cyan)" }}>
            {part}
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--v2-s-1)" }}>
          <span aria-hidden style={{ color: "var(--term-amber)", letterSpacing: 0 }}>
            {intensityBar(intensityFill)}
          </span>
          <span style={{ color: "var(--term-fg)" }}>{intensityFill}/5</span>
        </span>
      </span>
    </button>
  );
}

function tabStyle(active: boolean): CSSProperties {
  return {
    minHeight: "var(--v2-touch)",
    padding: "0 var(--v2-s-2)",
    background: "transparent",
    border: "none",
    color: active ? "var(--term-amber)" : "var(--term-dim)",
    cursor: "pointer",
  };
}
