"use client";

import { useMemo } from "react";
import { AppTextInput } from "@/components/ui/form-controls";
import { V2SecondaryBtn } from "@/components/v2/primitives";
import { V2Icon } from "@/components/v2/primitives/v2-icon";
import { useLocale } from "@/components/locale-provider";

export type ExercisePickerOption = {
  id: string;
  name: string;
  category: string | null;
};

/**
 * 설정 시트에서 운동종목 하나를 고르는 필드 — 검색 입력 + 결과 리스트박스 + 선택 상태.
 *
 * 종목별 규칙을 다루는 설정 화면이 둘 이상이라(최소 원판·휴식 프리셋) 같은 역할의
 * 컴포넌트를 복제하지 않도록 단일 소스로 뽑았다(디자인 가이드 Hard Rule 5).
 */
export function ExercisePickerField({
  label,
  placeholder,
  exercises,
  query,
  onQueryChange,
  selected,
  onSelect,
}: {
  label: string;
  placeholder: string;
  exercises: ExercisePickerOption[];
  query: string;
  onQueryChange: (next: string) => void;
  selected: ExercisePickerOption | null;
  onSelect: (option: ExercisePickerOption | null) => void;
}) {
  const { locale } = useLocale();

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return exercises;
    return exercises.filter((exercise) =>
      `${exercise.name} ${exercise.category ?? ""}`.toLowerCase().includes(normalized),
    );
  }, [exercises, query]);

  const hasQuery = query.trim().length > 0;

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "var(--v2-s-1)" }}>
      <span
        className="v2-font-text"
        style={{ color: "var(--v2-ink-2)", fontSize: "var(--v2-t-small)" }}
      >
        {label}
      </span>
      <div data-no-swipe="true">
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              insetInlineStart: "0.82rem",
              top: "50%",
              transform: "translateY(-50%)",
              width: "0.9rem",
              height: "0.9rem",
              color: "var(--v2-ink-3)",
              pointerEvents: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <V2Icon name="search" weight={400} style={{ fontSize: "var(--v2-t-18)" }} />
          </span>
          <AppTextInput
            type="text"
            inputMode="search"
            autoComplete="off"
            value={query}
            style={{
              paddingInlineStart: "2.15rem",
              paddingInlineEnd: hasQuery ? "2.25rem" : "var(--v2-s-4)",
            }}
            placeholder={placeholder}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              const first = visible[0] ?? null;
              if (first) onSelect(first);
            }}
          />
          {hasQuery ? (
            <button
              type="button"
              aria-label={locale === "ko" ? "검색어 지우기" : "Clear search query"}
              style={{
                position: "absolute",
                insetInlineEnd: "0.55rem",
                top: "50%",
                transform: "translateY(-50%)",
                width: "24px",
                height: "24px",
                minHeight: "24px",
                borderRadius: "999px",
                background: "var(--v2-paper-3)",
                color: "var(--v2-ink-2)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                border: "none",
                padding: 0,
                lineHeight: 0,
              }}
              onClick={() => onQueryChange("")}
            >
              <V2Icon name="close" weight={500} style={{ fontSize: "var(--v2-t-14)" }} />
            </button>
          ) : null}
        </div>

        {selected ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: "var(--v2-s-2)",
              padding: "var(--v2-s-2)",
              boxShadow: "inset 0 0 0 2px var(--v2-accent)",
              borderRadius: "var(--v2-r-1)",
              background: "color-mix(in srgb, var(--v2-accent) 14%, var(--v2-paper))",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--v2-s-2)",
            }}
          >
            <strong style={{ minWidth: 0 }}>
              {selected.category ? `${selected.name} · ${selected.category}` : selected.name}
            </strong>
            <V2SecondaryBtn className="v2-font-display" onClick={() => onSelect(null)}>
              {locale === "ko" ? "선택 변경" : "Change Selection"}
            </V2SecondaryBtn>
          </div>
        ) : (
          <div
            role="listbox"
            aria-label={locale === "ko" ? "운동종목 검색 결과" : "Exercise search results"}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--v2-s-1)",
              maxHeight: "240px",
              overflowY: "auto",
              paddingTop: "var(--v2-s-2)",
            }}
          >
            {visible.length === 0 ? (
              <span
                className="v2-font-text"
                style={{ color: "var(--v2-ink-2)", fontSize: "var(--v2-t-small)" }}
              >
                {locale === "ko"
                  ? "검색 조건에 맞는 운동종목이 없습니다."
                  : "No exercises match the current search."}
              </span>
            ) : (
              visible.map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    minHeight: "44px",
                    padding: "var(--v2-s-3) var(--v2-s-4)",
                    background: "var(--v2-paper-2)",
                    border: "none",
                    borderRadius: "var(--v2-r-2)",
                    textAlign: "left",
                    fontSize: "var(--v2-t-14)",
                    color: "var(--v2-ink)",
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                  }}
                  onClick={() => onSelect(exercise)}
                >
                  {exercise.category ? `${exercise.name} · ${exercise.category}` : exercise.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </label>
  );
}
