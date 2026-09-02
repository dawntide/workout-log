import assert from "node:assert/strict";
import test from "node:test";

import { createInitialRef5State } from "@workout/core/program-engine/ref5";
import { buildRef5Status } from "@workout/core/program-engine/ref5-status";
import {
  buildRef5OapProgressRows,
  buildRef5WindowProgressRows,
  getRef5OapProgressDescription,
  getRef5WindowProgressDescription,
} from "./window-progress";

test("REF5 window rows name hard and focus streams explicitly", () => {
  const state = createInitialRef5State();
  state.mainWindows.SQ.exposures.push({
    eventId: "event-1",
    sessionId: "session-1",
    stream: "SQ_H3",
    outcome: "PASS",
  });

  const rows = buildRef5WindowProgressRows(buildRef5Status(state), "ko");

  assert.deepEqual(
    rows.map(({ label, current, threshold }) => ({ label, current, threshold })),
    [
      { label: "SQ 하드", current: 1, threshold: 6 },
      { label: "BP 집중", current: 0, threshold: 4 },
      { label: "PULL 집중", current: 0, threshold: 4 },
      { label: "DL", current: 0, threshold: 4 },
      { label: "OHP", current: 0, threshold: 4 },
    ],
  );
});

test("REF5 window rows surface the §18 gain rate and ↑/→ flow", () => {
  const state = createInitialRef5State();
  state.mainWindows.SQ.completedWindowCount = 3;
  state.mainWindows.SQ.increaseWindowCount = 2;
  state.mainWindows.SQ.recentResults = ["INCREASE", "MAINTAIN", "INCREASE"];

  const rows = buildRef5WindowProgressRows(buildRef5Status(state), "ko");
  const sq = rows.find((row) => row.key === "SQ")!;
  assert.equal(sq.gainRatePercent, 67); // round(2 / 3 · 100)
  assert.equal(sq.flow, "↑ → ↑");

  // A not-yet-judged window reports null so the UI hides it instead of "0%".
  const bp = rows.find((row) => row.key === "BP")!;
  assert.equal(bp.gainRatePercent, null);
  assert.equal(bp.flow, "");
});

test("REF5 window guidance defines hard and focus plus the volume-fail exception", () => {
  const description = getRef5WindowProgressDescription("ko");

  assert.match(description, /하드 = .*H3\(3×3\).*H2\(3×2\)/);
  assert.match(description, /집중 = .*BP·PULL 3×3/);
  assert.match(description, /볼륨 세트는 횟수에서 제외/);
  assert.match(description, /볼륨 FAIL은 최종 판정에 반영/);
});

test("REF5 OAP rows show the rung, the promotion streak and the latched flags (§18)", () => {
  const state = createInitialRef5State();
  state.oap.left.rung = 4;
  state.oap.left.passStreak = 2;
  state.oap.left.negativesUnlocked = true;
  state.oap.right.rung = 6;
  state.oap.right.achieved = true;
  state.oap.right.negativesUnlocked = true;

  const rows = buildRef5OapProgressRows(buildRef5Status(state), "ko");
  assert.deepEqual(rows.map((row) => row.label), ["OAP 좌", "OAP 우"]);
  assert.equal(rows[0]?.rungText, "4단 상박");
  assert.equal(rows[0]?.streakText, "PASS 2/3");
  assert.deepEqual(rows[0]?.badges, ["네거티브"]);
  assert.equal(rows[1]?.rungText, "6단 프리");
  assert.deepEqual(rows[1]?.badges, ["달성", "네거티브"]);

  const english = buildRef5OapProgressRows(buildRef5Status(state), "en");
  assert.equal(english[0]?.rungText, "rung 4 upper arm");
  assert.deepEqual(english[1]?.badges, ["achieved", "negatives"]);
});

test("REF5 OAP guidance says the ladder is independent of the PULL standard (§7.5)", () => {
  const ko = getRef5OapProgressDescription("ko");
  assert.match(ko, /3연속 PASS/);
  assert.match(ko, /2연속 FAIL/);
  assert.match(ko, /PULL/);
  const en = getRef5OapProgressDescription("en");
  assert.match(en, /six-rung/);
  assert.match(en, /PULL/);
});
