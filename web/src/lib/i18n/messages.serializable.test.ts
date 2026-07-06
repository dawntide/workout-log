// AppCopy 직렬화 가드 — 카탈로그에 함수(또는 비직렬화 값)가 하나라도 들어가면
// RSC 서버→클라 prop 전달(홈 SSR)이 크래시한다(2026-07-03 #491/#493 인시던트:
// "Functions cannot be passed directly to Client Components"). 이 테스트가
// 함수형 카피의 재유입을 머지 전에 막는다. 파라미터화 카피는 템플릿 문자열
// + formatCopy()로만 표현한다.
import test from "node:test";
import assert from "node:assert/strict";

import { appCopyByLocale, formatCopy, getAppCopy } from "./messages";

function findNonSerializable(value: unknown, path: string): string[] {
  if (value === null) return [];
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return [];
  if (t === "function" || t === "symbol" || t === "bigint" || t === "undefined") {
    return [`${path} (${t})`];
  }
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findNonSerializable(v, `${path}[${i}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    findNonSerializable(v, `${path}.${k}`),
  );
}

test("AppCopy는 전 로케일에서 JSON-직렬화 가능하다 (함수형 카피 금지)", () => {
  for (const locale of Object.keys(appCopyByLocale) as Array<keyof typeof appCopyByLocale>) {
    const copy = getAppCopy(locale);
    const offenders = findNonSerializable(copy, `copy[${locale}]`);
    assert.deepEqual(
      offenders,
      [],
      `직렬화 불가 카피 발견 — 템플릿 문자열 + formatCopy로 바꿀 것:\n${offenders.join("\n")}`,
    );
    // JSON 왕복 동치 = RSC 직렬화 층이 보는 것과 같은 판정.
    assert.deepEqual(JSON.parse(JSON.stringify(copy)), copy, `copy[${locale}] JSON 왕복 불일치`);
  }
});

test("formatCopy는 {key} 플레이스홀더를 치환하고 미지정 키는 보존한다", () => {
  assert.equal(formatCopy("{days}일 연속 진행 중.", { days: 7 }), "7일 연속 진행 중.");
  assert.equal(
    formatCopy("현재 {logs}개 로그 / {sets}세트를 표시합니다.", { logs: 3, sets: 12 }),
    "현재 3개 로그 / 12세트를 표시합니다.",
  );
  assert.equal(formatCopy("Export failed ({status})", { status: 503 }), "Export failed (503)");
  assert.equal(formatCopy("{missing} 유지", {}), "{missing} 유지");
});
