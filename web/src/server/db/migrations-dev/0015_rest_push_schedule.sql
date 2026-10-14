CREATE TABLE IF NOT EXISTS "dev"."rest_push_schedule" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"fire_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dev"."rest_push_schedule" ADD CONSTRAINT "rest_push_schedule_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "dev"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rest_push_schedule_fire_at_idx" ON "dev"."rest_push_schedule" USING btree ("fire_at");
--> statement-breakpoint
CREATE TRIGGER "account_lifecycle_write_guard" BEFORE INSERT OR UPDATE ON "dev"."rest_push_schedule"
FOR EACH ROW EXECUTE FUNCTION "dev"."guard_deleted_account_write"('user_id');
