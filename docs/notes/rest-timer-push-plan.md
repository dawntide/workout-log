# 휴식 타이머 종료 푸시 — 구현 계획

목표: 화면이 꺼졌거나 앱을 벗어나 있어도 휴식이 끝나면 iOS(홈 화면 설치 PWA, 16.4+)·Android에서 시스템 알림을 받는다.
스케줄러는 관리 부담이 가장 작은 **Supabase Cron(pg_cron) + pg_net**. 클라이언트·SW·VAPID는 migle-board 패턴을 이식한다.

## 확인된 전제 (2026-10-14)

- Supabase Cron은 `'1 seconds'`~`'59 seconds'` 간격을 지원한다(Postgres 15.1.1.61 이상). prod 인스턴스 `workout-log-prod`는 17.6.1.084라 조건을 충족한다. 출처: supabase.com/docs/guides/cron/quickstart
- prod에 `pg_cron` 1.6.4와 `pg_net` 0.20.0은 **설치 가능하지만 아직 미설치** 상태다. `supabase_vault`는 이미 설치돼 있다.
- 현재 SW(`web/src/app/sw.js/route.ts`)는 캐시만 담당한다. push 관련 코드는 0이다.

## 흐름

1. 사용자가 휴식 설정에서 "휴식 종료 알림"을 켠다. 이때 권한을 요청하고 `pushManager.subscribe`를 호출한 뒤 구독을 서버에 저장한다.
2. 세트 완료로 휴식이 시작되면 클라이언트가 `PUT /api/rest-push { fireAt, title }`을 보낸다. 사용자당 1행만 유지하는 upsert다.
3. 휴식을 연장하면 같은 PUT으로 `fireAt`을 갱신한다. 스킵하거나 세션이 끝나면 `DELETE /api/rest-push`를 보낸다.
4. pg_cron이 매 1초 `rest_push_dispatch()`를 실행한다. 만료된 행을 claim(`sent_at` 세팅)하는데, **claim한 행이 있을 때만** pg_net으로 `POST {APP_URL}/api/rest-push/dispatch`를 호출한다. 이 호출은 Vault에 보관한 공유 시크릿 헤더로 인증한다.
5. dispatch 엔드포인트(apps/api)가 claim된 행의 구독으로 Web Push를 보낸다(ttl 60, urgency high, topic `rest`). 404·410 응답이 오면 해당 구독을 삭제한다.
6. SW의 `push` 핸들러가 `showNotification`을 띄우고, `notificationclick`이 `/workout/log`를 포커스하거나 연다.

예상 지연: cron 최대 1초 + pg_net·Vercel 콜드스타트 + APNs/FCM을 합쳐 대략 1~3초다.

## 작업 단위

**DB (Drizzle 마이그레이션 `0032_rest_push`)**
- `push_subscription`: id, user_id FK, endpoint unique, p256dh, auth, created_at, last_success_at.
- `rest_push_schedule`: user_id PK FK, fire_at timestamptz, title text, sent_at null, created_at. 인덱스 `(fire_at) where sent_at is null`.
- 이 마이그레이션은 일반 테이블만 다룬다. CI·로컬 Postgres와 `DB_SCHEMA=dev`에는 pg_cron이 없으므로, 확장과 잡 생성은 아래 일회성 스크립트로 분리한다.

**일회성 ops 스크립트 `web/scripts/setup-rest-push-cron.sql`** (prod에서 한 번 실행)
- `create extension pg_cron; create extension pg_net;`
- Vault에 `rest_push_dispatch_secret`과 `app_url`을 저장한다.
- `rest_push_dispatch()` plpgsql 함수와 `cron.schedule('rest-push-dispatch', '1 seconds', ...)`를 만든다.
- 정리 잡을 둔다. `cron.job_run_details`는 자동 정리되지 않고 1초 잡이면 하루 8.6만 행이 쌓이므로, 하루 1회 1일보다 오래된 기록을 삭제한다. `rest_push_schedule`의 sent 행과 오래된 행도 함께 삭제한다.

**apps/api (Hono, next 의존 금지 — lint:boundary 준수)**
- `routes/rest-push.ts` 추가: `PUT`·`DELETE /rest-push`(세션 인증), `POST/GET/DELETE /push/subscription`, `POST /rest-push/dispatch`(시크릿 헤더 인증, timing-safe 비교).
- 발송 라이브러리는 `@block65/webcrypto-web-push`(migle-board와 같은 라이브러리, WebCrypto만 사용). 서비스 로직은 `packages/core/src/push/`에 둔다.
- env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `REST_PUSH_DISPATCH_SECRET`. 공개 키는 `GET /push/vapid-key`로 내려준다.

**web**
- `sw.js/route.ts`에 `push`와 `notificationclick` 핸들러를 추가한다.
- `lib/push/push-client.ts`: migle-board의 `src/ui/pushClient.ts`를 이식한다(지원 판정, 설치 여부, 권한, 구독, 해지).
- `use-rest-timer.ts`의 start·extend·skip과 `useStartRestTimer`에서 rest-push를 fire-and-forget으로 호출한다. 실패해도 타이머는 계속 돈다.
- 설정: `SETTINGS_KEYS.restPushEnabled`(core)를 추가하고 휴식 설정 화면에 토글을 둔다. iOS 미설치 상태면 토글 대신 "홈 화면에 추가 후 사용 가능" 안내를 보여준다.
- 계정 전환(impersonation)·로그아웃 시 구독도 해지한다(`local-app-state.ts` 정리 경로).

**설정·배포 (사용자 작업, 1회)**
- VAPID 키를 생성(migle-board `scripts/setup-push.mjs` 방식)해 Vercel env에 넣는다.
- `setup-rest-push-cron.sql`을 prod에서 1회 실행한다.

**테스트**
- core: claim·만료 로직과 404/410 구독 삭제 유닛 테스트.
- 실기기: iPhone 설치 PWA에서 세트 완료 → 화면 잠금 → 알림 수신과 탭 시 복귀를 확인한다. 자동 테스트로는 잠금 화면 수신을 증명할 수 없다.

## 남는 한계

- iOS는 Safari 탭에서는 받을 수 없고 홈 화면 설치 앱에서만 받는다.
- 앱이 열려 있을 때도 푸시는 도착한다. iOS는 푸시마다 알림을 표시해야 하므로, 앱이 보이는 상태에서도 기존 비프와 알림이 둘 다 뜬다.
- 푸시 전달은 OS·네트워크 상황에 따라 지연되거나 누락될 수 있고, 재전송하지 않는다.
