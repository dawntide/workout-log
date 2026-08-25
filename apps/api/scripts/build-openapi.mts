#!/usr/bin/env node
// 공개 API의 OpenAPI 스펙을 **생성**한다. 산출물은 `docs/api/openapi.json`.
//
// 수기로 쓰지 않는 이유: 손으로 쓴 스펙은 반드시 드리프트한다. 경로 목록은
// `api-token-surface.ts`의 허용목록을 **그대로 import**하고, 사람이 쓰는 것은 설명뿐이다.
// 설명이 빠진 경로가 있으면 이 스크립트가 실패한다 — 새 경로를 열면 문서를 쓰게 된다.
//
// `.mts`인 이유: TS 모듈을 직접 import하려면 tsx로 돌아야 한다. 자식 프로세스로
// 뽑아 오던 초안은 Windows의 `.bin` shim과 tsx의 exports 맵에 두 번 걸렸다.
//
// ⚠️ **응답 스키마는 담지 않는다.** 22개 엔드포인트의 응답 형태를 손으로 유지하면
// 곧 거짓말이 된다. 이 스펙이 답하는 것은 "무엇을 어떤 권한으로 부를 수 있고,
// 어떤 한도와 계약이 걸리는가"다. 응답 형태는 실제 호출로 확인하는 편이 정확하다.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { apiTokenRateLimits, apiTokenSurfaceSnapshot } from "../src/api-token-surface";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");

/** 경로별 사람이 쓴 설명. 여기 없는 공개 경로가 있으면 실패한다. */
const DESCRIPTIONS = {
  "GET /api/logs": {
    summary: "세션 목록",
    description: "기록한 워크아웃 세션을 최신순으로 반환한다.",
  },
  "GET /api/logs/calendar": {
    summary: "캘린더용 세션 요약",
    description: "달력 표시에 필요한 날짜별 요약. 세트 상세는 담기지 않는다.",
  },
  "GET /api/logs/:logId": {
    summary: "세션 상세",
    description: "세트·메모·자동 진행 판정을 포함한 단일 세션.",
  },
  "GET /api/stats/bundle": {
    summary: "통계 묶음",
    description: "홈·통계 화면이 한 번에 쓰는 집계 묶음.",
  },
  "GET /api/stats/e1rm": {
    summary: "e1RM 추이",
    description: "운동별 추정 1RM 시계열. 웜업 세트는 제외된다.",
  },
  "GET /api/stats/prs": { summary: "개인 최고 기록", description: "종목별 PR과 향상도." },
  "GET /api/stats/strength-summary": {
    summary: "근력 요약",
    description: "3대 토탈과 체중 대비 배율. 배율은 **그 시점 체중** 기준이다.",
  },
  "GET /api/stats/volume": { summary: "볼륨 집계", description: "기간 볼륨 총계." },
  "GET /api/stats/volume-series": {
    summary: "볼륨 시계열",
    description: "주 단위 볼륨 추이.",
  },
  "GET /api/plans": { summary: "플랜 목록", description: "보유한 플랜과 진행 상태." },
  "GET /api/plans/:planId/cycle-overview": {
    summary: "사이클 개요",
    description:
      "주차×세션 격자를 **현 상태 기준**으로 전개한다. AMRAP·판정 결과에 따라 이후 주차는 갱신되므로 확정 스케줄이 아니다.",
  },
  "GET /api/plans/:planId/progression-state": {
    summary: "자동 진행 상태",
    description: "다음 세션의 처방과 그 근거(판정 이력).",
  },
  "GET /api/plans/:planId/generated-sessions/active": {
    summary: "진행 중 세션",
    description: "아직 저장하지 않은 생성 세션.",
  },
  "GET /api/plans/:planId/generated-sessions/:sessionId": {
    summary: "생성 세션 상세",
    description: "특정 생성 세션의 처방.",
  },
  "GET /api/exercises": {
    summary: "운동 검색",
    description:
      "카탈로그 755종 검색. `query`·`category`·`equipment`·`limit`을 받고, **내가 기록한 적 있는 종목이 상단**에 온다.",
  },
  "GET /api/exercises/categories": {
    summary: "부위 목록",
    description: "카탈로그에 존재하는 부위 값.",
  },
  "GET /api/bodyweight": { summary: "체중 기록", description: "체중 시계열." },
  "GET /api/home": { summary: "홈 부트스트랩", description: "오늘 화면이 쓰는 묶음." },
  "GET /api/export": {
    summary: "전체 내보내기",
    description:
      "도메인 데이터 전량(JSON/CSV). 설정·인증·텔레메트리는 담기지 않는다 — 그래서 read 스코프로 연다.",
  },
  "POST /api/logs": {
    summary: "세션 기록",
    description:
      "세션을 새로 저장한다. `clientMutationId`를 함께 보내면 **exactly-once**가 보장된다(아래 멱등성 참조).",
  },
  "PATCH /api/logs/:logId": {
    summary: "세션 수정",
    description: "저장된 세션의 세트·메모를 고친다.",
  },
  "POST /api/bodyweight": { summary: "체중 기록", description: "같은 시각이면 덮어쓴다." },
};


function toOpenApiPath(honoPath) {
  return honoPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function parametersFor(honoPath) {
  return [...honoPath.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

const surface = apiTokenSurfaceSnapshot();
const limits = apiTokenRateLimits();
const entries = [
  ...surface.read.map((entry) => ({ entry, scopes: ["read", "read_write"] })),
  ...surface.write.map((entry) => ({ entry, scopes: ["read_write"] })),
];

const missing = entries.filter(({ entry }) => !DESCRIPTIONS[entry]).map((e) => e.entry);
if (missing.length > 0) {
  console.error(`설명이 없는 공개 경로:\n${missing.map((m) => `  ${m}`).join("\n")}`);
  console.error("\n공개 표면을 넓혔으면 이 스크립트의 DESCRIPTIONS에 설명을 쓸 것.");
  process.exit(1);
}

const paths = {};
for (const { entry, scopes } of entries) {
  const [method, honoPath] = entry.split(" ");
  const openApiPath = toOpenApiPath(honoPath);
  const meta = DESCRIPTIONS[entry];
  paths[openApiPath] ??= {};
  paths[openApiPath][method.toLowerCase()] = {
    summary: meta.summary,
    description: meta.description,
    security: [{ personalAccessToken: [] }],
    "x-required-scopes": scopes,
    ...(parametersFor(honoPath).length > 0
      ? { parameters: parametersFor(honoPath) }
      : {}),
    responses: {
      200: { description: "성공" },
      401: {
        description:
          "토큰이 없거나, 폐기됐거나, 이 경로가 공개 표면 밖이다(기본은 거부).",
      },
      403: { description: "토큰 스코프가 이 작업을 허용하지 않는다(read 토큰의 쓰기)." },
      429: {
        description: `요청 한도 초과. 읽기 ${limits.read.max}/분, 쓰기 ${limits.write.max}/분. \`Retry-After\` 헤더를 볼 것.`,
      },
    },
  };
}

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Workout Log 공개 API",
    version: "1.0.0",
    description: [
      "본인이 발급한 개인 액세스 토큰(PAT)으로 자기 데이터에 접근하는 API다.",
      "",
      "**기본은 거부다.** 여기 적힌 경로만 PAT로 닿을 수 있고, 그 밖의 모든 경로는",
      "401을 준다. 설정 변경·계정 관리·데이터 삭제·가져오기는 어느 스코프로도 열리지",
      "않는다.",
      "",
      "**응답 스키마는 담지 않는다.** 22개 엔드포인트의 응답 형태를 손으로 유지하면",
      "곧 거짓말이 된다. 이 문서가 답하는 것은 무엇을 어떤 권한으로 부를 수 있고,",
      "어떤 한도와 계약이 걸리는가다.",
    ].join("\n"),
  },
  servers: [{ url: "https://workout-log-eight.vercel.app", description: "프로덕션" }],
  components: {
    securitySchemes: {
      personalAccessToken: {
        type: "http",
        scheme: "bearer",
        description: [
          "`Authorization: Bearer wlpat_…` 형식. 설정 > 계정에서 발급한다.",
          "",
          "평문은 발급 화면에서 **한 번만** 보인다 — 서버는 SHA-256 해시만 저장하므로",
          "잃어버리면 폐기하고 재발급해야 한다. 폐기는 즉시 적용된다(캐시 없음).",
          "",
          "스코프는 `read`(기본)와 `read_write` 둘이다.",
          "",
          "⚠️ 브라우저에서 세션 쿠키와 함께 보내면 **쿠키가 이긴다**. PAT 클라이언트는",
          "쿠키를 보내지 않으므로 문제되지 않는다.",
        ].join("\n"),
      },
    },
  },
  security: [{ personalAccessToken: [] }],
  "x-rate-limits": {
    read: { max: limits.read.max, windowSeconds: limits.read.windowMs / 1000 },
    write: { max: limits.write.max, windowSeconds: limits.write.windowMs / 1000 },
    key: "토큰 해시. IP가 아니라 토큰별이라 같은 네트워크의 다른 클라이언트가 서로를 굶기지 않는다.",
  },
  "x-idempotency": {
    endpoint: "POST /api/logs",
    field: "clientMutationId",
    description: [
      "`clientMutationId`를 함께 보내면 같은 요청을 다시 보내도 세션이 하나만 만들어진다.",
      "서버가 요청 본문의 정규 해시를 저장해 두고 같은 (id, 해시) 조합이면 이전 결과를",
      "그대로 돌려준다.",
      "",
      "`clientMutationId`를 쓸 때는 `performedAt`이 필수다 — 없으면 400이다.",
      "본문이 달라진 채 같은 id로 보내면 새 요청으로 취급된다.",
    ].join("\n"),
  },
  paths,
};

const outDir = path.join(repoRoot, "docs/api");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "openapi.json"), `${JSON.stringify(spec, null, 2)}\n`, "utf8");
console.log(`docs/api/openapi.json — 경로 ${Object.keys(paths).length}개, 작업 ${entries.length}개`);
