-- 휴식 종료 푸시 스케줄러 — **prod Supabase에서 한 번만** 실행한다(SQL Editor).
--
-- Drizzle 마이그레이션에 넣지 않는 이유: pg_cron·pg_net은 Supabase에만 있다. CI·로컬
-- Postgres와 dev 스키마(DB_SCHEMA=dev)에서 마이그레이션이 깨지면 안 된다.
--
-- 동작: 1초마다 만료된 예약(public.rest_push_schedule)이 **있을 때만** 앱의
-- `POST /api/ops/rest-push/dispatch`를 부른다. claim·발송은 앱(apps/api)이 한다.
-- 앱의 VAPID 키(VAPID_PUBLIC_KEY·VAPID_PRIVATE_KEY·VAPID_SUBJECT)가 먼저 배포돼 있어야 한다.
--
-- 실행 전 아래 두 값을 바꾼다. 다시 실행해도 안전하다(시크릿은 이미 있으면 갱신, 잡은 upsert).
--   <APP_ORIGIN>  예: https://workout-log.example.com  (prod 도메인, 끝 슬래시 없이)
--   <OPS_TOKEN>   Vercel env의 CRON_SECRET 또는 WORKOUT_OPS_TOKEN 값
--
-- 되돌리기: select cron.unschedule('rest-push-dispatch');
--           select cron.unschedule('rest-push-run-log-cleanup');

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_url text := '<APP_ORIGIN>/api/ops/rest-push/dispatch';
  v_token text := '<OPS_TOKEN>';
begin
  if v_url like '<%' or v_token like '<%' then
    raise exception '<APP_ORIGIN>·<OPS_TOKEN> 자리표시자를 실제 값으로 바꾼 뒤 실행하세요';
  end if;

  if exists (select 1 from vault.secrets where name = 'rest_push_dispatch_url') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'rest_push_dispatch_url'), v_url);
  else
    perform vault.create_secret(v_url, 'rest_push_dispatch_url');
  end if;

  if exists (select 1 from vault.secrets where name = 'rest_push_dispatch_token') then
    perform vault.update_secret(
      (select id from vault.secrets where name = 'rest_push_dispatch_token'), v_token);
  else
    perform vault.create_secret(v_token, 'rest_push_dispatch_token');
  end if;
end
$$;

-- 매초: 만료 예약이 있을 때만 HTTP 호출(없으면 인덱스 조회 한 번으로 끝난다).
select cron.schedule(
  'rest-push-dispatch',
  '1 seconds',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'rest_push_dispatch_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'rest_push_dispatch_token'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  where exists (select 1 from public.rest_push_schedule where fire_at <= now());
  $job$
);

-- cron.job_run_details는 자동으로 지워지지 않는다. 1초 잡이면 하루 8.6만 행이 쌓이므로
-- 10분마다 1시간보다 오래된 실행 기록을 지운다.
select cron.schedule(
  'rest-push-run-log-cleanup',
  '*/10 * * * *',
  $job$ delete from cron.job_run_details where end_time < now() - interval '1 hour' $job$
);

-- 확인:
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time from cron.job_run_details
--     order by start_time desc limit 5;
--   select status_code, content, created from net._http_response order by created desc limit 5;
