import { Hono } from "hono";

import { requireAuth, type AppEnv } from "../auth";
import { registerPlanCrudRoutes } from "./plans/crud";
import { registerGeneratedSessionRoutes } from "./plans/generated-sessions";
import { registerGenerateRoute } from "./plans/generate";
import { registerOverrideRoutes } from "./plans/overrides";
import { registerProgressionRoutes } from "./plans/progression";
import { registerCycleOverviewRoute } from "./plans/cycle-overview";

// ─────────────────────────────────────────────────────────────────────────────
// Plans — the TUI-critical plan workflow (list/create/rename/delete/generate/
// overrides), ported verbatim from web/src/app/api/plans/**. Logic stays inline
// (or calls the Next-free program-engine for generate). requireAuth supplies the
// user id. Plan extras (TUI-unused): progression-state, runtime-targets,
// cycle-overview.
//
// 이 파일은 **조립기**다. 핸들러는 ./plans/*에 그룹별로 있고, 여기서는 무엇을 어떤
// 순서로 등록할지만 정한다. 2026-08 감사 §3.3(C1)에서 이 파일이 1,706줄 —
// apps/api 전체의 30% — 이던 것을 쪼갠 결과이며, 핸들러 로직은 옮기기만 했다.
// ─────────────────────────────────────────────────────────────────────────────

export const plansRoutes = new Hono<AppEnv>();

plansRoutes.use("*", requireAuth);

// ⚠️ **아래 호출 순서는 동작이다.** Hono는 등록 순서로 매칭하므로 구체적인 경로가
// 파라미터 경로보다 먼저 등록돼야 한다 — 특히 `/:planId/generated-sessions/active`가
// `/:planId/generated-sessions/:sessionId`보다 앞이어야 하고, 그 둘은 같은 모듈 안에
// 그 순서로 들어 있다. 순서를 바꾸면 라우팅이 조용히 달라지므로 그룹을 재배치하지 말 것.
// `plans/route-order.test.ts`가 등록 테이블을 통째로 고정한다.
registerPlanCrudRoutes(plansRoutes);
registerGeneratedSessionRoutes(plansRoutes);
registerGenerateRoute(plansRoutes);
registerOverrideRoutes(plansRoutes);
registerProgressionRoutes(plansRoutes);
registerCycleOverviewRoute(plansRoutes);
