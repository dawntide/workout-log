# @workout/core

web(Next.js)과 apps/api(Hono)가 공유하는 **프레임워크-무지** 도메인/인프라 코드.
빌드 산출물 없이 TS 소스를 그대로 export하는 internal package다
(`exports: "./*" → "./src/*.ts"`). web은 `transpilePackages`로, apps/api는 tsx로 소비한다.

## 경계 규칙

- **요청 컨텍스트 무지**: `next/headers`·react·DOM·쿠키를 만지지 않는다.
  userId·locale 등 요청 파생 값은 호출자(web 또는 apps/api 어댑터)가 **명시 인자**로 주입한다.
- core는 `@/`(web/src) 및 앱 코드를 import하지 않는다. 의존 방향은 항상 `apps → core`.
- 외부 런타임 의존(drizzle-orm, pg 등)은 이 패키지의 `dependencies`에 선언하고
  web과 **버전을 동일하게 핀**한다(단일 인스턴스 dedupe — 이중 drizzle 인스턴스 방지).

추출 배경·마이그레이션 순서: [docs/codebase-audit-2026-07.md](../../docs/codebase-audit-2026-07.md) §4.5·§5.4.
