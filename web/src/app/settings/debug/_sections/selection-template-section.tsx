"use client";

import { useMemo, useState } from "react";
import { MultiSelectionScreen, PickerSelectionScreen, SingleSelectionScreen } from "@/components/ui/selection-screen-template";
import { useLocale } from "@/components/locale-provider";
import { commonExerciseOptions, statsMetricOptions } from "@/lib/selection-options";

export function SelectionTemplateSection() {
  const { locale } = useLocale();
  const [singleValue, setSingleValue] = useState("DATE");
  const [multiValues, setMultiValues] = useState<string[]>(["e1rm", "volume"]);
  const [searchValue, setSearchValue] = useState("Back Squat");
  const [dateValue, setDateValue] = useState(new Date().toISOString().slice(0, 10));
  const [timeValue, setTimeValue] = useState("08:00");
  const [numberValue, setNumberValue] = useState("90");

  const metricOptionValues = useMemo(() => new Set(statsMetricOptions.map((option) => option.value)), []);

  return (
    <div>
      <SingleSelectionScreen
        title={locale === "ko" ? "선택 템플릿" : "Selection Template"}
        sectionTitle={locale === "ko" ? "세션 키 방식" : "Session Key Mode"}
        sectionFootnote={locale === "ko" ? "하나를 선택하면 현재 값이 즉시 반영됩니다." : "Selecting one option applies it immediately."}
        selectedValue={singleValue}
        options={[
          { value: "DATE", label: "DATE", description: locale === "ko" ? "YYYY-MM-DD 키를 사용합니다." : "Use YYYY-MM-DD keys." },
          { value: "LEGACY", label: "LEGACY", description: locale === "ko" ? "WnDn 키를 사용합니다." : "Use WnDn keys." },
        ]}
        onSelect={setSingleValue}
      />

      <MultiSelectionScreen
        title={locale === "ko" ? "선택 템플릿" : "Selection Template"}
        sectionTitle={locale === "ko" ? "지표 섹션" : "Metric Sections"}
        sectionFootnote={locale === "ko" ? "여러 항목을 선택한 뒤 적용하세요." : "Choose multiple items, then apply them."}
        selectedValues={multiValues}
        options={statsMetricOptions.map((option) => ({
          value: option.value,
          label: option.label,
          description: option.description,
        }))}
        onToggle={(next) => {
          setMultiValues((prev) => {
            const current = new Set(prev);
            if (current.has(next)) current.delete(next);
            else current.add(next);
            const filtered = Array.from(current).filter((value) => metricOptionValues.has(value));
            return filtered;
          });
        }}
        onApply={() => undefined}
      />

      <SingleSelectionScreen
        title={locale === "ko" ? "선택 템플릿" : "Selection Template"}
        sectionTitle={locale === "ko" ? "운동" : "Exercise"}
        sectionFootnote={locale === "ko" ? "검색 후 원하는 운동을 선택하세요." : "Search and select the exercise you want."}
        searchable
        selectedValue={searchValue}
        options={commonExerciseOptions.map((option) => ({
          value: option.value,
          label: option.label,
          keywords: option.keywords,
        }))}
        onSelect={setSearchValue}
      />

      <PickerSelectionScreen
        title={locale === "ko" ? "선택 템플릿" : "Selection Template"}
        sectionTitle={locale === "ko" ? "날짜" : "Date"}
        sectionFootnote={locale === "ko" ? "시스템 날짜 입력을 사용합니다." : "Uses the system date input."}
        inputLabel={locale === "ko" ? "날짜" : "Date"}
        inputType="date"
        value={dateValue}
        onValueChange={setDateValue}
        onApply={() => undefined}
      />

      <PickerSelectionScreen
        title={locale === "ko" ? "선택 템플릿" : "Selection Template"}
        sectionTitle={locale === "ko" ? "시간" : "Time"}
        sectionFootnote={locale === "ko" ? "시스템 시간 입력을 사용합니다." : "Uses the system time input."}
        inputLabel={locale === "ko" ? "시간" : "Time"}
        inputType="time"
        value={timeValue}
        onValueChange={setTimeValue}
        onApply={() => undefined}
      />

      <PickerSelectionScreen
        title={locale === "ko" ? "선택 템플릿" : "Selection Template"}
        sectionTitle={locale === "ko" ? "숫자" : "Number"}
        sectionFootnote={locale === "ko" ? "정수 범위를 지정해 입력합니다." : "Enter a value within the integer range."}
        inputLabel={locale === "ko" ? "일수" : "Days"}
        inputType="number"
        min={1}
        max={365}
        step={1}
        value={numberValue}
        onValueChange={setNumberValue}
        onApply={() => undefined}
      />
    </div>
  );
}
