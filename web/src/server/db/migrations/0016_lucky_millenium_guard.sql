CREATE TABLE "auth_event_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text,
	"event_type" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"success" boolean NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verification_token" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "password_reset_token" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "auth_event_log_user_created_idx" ON "auth_event_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "auth_event_log_type_created_idx" ON "auth_event_log" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "email_verification_token_user_idx" ON "email_verification_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_verification_token_expires_idx" ON "email_verification_token" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "password_reset_token_user_idx" ON "password_reset_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_token_expires_idx" ON "password_reset_token" USING btree ("expires_at");