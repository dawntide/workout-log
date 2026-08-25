CREATE TABLE IF NOT EXISTS "auth_api_token" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"token_prefix" text NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scope" text DEFAULT 'read' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auth_api_token" ADD CONSTRAINT "auth_api_token_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_api_token_user_idx" ON "auth_api_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_api_token_expires_idx" ON "auth_api_token" USING btree ("expires_at");
--> statement-breakpoint
CREATE TRIGGER "account_lifecycle_write_guard" BEFORE INSERT OR UPDATE ON "auth_api_token"
FOR EACH ROW EXECUTE FUNCTION "guard_deleted_account_write"('user_id');
