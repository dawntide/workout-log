ALTER TABLE "app_user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_role_check" CHECK ("role" IN ('user', 'admin', 'test'));
