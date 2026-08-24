CREATE TABLE IF NOT EXISTS "body_measurement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'weight' NOT NULL,
	"value_kg" numeric(6, 2) NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "body_measurement" ADD CONSTRAINT "body_measurement_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "body_measurement_user_kind_at_uq" ON "body_measurement" USING btree ("user_id","kind","measured_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "body_measurement_user_kind_at_idx" ON "body_measurement" USING btree ("user_id","kind","measured_at" DESC);
--> statement-breakpoint
CREATE TRIGGER "account_lifecycle_write_guard" BEFORE INSERT OR UPDATE ON "body_measurement"
FOR EACH ROW EXECUTE FUNCTION "guard_deleted_account_write"('user_id');
