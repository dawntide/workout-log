"use client";

import { V2Segmented } from "@/components/v2/primitives";
import {
  EXERCISE_CATEGORY_FILTERS,
  EXERCISE_EQUIPMENT_FILTERS,
} from "@workout/core/exercise/search-filters";
import type { AppLocale } from "@/lib/i18n/messages";

const ALL = "all";

const CATEGORY_LABELS: Record<string, string> = {
  Legs: "하체",
  Back: "등",
  Chest: "가슴",
  Shoulder: "어깨",
  Arm: "팔",
  Core: "코어",
  Glute: "둔근",
};

const EQUIPMENT_LABELS: Record<string, { ko: string; en: string }> = {
  barbell: { ko: "바벨", en: "Barbell" },
  dumbbell: { ko: "덤벨", en: "Dumbbell" },
  machine: { ko: "머신", en: "Machine" },
  cable: { ko: "케이블", en: "Cable" },
  bodyweight: { ko: "맨몸", en: "Bodyweight" },
};

/**
 * 가로로 넘치는 필터 줄. 부위 7종·장비 5종이라 좁은 화면에서는 트랙이 화면을
 * 넘어간다 — 줄바꿈 대신 스크롤로 흘린다(시트의 세로 공간은 결과 목록 몫이다).
 */
function FilterRow({
  ariaLabel,
  allLabel,
  values,
  labelOf,
  value,
  onChange,
}: {
  ariaLabel: string;
  allLabel: string;
  values: readonly string[];
  labelOf: (value: string) => string;
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  return (
    <div
      data-no-swipe="true"
      style={{
        overflowX: "auto",
        overflowY: "hidden",
        // 스크롤바가 자리를 먹지 않게 — 칩 줄은 시트에서 부수적인 요소다.
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <V2Segmented
        size="sm"
        ariaLabel={ariaLabel}
        value={value ?? ALL}
        onChange={(next) => onChange(next === ALL ? null : next)}
        options={[
          // "전체"가 차원 이름을 달고 있다. 두 줄이 나란히 서므로 라벨 없는 "전체"
          // 두 개는 어느 쪽이 부위인지 알 수 없고, 별도 라벨 줄을 붙이면 높이가 는다.
          { value: ALL, label: allLabel },
          ...values.map((item) => ({
            value: item,
            label: labelOf(item),
            // aria는 항상 원본 값이다 — E2E·스크린리더가 로케일에 흔들리지 않게.
            ariaLabel: item,
          })),
        ]}
        style={{ minWidth: "max-content" }}
      />
    </div>
  );
}

/**
 * 검색 시트의 부위·장비 필터.
 *
 * 카탈로그가 755종이 되면서 `"squat"` 한 번에 57건, `"press"`는 101건이 나온다.
 * **필터는 서버가 적용한다** — 클라이언트가 받은 20건 안에서 거르면 필터를 켤수록
 * 결과가 줄기만 하고 새 후보는 올라오지 않는다.
 */
export function ExerciseFilterChips({
  locale,
  category,
  onCategoryChange,
  equipment,
  onEquipmentChange,
}: {
  locale: AppLocale;
  category: string | null;
  onCategoryChange: (next: string | null) => void;
  equipment: string | null;
  onEquipmentChange: (next: string | null) => void;
}) {
  const ko = locale === "ko";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--v2-s-2)",
        marginTop: "var(--v2-s-3)",
      }}
    >
      <FilterRow
        ariaLabel={ko ? "부위 필터" : "Body part filter"}
        allLabel={ko ? "전체 부위" : "All parts"}
        values={EXERCISE_CATEGORY_FILTERS}
        // 영문 로케일에서는 카탈로그 값이 곧 표시명이다(Legs/Back/…).
        labelOf={(value) => (ko ? (CATEGORY_LABELS[value] ?? value) : value)}
        value={category}
        onChange={onCategoryChange}
      />
      <FilterRow
        ariaLabel={ko ? "장비 필터" : "Equipment filter"}
        allLabel={ko ? "전체 장비" : "All equipment"}
        values={EXERCISE_EQUIPMENT_FILTERS}
        labelOf={(value) => EQUIPMENT_LABELS[value]?.[ko ? "ko" : "en"] ?? value}
        value={equipment}
        onChange={onEquipmentChange}
      />
    </div>
  );
}
