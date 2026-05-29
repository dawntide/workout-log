# 아키텍처 레이어 모델

이 문서는 `web/src` 코드의 **정식(canonical) 레이어 모델**을 명문화한다. 2026-05 코드베이스 감사([codebase-audit-2026-05.md](./codebase-audit-2026-05.md))에서 부분적 FSD + 전통 레이아웃이 혼재하지만 라이브 코드는 하나의 일관된 흐름을 따른다는 점이 확인되었고, 그 흐름을 기준으로 삼는다.

> ⚠️ 이 문서는 **방향성 가이드**다. 현재 ESLint로 레이어 경계를 `error`로 강제하지는 않는다(이유는 아래 "강제하지 않는 이유" 참고). 새 코드는 이 모델을 따르고, 기존 위반은 손대는 김에 점진적으로 정리한다.

## 레이어 흐름 (위 → 아래로만 의존)

```
app/                  Next.js 라우트, SSR 부트스트랩, 페이지 셸
  ↓
widgets/              화면 단위 조립 (workout-log-screen, stats-screen, calendar-screen 등)
  ↓
features/*/           기능 슬라이스 — model(상태/로직) + ui + store(jotai atoms)
  ↓
components/v2/primitives   공유 UI 커널 (V2Card, V2PrimaryBtn, V2NavRow 등)
  ↓
lib/                  순수 도메인/유틸 커널 (프레임워크·DB 비종속, 테스트로 고정)
  ↓
server/               DB(Drizzle) 접근 + 서버 도메인 엔진 (progression, program-engine)
```

**핵심 규칙**

1. **의존은 위에서 아래로만.** 아래 레이어가 위 레이어를 import하면 안 된다.
   - 특히 `server/`는 최하위 레이어다. `server/`가 `features/`·`widgets/`를 import하면 **역방향 위반**이다. (예: 과거 `server/services/workout-log/load-workout-log-context.ts`가 `features/workout-log/model/weight-rules`를 import했던 건 → 공유 커널이므로 `lib/workout-record/weight-rules.ts`로 이전해 해소함.)
2. **공유 코드의 집은 `lib/` 하나.** 둘 이상의 레이어/슬라이스가 쓰는 순수 로직은 `features/`가 아니라 `lib/`에 둔다. `lib/`는 React/Next/Drizzle에 의존하지 않는 순수 함수가 원칙이다.
3. **UI 재구현 금지(Primitive-First).** 카드/버튼/네비행은 `components/v2/primitives` 조합으로만. 자세한 규칙은 [`components/v2/primitives/README.md`](../src/components/v2/primitives/README.md) 및 [design-guide.md](./design-guide.md).
4. **기능 간 횡단 import 지양.** 한 `features/A`가 다른 `features/B`의 내부를 직접 import하지 말 것. 공유가 필요하면 `lib/`로 내린다.

## 파사드 레이어 (`entities/`, `shared/api/`)

`entities/workout-record`, `shared/api`는 **얇은 re-export 배럴**이다. 실체는 모두 `lib/`에 있다(예: `entities/workout-record` → `@/lib/workout-record/model`·`entry-state`). 따라서:

- `lib/` 내부 코드는 파사드(`@/entities/*`)를 거치지 말고 **실체(`@/lib/...`)를 직접 import**한다 (lib→entities→lib 우회 방지).
- `features/`·`widgets/`·`app/`에서는 파사드를 써도 무방하다.

## "강제하지 않는 이유" — 레이어 ESLint를 지금 error로 켜지 않는다

감사 적대적 검증에서 확인된 사실: 라이브 홈 화면 `components/v2/v2-home-dashboard.tsx`가 `@/widgets/*`를 **상향 import**한다(`components/v2`는 본래 primitive 커널 레이어인데 화면 조립기가 섞여 있음). 이 상태에서 `components/v2/** → @/widgets` 금지 룰을 `error`로 켜면 **라이브 코드가 깨진다.**

따라서 순서는:
1. (지금) 이 문서로 모델을 **명문화**하고 새 코드에 적용.
2. (후속) `v2-home-dashboard` 같은 화면 조립기를 `components/v2/`에서 분리하고, 레이어 룰의 glob을 `components/v2/primitives/**`로 한정.
3. (그 후) `no-restricted-imports`를 레이어 방향 기준으로 `error` 승격.

## 알려진 잔여 위반 / 후속 과제

- `components/v2/v2-home-dashboard.tsx` → `@/widgets/*` 상향 import (위 참조).
- 정규 FSD 전면 전환(빈 `entities/`·`shared/` 실제 구현, `lib/` 세그먼트 슬라이싱)은 1인 앱 비용 대비 효과가 낮아 **하지 않는다**(감사 결론).
