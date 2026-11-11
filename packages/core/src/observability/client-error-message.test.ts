import assert from "node:assert/strict";
import test from "node:test";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { clientErrorMessage, isInternalError } from "./client-error-message";

const FALLBACK = "알 수 없는 오류가 발생했습니다.";

test("service errors keep their localized message", () => {
  assert.equal(
    clientErrorMessage(new Error("플랜을 찾을 수 없습니다."), FALLBACK),
    "플랜을 찾을 수 없습니다.",
  );
});

test("non-Error values fall back", () => {
  assert.equal(clientErrorMessage("boom", FALLBACK), FALLBACK);
  assert.equal(clientErrorMessage(null, FALLBACK), FALLBACK);
});

test("a drizzle query error never reaches the client with its SQL and params", () => {
  const error = new DrizzleQueryError(
    "select id from app_user where email = $1",
    ["someone@example.com"],
    new Error("connection terminated"),
  );
  assert.match(error.message, /Failed query/);
  assert.equal(isInternalError(error), true);
  assert.equal(clientErrorMessage(error, FALLBACK), FALLBACK);
});

test("a wrapped database error is detected through the cause chain", () => {
  const pgError = Object.assign(new Error("relation public.nope does not exist"), {
    code: "42P01",
    severity: "ERROR",
  });
  const wrapped = new Error("저장에 실패했습니다.", { cause: pgError });
  assert.equal(clientErrorMessage(pgError, FALLBACK), FALLBACK);
  assert.equal(clientErrorMessage(wrapped, FALLBACK), FALLBACK);
});

test("network failures are internal", () => {
  const error = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:6543"), {
    code: "ECONNREFUSED",
  });
  assert.equal(clientErrorMessage(error, FALLBACK), FALLBACK);
});

test("an application error code alone is not treated as a database error", () => {
  const stale = Object.assign(new Error("이미 저장된 세션입니다."), { code: "REF5_STALE_VERSION" });
  assert.equal(clientErrorMessage(stale, FALLBACK), "이미 저장된 세션입니다.");
  const fiveChars = Object.assign(new Error("잘못된 입력입니다."), { code: "INPUT" });
  assert.equal(clientErrorMessage(fiveChars, FALLBACK), "잘못된 입력입니다.");
});
