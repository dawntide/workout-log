-- DEV-schema auth user_id → uuid + FK(app_user). Follow-up to 0008 (see plan §3 2차 배치).
-- auth_event_log is intentionally EXCLUDED: the account-delete flow logs an ACCOUNT_DELETE
-- event AFTER the app_user row is gone, so its user_id must be allowed to reference a
-- non-existent user (like ux_event_log). It stays text.
--
-- Delete orphan rows (user_id with no app_user) before adding the FK. Dev scan found
-- auth_session x3 + email_verification_token x1 (a since-removed user). Prod is clean.
DELETE FROM "dev"."auth_session" WHERE user_id NOT IN (SELECT id::text FROM "dev"."app_user");--> statement-breakpoint
DELETE FROM "dev"."password_reset_token" WHERE user_id NOT IN (SELECT id::text FROM "dev"."app_user");--> statement-breakpoint
DELETE FROM "dev"."email_verification_token" WHERE user_id NOT IN (SELECT id::text FROM "dev"."app_user");--> statement-breakpoint
DELETE FROM "dev"."auth_oauth_account" WHERE user_id NOT IN (SELECT id::text FROM "dev"."app_user");--> statement-breakpoint
ALTER TABLE "dev"."auth_oauth_account" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "dev"."auth_session" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "dev"."email_verification_token" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "dev"."password_reset_token" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "dev"."auth_oauth_account" ADD CONSTRAINT "auth_oauth_account_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "dev"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."auth_session" ADD CONSTRAINT "auth_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "dev"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."email_verification_token" ADD CONSTRAINT "email_verification_token_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "dev"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "dev"."app_user"("id") ON DELETE cascade ON UPDATE no action;
