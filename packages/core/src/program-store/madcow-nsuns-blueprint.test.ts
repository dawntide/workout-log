import { test } from "node:test";
import assert from "node:assert/strict";
import {
  madcowIntensitySets,
  madcowVolumeSets,
  MADCOW_PR_TRIPLE_PERCENT,
} from "./madcow-blueprint";
import { nsunsBenchVolumeSets, nsunsT1Sets, nsunsT2Sets, nsunsTmIncreaseKg } from "./nsuns-blueprint";
import { extractOneRmTargetsFromTemplate } from "./model";

// canonical 테이블 고정 — 프로그램 규칙이 코드 변경으로 조용히 흐르지 않게 잠근다.

test("madcow: 월요일 램프는 12.5% 간격으로 탑세트에 도달한다", () => {
  assert.deepEqual(
    madcowVolumeSets().map((s) => s.percent),
    [0.5, 0.625, 0.75, 0.875, 1.0],
  );
  assert.ok(madcowVolumeSets().every((s) => s.reps === 5));
});

test("madcow: 금요일은 램프 4세트 + PR 트리플(102.5%) + 백오프 8회(75%)", () => {
  const sets = madcowIntensitySets();
  assert.equal(sets.length, 6);
  assert.deepEqual(
    sets.map((s) => s.percent),
    [0.5, 0.625, 0.75, 0.875, MADCOW_PR_TRIPLE_PERCENT, 0.75],
  );
  assert.deepEqual(
    sets.map((s) => s.reps),
    [5, 5, 5, 5, 3, 8],
  );
});

test("nsuns: T1 9세트 퍼센트는 75/85/95 후 90→65 백오프", () => {
  assert.deepEqual(
    nsunsT1Sets("standard").map((s) => s.percent),
    [0.75, 0.85, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65],
  );
});

test("nsuns: T1 reps 패턴이 리프트 성격별로 다르다", () => {
  assert.deepEqual(
    nsunsT1Sets("standard").map((s) => s.reps),
    [5, 3, 1, 3, 3, 3, 5, 5, 5],
  );
  assert.deepEqual(
    nsunsT1Sets("bench").map((s) => s.reps),
    [5, 3, 1, 3, 5, 3, 5, 3, 5],
  );
  assert.deepEqual(
    nsunsT1Sets("deadlift").map((s) => s.reps),
    [5, 3, 1, 3, 3, 3, 3, 3, 3],
  );
});

test("nsuns: 판정 AMRAP은 95% 세트 하나뿐이다(마지막 백오프가 덮어쓰지 않도록)", () => {
  for (const pattern of ["standard", "bench", "deadlift"] as const) {
    const flags = nsunsT1Sets(pattern).map((s) => s.amrap === true);
    assert.deepEqual(
      flags,
      [false, false, true, false, false, false, false, false, false],
      pattern,
    );
  }
});

test("nsuns: T2는 50/60/70 8세트, 벤치 볼륨일은 피라미드 9세트", () => {
  assert.deepEqual(
    nsunsT2Sets().map((s) => s.percent),
    [0.5, 0.6, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7],
  );
  assert.deepEqual(
    nsunsT2Sets().map((s) => s.reps),
    [5, 5, 3, 5, 7, 4, 6, 8],
  );
  assert.deepEqual(
    nsunsBenchVolumeSets().map((s) => s.reps),
    [8, 6, 4, 4, 4, 5, 6, 7, 8],
  );
  // 볼륨일은 판정하지 않으므로 amrap 표시가 없다.
  assert.ok(nsunsBenchVolumeSets().every((s) => s.amrap !== true));
});

test("nsuns: AMRAP reps 구간별 TM 증가폭", () => {
  assert.equal(nsunsTmIncreaseKg(0), 0);
  assert.equal(nsunsTmIncreaseKg(1), 0);
  assert.equal(nsunsTmIncreaseKg(2), 2.5);
  assert.equal(nsunsTmIncreaseKg(3), 2.5);
  assert.equal(nsunsTmIncreaseKg(4), 5);
  assert.equal(nsunsTmIncreaseKg(5), 5);
  assert.equal(nsunsTmIncreaseKg(6), 7.5);
  assert.equal(nsunsTmIncreaseKg(12), 7.5);
});

test("퍼센트 파생 프로그램은 1RM을 family가 아니라 운동별로 입력받는다", () => {
  // family로 뭉치면 Front Squat이 백스쿼트 TM을, Close-Grip이 벤치 TM을 물려받아 과중량이 된다.
  const template = {
    latestVersion: {
      definition: {
        kind: "manual",
        programFamily: "nsuns-lp",
        sessions: [
          {
            key: "D4",
            items: [
              { exerciseName: "Deadlift", sets: [{ reps: 5 }] },
              { exerciseName: "Front Squat", sets: [{ reps: 5 }] },
            ],
          },
          {
            key: "D5",
            items: [
              { exerciseName: "Bench Press", sets: [{ reps: 5 }] },
              { exerciseName: "Close-Grip Bench Press", sets: [{ reps: 5 }] },
            ],
          },
        ],
      },
    },
  };

  const keys = extractOneRmTargetsFromTemplate(template as never).map((t) => t.key);
  assert.deepEqual(keys, [
    "EX_DEADLIFT",
    "EX_FRONT_SQUAT",
    "EX_BENCH_PRESS",
    "EX_CLOSE_GRIP_BENCH_PRESS",
  ]);
});

test("일반 manual 프로그램은 기존대로 family 키로 1RM을 받는다(회귀)", () => {
  const template = {
    latestVersion: {
      definition: {
        kind: "manual",
        sessions: [
          {
            key: "A",
            items: [
              { exerciseName: "High-Bar Back Squat", sets: [{ reps: 5 }] },
              { exerciseName: "Bench Press", sets: [{ reps: 5 }] },
            ],
          },
        ],
      },
    },
  };

  assert.deepEqual(
    extractOneRmTargetsFromTemplate(template as never).map((t) => t.key),
    ["SQUAT", "BENCH"],
  );
});
