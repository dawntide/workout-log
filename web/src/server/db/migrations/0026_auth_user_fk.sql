-- PROD-schema auth user_id → uuid + FK(app_user). Follow-up to 0025 (plan §3 2차 배치).
-- auth_event_log is intentionally EXCLUDED: the account-delete flow logs an ACCOUNT_DELETE
-- event AFTER the app_user row is gone, so its user_id must reference a non-existent user.
-- Fail loud if any of the four target tables holds a non-uuid or orphan user id (prod scan
-- found none); such rows must be reconciled before this runs — never silently altered.
DO $$
DECLARE
  r record;
  bad bigint;
  uuid_re text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  FOR r IN
    SELECT t AS tbl FROM unnest(ARRAY[
      'auth_session','password_reset_token','email_verification_token','auth_oauth_account']) AS t
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I WHERE user_id IS NOT NULL AND (user_id !~ %L OR (user_id ~ %L AND user_id::uuid NOT IN (SELECT id FROM app_user)))',
      r.tbl, uuid_re, uuid_re
    ) INTO bad;
    IF bad > 0 THEN
      RAISE EXCEPTION 'auth FK migration blocked: %.user_id has % row(s) with a non-uuid or orphan user id. Reconcile before applying (see docs/db-multiuser-isolation-plan.md §4.2).', r.tbl, bad;
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "auth_oauth_account" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "auth_session" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "email_verification_token" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "password_reset_token" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "auth_oauth_account" ADD CONSTRAINT "auth_oauth_account_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_token" ADD CONSTRAINT "email_verification_token_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
