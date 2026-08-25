import { apiRequest, type WorkoutApiConfig } from "./client";

/**
 * MCP 도구 정의.
 *
 * **얇은 래퍼다.** 도메인 로직이 없고, 각 도구는 공개 API 한 경로를 부른다
 * (계획서 §3.3). 판정·계산은 전부 서버의 결정론 엔진이 한다 — MCP는 읽고 쓰는
 * 클라이언트일 뿐 판정에 관여하지 않는다(로드맵 §1: 엔진에 LLM을 넣지 않는다).
 *
 * 도구를 고른 기준은 "LLM이 물어볼 만한 것"이다. 공개 표면 22개를 전부 도구로
 * 만들지 않는다 — 도구가 많으면 LLM이 고르기 어려워지고, 대부분은 앱 화면용
 * 부트스트랩이라 대화에 쓸모가 없다.
 */

export type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** 쓰기 도구는 read 토큰에서 403이 난다 — 목록에서 미리 알려 준다. */
  requiresWrite?: boolean;
  run: (config: WorkoutApiConfig, args: Record<string, unknown>) => Promise<unknown>;
};

const str = (value: unknown): string | undefined => {
  const s = typeof value === "string" ? value.trim() : "";
  return s === "" ? undefined : s;
};
const num = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

export const TOOLS: ToolDefinition[] = [
  {
    name: "list_sessions",
    title: "세션 목록",
    description:
      "기록한 워크아웃 세션을 최신순으로 가져온다. '지난주에 뭐 했지' 같은 질문의 출발점.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "가져올 개수(기본 20)" },
      },
    },
    run: (config, args) =>
      apiRequest(config, "GET", "/api/logs", { query: { limit: num(args.limit) ?? 20 } }),
  },
  {
    name: "get_session",
    title: "세션 상세",
    description:
      "세션 하나의 세트·메모·자동 진행 판정을 가져온다. list_sessions로 얻은 id를 넣는다.",
    inputSchema: {
      type: "object",
      properties: { logId: { type: "string", description: "세션 id" } },
      required: ["logId"],
    },
    run: (config, args) => {
      const logId = str(args.logId);
      if (!logId) throw new Error("logId가 필요합니다.");
      return apiRequest(config, "GET", `/api/logs/${encodeURIComponent(logId)}`);
    },
  },
  {
    name: "get_volume",
    title: "볼륨 추이",
    description:
      "주 단위 볼륨 시계열. '지난주 스쿼트 볼륨' 같은 질문에 쓴다. 웜업 세트는 제외돼 있다.",
    inputSchema: { type: "object", properties: {} },
    run: (config) => apiRequest(config, "GET", "/api/stats/volume-series"),
  },
  {
    name: "get_strength_summary",
    title: "근력 요약",
    description:
      "3대 토탈과 체중 대비 배율. 배율은 **그 시점 체중** 기준이라 과거 값도 정확하다.",
    inputSchema: { type: "object", properties: {} },
    run: (config) => apiRequest(config, "GET", "/api/stats/strength-summary"),
  },
  {
    name: "get_personal_records",
    title: "개인 최고 기록",
    description: "종목별 PR과 향상도.",
    inputSchema: { type: "object", properties: {} },
    run: (config) => apiRequest(config, "GET", "/api/stats/prs"),
  },
  {
    name: "list_plans",
    title: "플랜 목록",
    description: "보유한 프로그램과 진행 상태. plan id는 다른 도구의 입력이 된다.",
    inputSchema: { type: "object", properties: {} },
    run: (config) => apiRequest(config, "GET", "/api/plans"),
  },
  {
    name: "get_progression_state",
    title: "자동 진행 상태",
    description:
      "다음 세션의 처방과 **그 근거**(무게를 왜 올렸는지·내렸는지). 이 앱의 진행 엔진은 결정론이라 근거가 항상 남는다.",
    inputSchema: {
      type: "object",
      properties: { planId: { type: "string" } },
      required: ["planId"],
    },
    run: (config, args) => {
      const planId = str(args.planId);
      if (!planId) throw new Error("planId가 필요합니다.");
      return apiRequest(
        config,
        "GET",
        `/api/plans/${encodeURIComponent(planId)}/progression-state`,
      );
    },
  },
  {
    name: "preview_cycle",
    title: "사이클 미리보기",
    description:
      "주차×세션 격자를 현 상태 기준으로 전개한다. **확정 스케줄이 아니다** — AMRAP·판정 결과에 따라 이후 주차는 갱신된다.",
    inputSchema: {
      type: "object",
      properties: { planId: { type: "string" } },
      required: ["planId"],
    },
    run: (config, args) => {
      const planId = str(args.planId);
      if (!planId) throw new Error("planId가 필요합니다.");
      return apiRequest(
        config,
        "GET",
        `/api/plans/${encodeURIComponent(planId)}/cycle-overview`,
      );
    },
  },
  {
    name: "search_exercises",
    title: "운동 검색",
    description:
      "카탈로그 755종에서 찾는다. 내가 기록한 적 있는 종목이 상단에 온다. category(Legs/Back/…)·equipment(barbell/dumbbell/…)로 좁힐 수 있다.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        category: { type: "string" },
        equipment: { type: "string" },
        limit: { type: "number" },
      },
    },
    run: (config, args) =>
      apiRequest(config, "GET", "/api/exercises", {
        query: {
          query: str(args.query),
          category: str(args.category),
          equipment: str(args.equipment),
          limit: num(args.limit) ?? 20,
        },
      }),
  },
  {
    name: "log_session",
    title: "세션 기록",
    description: [
      "워크아웃 세션을 저장한다. **read_write 스코프 토큰이 필요하다.**",
      "",
      "`clientMutationId`를 함께 보내면 같은 요청을 다시 보내도 세션이 하나만 만들어진다",
      "(exactly-once). 재시도할 때는 **같은 id와 같은 본문**을 써야 한다 — 본문이 달라지면",
      "새 요청으로 취급된다.",
    ].join("\n"),
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        performedAt: { type: "string", description: "ISO 8601 시각" },
        sets: {
          type: "array",
          description: "{ exerciseName, weightKg, reps, setNumber }",
          items: { type: "object" },
        },
        notes: { type: "string" },
        clientMutationId: {
          type: "string",
          description: "재시도 안전용 고유 id(선택). 쓰면 performedAt이 필수다.",
        },
      },
      required: ["performedAt", "sets"],
    },
    run: (config, args) => {
      const performedAt = str(args.performedAt);
      if (!performedAt) throw new Error("performedAt이 필요합니다.");
      if (!Array.isArray(args.sets) || args.sets.length === 0) {
        throw new Error("sets가 비어 있습니다.");
      }
      return apiRequest(config, "POST", "/api/logs", {
        body: {
          performedAt,
          sets: args.sets,
          notes: str(args.notes),
          clientMutationId: str(args.clientMutationId),
        },
      });
    },
  },
  {
    name: "log_bodyweight",
    title: "체중 기록",
    description:
      "체중을 기록한다. **read_write 스코프가 필요하다.** 같은 시각이면 덮어쓴다.",
    requiresWrite: true,
    inputSchema: {
      type: "object",
      properties: {
        valueKg: { type: "number" },
        measuredAt: { type: "string", description: "ISO 8601 시각(생략 시 지금)" },
      },
      required: ["valueKg"],
    },
    run: (config, args) => {
      const valueKg = num(args.valueKg);
      if (valueKg === undefined) throw new Error("valueKg가 필요합니다.");
      return apiRequest(config, "POST", "/api/bodyweight", {
        body: { valueKg, measuredAt: str(args.measuredAt) ?? new Date().toISOString() },
      });
    },
  },
];

export function findTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.name === name);
}
