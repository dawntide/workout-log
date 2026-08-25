#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { readConfigFromEnv, WorkoutApiError } from "./client";
import { findTool, TOOLS } from "./tools";

/**
 * Workout Log MCP 서버 — stdio 전송.
 *
 * LLM 활용을 **여기로 전부 외부화**하는 것이 목적이다. 진행 엔진은 결정론을 유지하고,
 * MCP는 읽고 쓰는 클라이언트일 뿐 판정에 관여하지 않는다(로드맵 §1).
 *
 * 설정 예(Claude Desktop):
 * ```json
 * {
 *   "mcpServers": {
 *     "workout-log": {
 *       "command": "npx",
 *       "args": ["tsx", "/path/to/apps/mcp/src/index.ts"],
 *       "env": { "WORKOUT_LOG_TOKEN": "wlpat_…" }
 *     }
 *   }
 * }
 * ```
 */

export function createServer() {
  const server = new Server(
    { name: "workout-log", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.requiresWrite
        ? `${tool.description}\n\n(쓰기 도구 — read 토큰이면 403이 난다.)`
        : tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = findTool(request.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `알 수 없는 도구: ${request.params.name}` }],
      };
    }

    try {
      // **설정을 호출 시점에 읽는다.** 서버 기동 시 읽으면 토큰이 없을 때 프로세스가
      // 죽어 버려 클라이언트가 "서버가 안 뜬다"만 보게 된다. 도구 호출 결과로
      // 돌려줘야 사람이 무엇을 고칠지 안다.
      const config = readConfigFromEnv();
      const result = await tool.run(config, (request.params.arguments ?? {}) as Record<string, unknown>);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      const message =
        error instanceof WorkoutApiError || error instanceof Error
          ? error.message
          : String(error);
      // 오류를 예외로 던지지 않고 `isError`로 돌려준다 — LLM이 읽고 스스로 고칠 수
      // 있어야 한다(스코프가 부족하다, 토큰이 폐기됐다 등).
      return { isError: true, content: [{ type: "text" as const, text: message }] };
    }
  });

  return server;
}

async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

// 테스트가 이 파일을 import할 수 있게 직접 실행일 때만 띄운다.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
