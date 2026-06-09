CREATE TYPE "dev"."module_target" AS ENUM('SQUAT', 'BENCH', 'DEADLIFT', 'OHP', 'PULL', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "dev"."override_scope" AS ENUM('PLAN', 'WEEK', 'SESSION', 'EXERCISE');--> statement-breakpoint
CREATE TYPE "dev"."plan_type" AS ENUM('SINGLE', 'COMPOSITE', 'MANUAL');--> statement-breakpoint
CREATE TYPE "dev"."program_type" AS ENUM('LOGIC', 'MANUAL');--> statement-breakpoint
CREATE TYPE "dev"."session_status" AS ENUM('PLANNED', 'DONE', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "dev"."visibility_type" AS ENUM('PUBLIC', 'PRIVATE');--> statement-breakpoint
CREATE TABLE "dev"."app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."auth_event_log" (
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
CREATE TABLE "dev"."auth_oauth_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."auth_session" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."email_verification_token" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dev"."exercise" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."exercise_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercise_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."generated_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"session_key" text NOT NULL,
	"scheduled_at" timestamp with time zone,
	"status" "dev"."session_status" DEFAULT 'PLANNED' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."migration_run_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"runner" text NOT NULL,
	"host" text,
	"status" text NOT NULL,
	"error_code" text,
	"message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"lock_wait_ms" integer DEFAULT 0 NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."password_reset_token" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dev"."plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "dev"."plan_type" NOT NULL,
	"root_program_version_id" uuid,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."plan_module" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"target" "dev"."module_target" NOT NULL,
	"program_version_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."plan_override" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"scope" "dev"."override_scope" NOT NULL,
	"week_number" integer,
	"session_key" text,
	"patch" jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."plan_progress_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"log_id" uuid,
	"user_id" text NOT NULL,
	"event_type" text NOT NULL,
	"program_slug" text NOT NULL,
	"reason" text,
	"before_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"after_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."plan_runtime_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"engine_version" integer DEFAULT 1 NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."program_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"type" "dev"."program_type" NOT NULL,
	"visibility" "dev"."visibility_type" DEFAULT 'PUBLIC' NOT NULL,
	"owner_user_id" text,
	"parent_template_id" uuid,
	"description" text,
	"tags" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."program_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"changelog" text,
	"parent_version_id" uuid,
	"definition" jsonb NOT NULL,
	"defaults" jsonb,
	"is_deprecated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."stats_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"metric" text NOT NULL,
	"params_hash" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."user_setting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."ux_event_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_event_id" text NOT NULL,
	"name" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."workout_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" uuid,
	"generated_session_id" uuid,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_minutes" integer,
	"notes" text,
	"tags" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev"."workout_set" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"log_id" uuid NOT NULL,
	"exercise_id" uuid,
	"exercise_name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"set_number" integer DEFAULT 1 NOT NULL,
	"reps" integer,
	"weight_kg" numeric(8, 2),
	"rpe" integer,
	"is_extra" boolean DEFAULT false NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dev"."exercise_alias" ADD CONSTRAINT "exercise_alias_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "dev"."exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."generated_session" ADD CONSTRAINT "generated_session_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dev"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."plan" ADD CONSTRAINT "plan_root_program_version_id_program_version_id_fk" FOREIGN KEY ("root_program_version_id") REFERENCES "dev"."program_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."plan_module" ADD CONSTRAINT "plan_module_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dev"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."plan_module" ADD CONSTRAINT "plan_module_program_version_id_program_version_id_fk" FOREIGN KEY ("program_version_id") REFERENCES "dev"."program_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."plan_override" ADD CONSTRAINT "plan_override_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dev"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."plan_progress_event" ADD CONSTRAINT "plan_progress_event_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dev"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."plan_progress_event" ADD CONSTRAINT "plan_progress_event_log_id_workout_log_id_fk" FOREIGN KEY ("log_id") REFERENCES "dev"."workout_log"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."plan_runtime_state" ADD CONSTRAINT "plan_runtime_state_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dev"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."program_version" ADD CONSTRAINT "program_version_template_id_program_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "dev"."program_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."workout_log" ADD CONSTRAINT "workout_log_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "dev"."plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."workout_log" ADD CONSTRAINT "workout_log_generated_session_id_generated_session_id_fk" FOREIGN KEY ("generated_session_id") REFERENCES "dev"."generated_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."workout_set" ADD CONSTRAINT "workout_set_log_id_workout_log_id_fk" FOREIGN KEY ("log_id") REFERENCES "dev"."workout_log"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dev"."workout_set" ADD CONSTRAINT "workout_set_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "dev"."exercise"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_email_uq" ON "dev"."app_user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "auth_event_log_user_created_idx" ON "dev"."auth_event_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "auth_event_log_type_created_idx" ON "dev"."auth_event_log" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_oauth_provider_subject_uq" ON "dev"."auth_oauth_account" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE INDEX "auth_oauth_user_idx" ON "dev"."auth_oauth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_session_user_idx" ON "dev"."auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_session_expires_idx" ON "dev"."auth_session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "email_verification_token_user_idx" ON "dev"."email_verification_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_verification_token_expires_idx" ON "dev"."email_verification_token" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_name_uq" ON "dev"."exercise" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "exercise_alias_alias_uq" ON "dev"."exercise_alias" USING btree ("alias");--> statement-breakpoint
CREATE INDEX "exercise_alias_exercise_idx" ON "dev"."exercise_alias" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "generated_session_user_idx" ON "dev"."generated_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "generated_session_plan_idx" ON "dev"."generated_session" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_session_plan_session_uq" ON "dev"."generated_session" USING btree ("plan_id","session_key");--> statement-breakpoint
CREATE INDEX "generated_session_user_scheduled_at_idx" ON "dev"."generated_session" USING btree ("user_id",coalesce("scheduled_at", "updated_at"));--> statement-breakpoint
CREATE UNIQUE INDEX "migration_run_log_run_id_uq" ON "dev"."migration_run_log" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "migration_run_log_started_idx" ON "dev"."migration_run_log" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "migration_run_log_status_started_idx" ON "dev"."migration_run_log" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "password_reset_token_user_idx" ON "dev"."password_reset_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_reset_token_expires_idx" ON "dev"."password_reset_token" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "plan_user_idx" ON "dev"."plan" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plan_type_idx" ON "dev"."plan" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_module_plan_target_uq" ON "dev"."plan_module" USING btree ("plan_id","target");--> statement-breakpoint
CREATE INDEX "plan_module_plan_idx" ON "dev"."plan_module" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_override_plan_scope_idx" ON "dev"."plan_override" USING btree ("plan_id","scope");--> statement-breakpoint
CREATE INDEX "plan_override_plan_week_idx" ON "dev"."plan_override" USING btree ("plan_id","week_number");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_progress_event_plan_log_slug_uq" ON "dev"."plan_progress_event" USING btree ("plan_id","log_id","program_slug");--> statement-breakpoint
CREATE INDEX "plan_progress_event_plan_idx" ON "dev"."plan_progress_event" USING btree ("plan_id","created_at");--> statement-breakpoint
CREATE INDEX "plan_progress_event_user_idx" ON "dev"."plan_progress_event" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_runtime_state_plan_uq" ON "dev"."plan_runtime_state" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_runtime_state_user_idx" ON "dev"."plan_runtime_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plan_runtime_state_updated_at_idx" ON "dev"."plan_runtime_state" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "program_template_slug_uq" ON "dev"."program_template" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "program_template_type_idx" ON "dev"."program_template" USING btree ("type");--> statement-breakpoint
CREATE INDEX "program_template_owner_idx" ON "dev"."program_template" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_version_template_version_uq" ON "dev"."program_version" USING btree ("template_id","version");--> statement-breakpoint
CREATE INDEX "program_version_template_idx" ON "dev"."program_version" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stats_cache_user_metric_params_uq" ON "dev"."stats_cache" USING btree ("user_id","metric","params_hash");--> statement-breakpoint
CREATE INDEX "stats_cache_user_idx" ON "dev"."stats_cache" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stats_cache_updated_at_idx" ON "dev"."stats_cache" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_setting_user_key_uq" ON "dev"."user_setting" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "user_setting_user_idx" ON "dev"."user_setting" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_setting_user_updated_idx" ON "dev"."user_setting" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_event_log_user_client_event_uq" ON "dev"."ux_event_log" USING btree ("user_id","client_event_id");--> statement-breakpoint
CREATE INDEX "ux_event_log_user_recorded_idx" ON "dev"."ux_event_log" USING btree ("user_id","recorded_at");--> statement-breakpoint
CREATE INDEX "ux_event_log_user_name_recorded_idx" ON "dev"."ux_event_log" USING btree ("user_id","name","recorded_at");--> statement-breakpoint
CREATE INDEX "workout_log_user_performed_idx" ON "dev"."workout_log" USING btree ("user_id","performed_at");--> statement-breakpoint
CREATE INDEX "workout_log_user_day_bucket_utc_idx" ON "dev"."workout_log" USING btree ("user_id",date_trunc('day', "performed_at" at time zone 'UTC'));--> statement-breakpoint
CREATE INDEX "workout_log_user_week_bucket_utc_idx" ON "dev"."workout_log" USING btree ("user_id",date_trunc('week', "performed_at" at time zone 'UTC'));--> statement-breakpoint
CREATE INDEX "workout_log_user_month_bucket_utc_idx" ON "dev"."workout_log" USING btree ("user_id",date_trunc('month', "performed_at" at time zone 'UTC'));--> statement-breakpoint
CREATE INDEX "workout_log_plan_idx" ON "dev"."workout_log" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "workout_log_generated_session_idx" ON "dev"."workout_log" USING btree ("generated_session_id");--> statement-breakpoint
CREATE INDEX "workout_log_user_session_idx" ON "dev"."workout_log" USING btree ("user_id","generated_session_id");--> statement-breakpoint
CREATE INDEX "workout_set_log_idx" ON "dev"."workout_set" USING btree ("log_id");--> statement-breakpoint
CREATE INDEX "workout_set_exercise_id_idx" ON "dev"."workout_set" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "workout_set_exercise_idx" ON "dev"."workout_set" USING btree ("exercise_name");--> statement-breakpoint
CREATE INDEX "workout_set_exercise_name_lower_idx" ON "dev"."workout_set" USING btree (lower("exercise_name"));