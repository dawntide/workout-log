import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SESSION_IDLE_TTL_MS,
  SESSION_ABSOLUTE_MAX_MS,
  SESSION_REFRESH_INTERVAL_MS,
  computeSlideTarget,
} from "./session-policy";

const DAY = 1000 * 60 * 60 * 24;
const NOW = 1_700_000_000_000; // 고정 기준시각(테스트 결정성)

test("갓 만든 세션(expiresAt=now+IDLE_TTL)은 갱신 불필요 → null", () => {
  const createdAt = NOW;
  const expiresAt = NOW + SESSION_IDLE_TTL_MS;
  assert.equal(computeSlideTarget(NOW, expiresAt, createdAt), null);
});

test("REFRESH_INTERVAL 미만으로 낡음 → 갱신 생략(null): 매 요청 write 방지", () => {
  // expiresAt가 이상적(now+IDLE_TTL)보다 12시간(<1일) 낡음
  const createdAt = NOW - DAY / 2;
  const expiresAt = createdAt + SESSION_IDLE_TTL_MS; // = now+IDLE_TTL - 12h
  assert.equal(computeSlideTarget(NOW, expiresAt, createdAt), null);
});

test("REFRESH_INTERVAL 이상 낡음 → now+IDLE_TTL로 슬라이딩", () => {
  // 2일 전 마지막 갱신 → expiresAt = now+IDLE_TTL - 2d, diff 2d ≥ 1d → 갱신
  const createdAt = NOW - 2 * DAY;
  const expiresAt = createdAt + SESSION_IDLE_TTL_MS;
  const target = computeSlideTarget(NOW, expiresAt, createdAt);
  assert.ok(target instanceof Date);
  assert.equal(target!.getTime(), NOW + SESSION_IDLE_TTL_MS);
});

test("절대 상한 근처: desired가 createdAt+ABSOLUTE_MAX로 clamp", () => {
  // 세션이 170일 됐고 아직 활동 중. now+IDLE_TTL(=+30d)는 상한(createdAt+180d=+10d) 초과
  // → desired = createdAt+180d = now+10d. 현재 expiresAt=now(곧 만료)보다 10d 크므로 갱신.
  const createdAt = NOW - 170 * DAY;
  const expiresAt = NOW; // 곧 만료
  const target = computeSlideTarget(NOW, expiresAt, createdAt);
  assert.ok(target instanceof Date);
  assert.equal(target!.getTime(), createdAt + SESSION_ABSOLUTE_MAX_MS);
  // 상한을 넘지 않는다
  assert.ok(target!.getTime() < NOW + SESSION_IDLE_TTL_MS);
});

test("절대 상한 도달: 더 못 늘림 → null(무한 세션 방지)", () => {
  // createdAt+ABSOLUTE_MAX == 현재 expiresAt → desired-expiresAt=0 < REFRESH_INTERVAL → null
  const createdAt = NOW - SESSION_ABSOLUTE_MAX_MS;
  const expiresAt = createdAt + SESSION_ABSOLUTE_MAX_MS; // = NOW
  assert.equal(computeSlideTarget(NOW, expiresAt, createdAt), null);
});

test("정책 상수 관계 불변식: IDLE < ABSOLUTE, REFRESH < IDLE", () => {
  assert.ok(SESSION_IDLE_TTL_MS < SESSION_ABSOLUTE_MAX_MS);
  assert.ok(SESSION_REFRESH_INTERVAL_MS < SESSION_IDLE_TTL_MS);
});
