import test from "node:test";
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { readConfigFromEnv } from "./client";
import { createServer } from "./index";
import { TOOLS } from "./tools";

/**
 * G6 — MCP 스모크.
 *
 * **실제 프로토콜을 태운다.** 도구 배열을 직접 단언하면 "SDK에 제대로 등록됐는가"를
 * 확인하지 못한다 — 핸들러를 안 걸어도 통과한다. 인메모리 전송으로 진짜
 * initialize → tools/list → tools/call을 거친다.
 *
 * 네트워크는 타지 않는다. 도구 호출은 토큰이 없어 실패하는데, **그 실패가
 * 사람이 고칠 수 있는 문장으로 오는지**가 이 테스트의 관심사다.
 */

async function connectedClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, close: () => Promise.all([client.close(), server.close()]) };
}

test("initialize → tools/list가 도구를 전부 노출한다", async () => {
  const { client, close } = await connectedClient();
  try {
    const { tools } = await client.listTools();
    assert.equal(
      tools.length,
      TOOLS.length,
      `등록 도구 ${tools.length}개 ≠ 정의 ${TOOLS.length}개`,
    );
    const names = new Set(tools.map((tool) => tool.name));
    for (const defined of TOOLS) {
      assert.ok(names.has(defined.name), `${defined.name}이 노출되지 않았다`);
    }
    // 스키마가 비어 있으면 LLM이 인자를 못 만든다.
    for (const tool of tools) {
      assert.equal(tool.inputSchema.type, "object", `${tool.name}의 스키마가 object가 아니다`);
    }
  } finally {
    await close();
  }
});

test("쓰기 도구는 설명에 스코프 요구를 밝힌다", async () => {
  // read 토큰으로 부르면 403이 난다. 도구 목록에서 미리 알려 주지 않으면 LLM이
  // 이유를 모른 채 재시도한다.
  const { client, close } = await connectedClient();
  try {
    const { tools } = await client.listTools();
    for (const defined of TOOLS.filter((tool) => tool.requiresWrite)) {
      const exposed = tools.find((tool) => tool.name === defined.name);
      assert.ok(
        exposed?.description?.includes("read 토큰"),
        `${defined.name}이 쓰기 요구를 안 밝힌다`,
      );
    }
  } finally {
    await close();
  }
});

test("토큰이 없으면 예외가 아니라 고칠 수 있는 오류를 돌려준다", async () => {
  // 서버 기동 시 토큰을 읽으면 프로세스가 죽어 클라이언트는 "서버가 안 뜬다"만 본다.
  // 호출 결과로 와야 사람이 무엇을 고칠지 안다.
  const previous = process.env.WORKOUT_LOG_TOKEN;
  delete process.env.WORKOUT_LOG_TOKEN;
  const { client, close } = await connectedClient();
  try {
    const result = await client.callTool({ name: "list_sessions", arguments: {} });
    assert.equal(result.isError, true);
    const text = (result.content as Array<{ text?: string }>)[0]?.text ?? "";
    assert.match(text, /WORKOUT_LOG_TOKEN/, `오류가 원인을 안 밝힌다: ${text}`);
    assert.match(text, /설정 > 계정/, "어디서 발급하는지 안 알려 준다");
  } finally {
    await close();
    if (previous !== undefined) process.env.WORKOUT_LOG_TOKEN = previous;
  }
});

test("세션 토큰을 넣으면 거부한다 — PAT가 아니면 전 경로가 열린다", () => {
  // 세션 토큰은 공개 표면 제한을 받지 않는다. MCP에 그걸 넣으면 LLM이 계정 삭제까지
  // 부를 수 있다. 접두사로 걸러 낸다.
  assert.throws(
    () => readConfigFromEnv({ WORKOUT_LOG_TOKEN: "2f6a9c1b4e8d" } as NodeJS.ProcessEnv),
    /개인 액세스 토큰이 아닙니다/,
  );
  const config = readConfigFromEnv({ WORKOUT_LOG_TOKEN: "wlpat_abc" } as NodeJS.ProcessEnv);
  assert.equal(config.token, "wlpat_abc");
  // 기본 서버는 프로덕션이다 — 설정 없이도 동작해야 한다.
  assert.match(config.baseUrl, /^https:\/\//);
});

test("prescribe_session은 처방을 고치지 않고 코치 경로로 PUT 한다", async () => {
  // MCP가 값을 다듬으면 코치가 보낸 것과 서버가 검증한 것이 달라진다.
  const calls: Array<{ url: string; method: string; body: unknown; auth: string }> = [];
  const originalFetch = globalThis.fetch;
  const previousToken = process.env.WORKOUT_LOG_TOKEN;
  const previousBase = process.env.WORKOUT_LOG_BASE_URL;
  process.env.WORKOUT_LOG_TOKEN = "wlpat_test";
  process.env.WORKOUT_LOG_BASE_URL = "https://example.invalid";
  globalThis.fetch = (async (url: URL | string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: String(init?.method),
      body: init?.body ? JSON.parse(String(init.body)) : null,
      auth: String((init?.headers as Record<string, string>)?.Authorization ?? ""),
    });
    return new Response(JSON.stringify({ created: true }), { status: 201 });
  }) as typeof fetch;
  const { client, close } = await connectedClient();
  try {
    const exercises = [
      { exerciseName: "Back Squat", sets: [{ reps: 3, targetWeightKg: 90, rpe: 8 }] },
    ];
    const result = await client.callTool({
      name: "prescribe_session",
      arguments: { planId: "plan 1", date: "2026-11-20", rationale: "근거", exercises },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.method, "PUT");
    assert.equal(
      calls[0]!.url,
      "https://example.invalid/api/plans/plan%201/coach-sessions/2026-11-20",
    );
    assert.deepEqual(calls[0]!.body, { exercises, rationale: "근거" });
    assert.equal(calls[0]!.auth, "Bearer wlpat_test");

    const read = await client.callTool({
      name: "get_prescribed_session",
      arguments: { planId: "plan 1", date: "2026-11-20" },
    });
    assert.notEqual(read.isError, true);
    assert.equal(calls[1]!.method, "GET");
  } finally {
    await close();
    globalThis.fetch = originalFetch;
    if (previousToken === undefined) delete process.env.WORKOUT_LOG_TOKEN;
    else process.env.WORKOUT_LOG_TOKEN = previousToken;
    if (previousBase === undefined) delete process.env.WORKOUT_LOG_BASE_URL;
    else process.env.WORKOUT_LOG_BASE_URL = previousBase;
  }
});

test("서버의 검증 오류 details가 잘리지 않고 전달된다", async () => {
  const originalFetch = globalThis.fetch;
  const previousToken = process.env.WORKOUT_LOG_TOKEN;
  process.env.WORKOUT_LOG_TOKEN = "wlpat_test";
  const details = Array.from({ length: 12 }, (_, i) => `exercises[${i}].sets[0].reps는 1~50의 정수여야 합니다.`);
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ code: "COACH_PRESCRIPTION_INVALID", details }), {
      status: 400,
    })) as typeof fetch;
  const { client, close } = await connectedClient();
  try {
    const result = await client.callTool({
      name: "prescribe_session",
      arguments: {
        planId: "p",
        date: "2026-11-20",
        rationale: "r",
        exercises: [{ exerciseName: "x", sets: [] }],
      },
    });
    assert.equal(result.isError, true);
    const text = (result.content as Array<{ text?: string }>)[0]?.text ?? "";
    assert.match(text, /exercises\[11\]/, "마지막 오류 항목이 잘렸다");
  } finally {
    await close();
    globalThis.fetch = originalFetch;
    if (previousToken === undefined) delete process.env.WORKOUT_LOG_TOKEN;
    else process.env.WORKOUT_LOG_TOKEN = previousToken;
  }
});

test("알 수 없는 도구는 오류로 답한다", async () => {
  const { client, close } = await connectedClient();
  try {
    const result = await client.callTool({ name: "nope", arguments: {} });
    assert.equal(result.isError, true);
  } finally {
    await close();
  }
});

test("도구 이름이 중복되지 않는다", () => {
  const names = TOOLS.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length, `중복된 도구 이름: ${names.join(", ")}`);
});
