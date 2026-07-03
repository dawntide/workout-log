// Go/TS 파리티 golden fixture 테스트 (TS 측).
// 같은 fixture를 apps/tui/internal/ui/golden_fixtures_test.go 가 읽는다 —
// 어느 한쪽의 파싱/변환 로직이 바뀌면 해당 쪽 CI가 깨져 드리프트를 검출한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildSessionKey,
  formatSessionKeyLabel,
  parseSessionKey,
} from "./session-key";
import {
  bodyweightAddedSuffix,
  isBodyweightExerciseName,
  prescriptionToExternalLoadKg,
  resolveLoggedTotalLoadKg,
} from "./bodyweight-load";

const sessionKeyFixture = JSON.parse(
  readFileSync(new URL("../fixtures/session-key.json", import.meta.url), "utf8"),
) as {
  cases: Array<{
    key: string;
    parsed: {
      kind: string;
      sessionDate: string | null;
      cycle: number | null;
      week: number | null;
      day: number | null;
    } | null;
    tsLabel: string;
    cycleLabel: string;
  }>;
  build: Array<{
    input: {
      mode: string;
      sessionDate: string;
      week: number;
      day: number;
      cycle?: number | null;
      autoProgression?: boolean;
    };
    expected: string;
  }>;
};

const bodyweightFixture = JSON.parse(
  readFileSync(new URL("../fixtures/bodyweight-load.json", import.meta.url), "utf8"),
) as {
  isBodyweight: Array<{ name: string; expected: boolean }>;
  prescriptionToExternal: Array<{
    name: string;
    totalKg: number;
    bodyweightKg: number | null;
    expected: number;
  }>;
  loggedTotal: Array<{
    name: string;
    weightKg: number;
    metaTotalLoadKg: number | null;
    expected: number;
  }>;
  addedSuffix: Array<{ addedKg: number; expectedKo: string }>;
};

test("golden fixture: parseSessionKey + labels", () => {
  for (const c of sessionKeyFixture.cases) {
    const parsed = parseSessionKey(c.key);
    if (c.parsed === null) {
      assert.equal(parsed, null, `parse(${JSON.stringify(c.key)})`);
    } else {
      assert.ok(parsed, `parse(${JSON.stringify(c.key)})`);
      assert.equal(parsed.kind, c.parsed.kind, `kind(${c.key})`);
      assert.equal(parsed.sessionDate, c.parsed.sessionDate, `sessionDate(${c.key})`);
      assert.equal(parsed.cycle, c.parsed.cycle, `cycle(${c.key})`);
      assert.equal(parsed.week, c.parsed.week, `week(${c.key})`);
      assert.equal(parsed.day, c.parsed.day, `day(${c.key})`);
    }
    assert.equal(formatSessionKeyLabel(c.key), c.tsLabel, `tsLabel(${c.key})`);

    // cycleLabel(Go sessionLabel 동치): cycle-wave/date-progression → CxWyDz, wave → WxDy, 그 외 "".
    const cycleLabel = (() => {
      if (!parsed) return "";
      if (parsed.kind === "cycle-wave" || parsed.kind === "date-progression") {
        return `C${parsed.cycle}W${parsed.week}D${parsed.day}`;
      }
      if (parsed.kind === "wave") return `W${parsed.week}D${parsed.day}`;
      return "";
    })();
    assert.equal(cycleLabel, c.cycleLabel, `cycleLabel(${c.key})`);
  }
});

test("golden fixture: buildSessionKey", () => {
  for (const c of sessionKeyFixture.build) {
    assert.equal(buildSessionKey(c.input), c.expected, JSON.stringify(c.input));
  }
});

test("golden fixture: bodyweight keywords + load conversions", () => {
  for (const c of bodyweightFixture.isBodyweight) {
    assert.equal(
      isBodyweightExerciseName(c.name),
      c.expected,
      `isBodyweight(${JSON.stringify(c.name)})`,
    );
  }
  for (const c of bodyweightFixture.prescriptionToExternal) {
    assert.equal(
      prescriptionToExternalLoadKg(c.name, c.totalKg, c.bodyweightKg),
      c.expected,
      `prescriptionToExternal(${c.name}, ${c.totalKg}, ${c.bodyweightKg})`,
    );
  }
  for (const c of bodyweightFixture.loggedTotal) {
    assert.equal(
      resolveLoggedTotalLoadKg({
        exerciseName: c.name,
        weightKg: c.weightKg,
        meta: c.metaTotalLoadKg === null ? null : { totalLoadKg: c.metaTotalLoadKg },
      }),
      c.expected,
      `loggedTotal(${c.name}, ${c.weightKg}, ${c.metaTotalLoadKg})`,
    );
  }
  const BW = 90;
  for (const c of bodyweightFixture.addedSuffix) {
    assert.equal(
      bodyweightAddedSuffix("Weighted Pull-Up", BW + c.addedKg, BW, "ko"),
      c.expectedKo,
      `addedSuffix(${c.addedKg})`,
    );
  }
});
