import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { claimableFallbackUserId, claimEnvFallbackData } from "./claim-fallback";

const KEYS = ["NODE_ENV", "WORKOUT_AUTH_USER_ID", "WORKOUT_WEB_ALLOW_ENV_AUTH"] as const;
const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  const env = process.env as Record<string, string | undefined>;
  for (const key of KEYS) {
    if (values[key] === undefined) delete env[key];
    else env[key] = values[key];
  }
}

afterEach(() => {
  setEnv(original as Partial<Record<(typeof KEYS)[number], string>>);
});

const FALLBACK_ID = "00000000-0000-4000-8000-000000c1c1c1";

test("claim fallback id is readable outside production", () => {
  setEnv({ NODE_ENV: "development", WORKOUT_AUTH_USER_ID: ` ${FALLBACK_ID} ` });
  assert.equal(claimableFallbackUserId(), FALLBACK_ID);
});

test("claim fallback id is closed in production without the explicit opt-in", () => {
  setEnv({ NODE_ENV: "production", WORKOUT_AUTH_USER_ID: FALLBACK_ID });
  assert.equal(claimableFallbackUserId(), "");
});

test("claim fallback id follows the web opt-in flag in production", () => {
  setEnv({
    NODE_ENV: "production",
    WORKOUT_AUTH_USER_ID: FALLBACK_ID,
    WORKOUT_WEB_ALLOW_ENV_AUTH: "1",
  });
  assert.equal(claimableFallbackUserId(), FALLBACK_ID);
});

test("claimEnvFallbackData is a noop in production before touching the database", async () => {
  setEnv({ NODE_ENV: "production", WORKOUT_AUTH_USER_ID: FALLBACK_ID });
  const result = await claimEnvFallbackData({ toUserId: "11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(result, { claimed: false, fromUserId: null, movedRowCounts: null });
});
