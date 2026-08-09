import assert from "node:assert/strict";
import test from "node:test";

import { devFallbackUserId } from "./dev-fallback";

const KEYS = ["NODE_ENV", "WORKOUT_AUTH_USER_ID", "WORKOUT_WEB_ALLOW_ENV_AUTH"] as const;

/**
 * env를 통째로 갈아끼우고 원복한다. NODE_ENV는 다른 테스트가 읽을 수 있으니
 * 지우는 게 아니라 원래 값으로 되돌린다.
 */
function withEnv(patch: Partial<Record<(typeof KEYS)[number], string | undefined>>, run: () => void) {
  const saved = new Map<string, string | undefined>();
  for (const key of KEYS) saved.set(key, process.env[key]);
  try {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("개발 런타임: 종전대로 폴백이 산다 (.env.local 무수정)", () => {
  withEnv(
    {
      NODE_ENV: "development",
      WORKOUT_AUTH_USER_ID: "00000000-0000-4000-8000-000000c1c1c1",
      WORKOUT_WEB_ALLOW_ENV_AUTH: undefined,
    },
    () => {
      assert.equal(devFallbackUserId(), "00000000-0000-4000-8000-000000c1c1c1");
    },
  );
});

// 이 테스트가 S1의 본체다: Vercel 프로덕션 env에 WORKOUT_AUTH_USER_ID가 실수로
// 들어와도 아무 일이 없어야 한다. 이게 깨지면 전 페이지·전 잔류 API가 무인증으로 열린다.
test("프로덕션: opt-in 없으면 WORKOUT_AUTH_USER_ID가 있어도 죽어 있다", () => {
  withEnv(
    {
      NODE_ENV: "production",
      WORKOUT_AUTH_USER_ID: "00000000-0000-4000-8000-000000c1c1c1",
      WORKOUT_WEB_ALLOW_ENV_AUTH: undefined,
    },
    () => {
      assert.equal(devFallbackUserId(), "");
    },
  );
});

test("프로덕션: opt-in이 1이 아닌 값이면 여전히 죽어 있다", () => {
  for (const flag of ["0", "true", "yes", ""]) {
    withEnv(
      {
        NODE_ENV: "production",
        WORKOUT_AUTH_USER_ID: "00000000-0000-4000-8000-000000c1c1c1",
        WORKOUT_WEB_ALLOW_ENV_AUTH: flag,
      },
      () => {
        assert.equal(devFallbackUserId(), "", `flag=${JSON.stringify(flag)}`);
      },
    );
  }
});

// E2E는 prod 빌드로 돌면서 이 폴백에 의존한다(ci.yml·e2e-nightly.yml).
// 이 문이 막히면 CI가 죽으므로 계약으로 고정한다.
test("프로덕션 + opt-in=1: E2E가 쓰는 문은 열린다", () => {
  withEnv(
    {
      NODE_ENV: "production",
      WORKOUT_AUTH_USER_ID: "00000000-0000-4000-8000-000000c1c1c1",
      WORKOUT_WEB_ALLOW_ENV_AUTH: "1",
    },
    () => {
      assert.equal(devFallbackUserId(), "00000000-0000-4000-8000-000000c1c1c1");
    },
  );
});

test("값이 없거나 공백뿐이면 폴백은 없다", () => {
  for (const raw of [undefined, "", "   "]) {
    withEnv({ NODE_ENV: "development", WORKOUT_AUTH_USER_ID: raw }, () => {
      assert.equal(devFallbackUserId(), "", `raw=${JSON.stringify(raw)}`);
    });
  }
});
