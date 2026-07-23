-- DEV: ux_event_log.user_id text NOT NULL -> nullable uuid + FK(app_user). Anonymous public
-- web-vitals move from the '__anonymous_web_vitals__' sentinel to NULL; the unique becomes
-- NULLS NOT DISTINCT so anonymous rows still dedup on client_event_id.
DROP INDEX "dev"."ux_event_log_user_client_event_uq";--> statement-breakpoint
ALTER TABLE "dev"."ux_event_log" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
-- Anonymous sentinel -> NULL (no account).
UPDATE "dev"."ux_event_log" SET user_id = NULL WHERE user_id = '__anonymous_web_vitals__';--> statement-breakpoint
-- Dev/local fallback -> canonical uuid (has a seeded app_user).
UPDATE "dev"."ux_event_log" SET user_id = '00000000-0000-4000-8000-000000c1c1c1' WHERE user_id IN ('local-user', 'dev');--> statement-breakpoint
-- Any remaining non-null value with no app_user is an orphan (deleted user) — drop it.
DELETE FROM "dev"."ux_event_log" WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id::text FROM "dev"."app_user");--> statement-breakpoint
ALTER TABLE "dev"."ux_event_log" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "dev"."ux_event_log" ADD CONSTRAINT "ux_event_log_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "dev"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."ux_event_log" ADD CONSTRAINT "ux_event_log_user_client_event_uq" UNIQUE NULLS NOT DISTINCT("user_id","client_event_id");
