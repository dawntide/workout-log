# 휴식 종료 푸시 알림

세트를 완료해 휴식이 시작되면, 화면이 꺼져 있거나 다른 앱을 보고 있어도 휴식이 끝날 때 시스템 알림을 받는다. 설정 → 휴식 타이머 → **휴식 끝 알림**을 켠 기기만 받는다(기기 단위, 서버 설정 아님).

- iPhone·iPad: iOS/iPadOS 16.4 이상에서 **홈 화면에 추가한 앱**만 받는다. Safari 탭에서는 토글이 비활성으로 안내만 보인다.
- 앱을 보고 있을 때도 알림이 온다. iOS는 푸시마다 알림 표시를 요구하므로 기존 종료음과 함께 뜬다.
- 전달은 대략 1~3초 늦을 수 있고, 실패해도 재전송하지 않는다. 60초 안에 전달하지 못한 알림은 버린다.

## 구조

```
세트 완료 ─ PUT /api/push/rest {구독, 남은 초, 문구} ─▶ rest_push_schedule (사용자당 1행)
연장      ─ PUT (같은 행 덮기)      스킵·기록 저장 ─ DELETE
Supabase Cron(1초) ─ 만료 행이 있을 때만 ─▶ POST /api/ops/rest-push/dispatch
                                           └ DELETE…RETURNING으로 claim → Web Push 발송
서비스워커 push → showNotification, 탭하면 /workout/log로
```

- 구독 테이블은 없다. 예약이 그 기기의 구독을 함께 싣는다 — 알림은 휴식을 시작한 기기로만 간다.
- 코드: `packages/core/src/push/*`(검증·발송·예약), `apps/api/src/routes/push.ts`·`ops.ts`, `web/src/lib/push/*`, `web/src/app/sw.js/route.ts`.

## 켜는 법 (prod, 한 번)

1. `node web/scripts/setup-push-keys.mjs --subject mailto:<연락 가능한 주소>` → `.push-keys.json`의 세 값을 Vercel env(Production)에 넣고 재배포한다. 키가 없으면 설정 토글이 아예 숨겨진다.
2. Supabase SQL Editor에서 [`web/scripts/setup-rest-push-cron.sql`](../scripts/setup-rest-push-cron.sql)의 `<APP_ORIGIN>`·`<OPS_TOKEN>`(Vercel의 `CRON_SECRET` 또는 `WORKOUT_OPS_TOKEN`)을 채워 실행한다.
3. 실기기 확인: 설치한 앱에서 토글 켜기 → 세트 완료 → 화면 잠금 → 알림 수신과 탭 시 복귀.

키를 교체하면 모든 기기가 토글을 다시 켜야 한다. 로컬·dev 스키마에는 cron이 없다 — 발송을 보려면 `POST /api/ops/rest-push/dispatch`를 직접 부른다.
