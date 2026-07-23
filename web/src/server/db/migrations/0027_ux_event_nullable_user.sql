-- PROD: ux_event_log.user_id text NOT NULL -> nullable uuid + FK(app_user). Anonymous public
-- web-vitals move from the '__anonymous_web_vitals__' sentinel to NULL; unique becomes
-- NULLS NOT DISTINCT so anonymous rows still dedup on client_event_id. After the (intended)
-- sentinel->NULL backfill, fail loud on any remaining non-null non-uuid/orphan user id rather
-- than silently altering it (plan §4.2). No local-user fallback exists on prod.
DROP INDEX "ux_event_log_user_client_event_uq";--> statement-breakpoint
ALTER TABLE "ux_event_log" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
UPDATE "ux_event_log" SET user_id = NULL WHERE user_id = '__anonymous_web_vitals__';--> statement-breakpoint
DO $$
DECLARE
  bad bigint;
  uuid_re text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  SELECT count(*) INTO bad FROM ux_event_log
  WHERE user_id IS NOT NULL
    AND (user_id !~ uuid_re OR (user_id ~ uuid_re AND user_id::uuid NOT IN (SELECT id FROM app_user)));
  IF bad > 0 THEN
    RAISE EXCEPTION 'ux_event_log FK migration blocked: % non-null row(s) with a non-uuid or orphan user id (after anonymous->NULL backfill). Reconcile before applying (see docs/db-multiuser-isolation-plan.md §4.2).', bad;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "ux_event_log" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "ux_event_log" ADD CONSTRAINT "ux_event_log_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ux_event_log" ADD CONSTRAINT "ux_event_log_user_client_event_uq" UNIQUE NULLS NOT DISTINCT("user_id","client_event_id");
