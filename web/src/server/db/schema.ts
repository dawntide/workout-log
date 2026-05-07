import {
  bigserial,
  boolean,
  index,
  integer,
  numeric,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Enums
 */
export const programType = pgEnum("program_type", ["LOGIC", "MANUAL"]);
export const visibilityType = pgEnum("visibility_type", ["PUBLIC", "PRIVATE"]);

export const planType = pgEnum("plan_type", ["SINGLE", "COMPOSITE", "MANUAL"]);
export const moduleTarget = pgEnum("module_target", [
  "SQUAT",
  "BENCH",
  "DEADLIFT",
  "OHP",
  "PULL",
  "CUSTOM",
]);

export const overrideScope = pgEnum("override_scope", [
  "PLAN",
  "WEEK",
  "SESSION",
  "EXERCISE",
]);

export const sessionStatus = pgEnum("session_status", ["PLANNED", "DONE", "SKIPPED"]);

/**
 * program_template: top-level template definition (e.g., 5/3/1, Operator, Candito, Manual)
 *
 * Fork support:
 * - ownerUserId: for PRIVATE templates
 * - parentTemplateId: points to the original template if this is a fork
 */
export const programTemplate = pgTable(
  "program_template",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    slug: text("slug").notNull(), // stable identifier, e.g. "531", "operator"
    name: text("name").notNull(),
    type: programType("type").notNull(),
    visibility: visibilityType("visibility").notNull().default("PUBLIC"),

    // fork/ownership
    ownerUserId: text("owner_user_id"),
    parentTemplateId: uuid("parent_template_id"),

    description: text("description"),
    tags: text("tags").array(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("program_template_slug_uq").on(t.slug),
    index("program_template_type_idx").on(t.type),
    index("program_template_owner_idx").on(t.ownerUserId),
  ],
);

/**
 * program_version: versioned definition (DSL JSON for LOGIC, fixed sessions JSON for MANUAL)
 *
 * Fork support:
 * - parentVersionId: points to the version that was forked
 */
export const programVersion = pgTable(
  "program_version",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    templateId: uuid("template_id")
      .notNull()
      .references(() => programTemplate.id, { onDelete: "cascade" }),

    version: integer("version").notNull(), // 1,2,3...
    changelog: text("changelog"),

    // fork lineage
    parentVersionId: uuid("parent_version_id"),

    // definition JSONB:
    // - LOGIC: DSL describing generation rules
    // - MANUAL: explicit sessions/exercises/sets structure
    definition: jsonb("definition").notNull(),

    // optional: default parameters (TM, 1RM, schedule options)
    defaults: jsonb("defaults"),

    isDeprecated: boolean("is_deprecated").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("program_version_template_version_uq").on(t.templateId, t.version),
    index("program_version_template_idx").on(t.templateId),
  ],
);

/**
 * plan: user's instance of a program or composite of modules
 */
export const plan = pgTable(
  "plan",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),

    name: text("name").notNull(),
    type: planType("type").notNull(),

    // root program version for SINGLE/MANUAL
    rootProgramVersionId: uuid("root_program_version_id").references(() => programVersion.id, {
      onDelete: "restrict",
    }),

    // plan-level parameters (e.g., schedule preferences, training maxes)
    params: jsonb("params").notNull().default({}),

    isArchived: boolean("is_archived").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("plan_user_idx").on(t.userId),
    index("plan_type_idx").on(t.type),
  ],
);

/**
 * plan_runtime_state: per-plan mutable runtime state for auto progression.
 */
export const planRuntimeState = pgTable(
  "plan_runtime_state",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    engineVersion: integer("engine_version").notNull().default(1),
    state: jsonb("state").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("plan_runtime_state_plan_uq").on(t.planId),
    index("plan_runtime_state_user_idx").on(t.userId),
    index("plan_runtime_state_updated_at_idx").on(t.updatedAt),
  ],
);

/**
 * plan_module: for COMPOSITE plans, mapping each target lift/module to a program version.
 */
export const planModule = pgTable(
  "plan_module",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    planId: uuid("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "cascade" }),

    target: moduleTarget("target").notNull(),

    programVersionId: uuid("program_version_id")
      .notNull()
      .references(() => programVersion.id, { onDelete: "restrict" }),

    priority: integer("priority").notNull().default(0),

    params: jsonb("params").notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("plan_module_plan_target_uq").on(t.planId, t.target),
    index("plan_module_plan_idx").on(t.planId),
  ],
);

/**
 * plan_override: store changes as JSON patch-like document.
 */
export const planOverride = pgTable(
  "plan_override",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    planId: uuid("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "cascade" }),

    scope: overrideScope("scope").notNull(),

    weekNumber: integer("week_number"),
    sessionKey: text("session_key"),

    patch: jsonb("patch").notNull(),

    note: text("note"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("plan_override_plan_scope_idx").on(t.planId, t.scope),
    index("plan_override_plan_week_idx").on(t.planId, t.weekNumber),
  ],
);

/**
 * generated_session: materialized/snapshotted planned session
 */
export const generatedSession = pgTable(
  "generated_session",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    planId: uuid("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "cascade" }),

    userId: text("user_id").notNull(),

    sessionKey: text("session_key").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),

    status: sessionStatus("status").notNull().default("PLANNED"),

    snapshot: jsonb("snapshot").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("generated_session_user_idx").on(t.userId),
    index("generated_session_plan_idx").on(t.planId),
    uniqueIndex("generated_session_plan_session_uq").on(t.planId, t.sessionKey),
    // PERF: compliance 쿼리의 coalesce(scheduled_at, updated_at) 범위 필터를 가속하는 함수형 인덱스
    index("generated_session_user_scheduled_at_idx").on(
      t.userId,
      sql`coalesce(${t.scheduledAt}, ${t.updatedAt})`,
    ),
  ],
);

/**
 * exercise: canonical exercise dictionary
 */
export const exercise = pgTable(
  "exercise",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    category: text("category"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("exercise_name_uq").on(t.name),
  ],
);

/**
 * exercise_alias: user-facing aliases mapped to canonical exercise
 */
export const exerciseAlias = pgTable(
  "exercise_alias",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercise.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("exercise_alias_alias_uq").on(t.alias),
    index("exercise_alias_exercise_idx").on(t.exerciseId),
  ],
);

/**
 * workout_log: 실제 수행 기록
 */
export const workoutLog = pgTable(
  "workout_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),

    planId: uuid("plan_id").references(() => plan.id, { onDelete: "set null" }),
    generatedSessionId: uuid("generated_session_id").references(() => generatedSession.id, {
      onDelete: "set null",
    }),

    performedAt: timestamp("performed_at", { withTimezone: true }).defaultNow().notNull(),
    durationMinutes: integer("duration_minutes"),
    notes: text("notes"),
    tags: text("tags").array(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("workout_log_user_performed_idx").on(t.userId, t.performedAt),
    index("workout_log_user_day_bucket_utc_idx").on(
      t.userId,
      sql`date_trunc('day', ${t.performedAt} at time zone 'UTC')`,
    ),
    index("workout_log_user_week_bucket_utc_idx").on(
      t.userId,
      sql`date_trunc('week', ${t.performedAt} at time zone 'UTC')`,
    ),
    index("workout_log_user_month_bucket_utc_idx").on(
      t.userId,
      sql`date_trunc('month', ${t.performedAt} at time zone 'UTC')`,
    ),
    index("workout_log_plan_idx").on(t.planId),
    index("workout_log_generated_session_idx").on(t.generatedSessionId),
    // PERF: compliance 쿼리의 (userId, generatedSessionId) 복합 필터를 가속
    index("workout_log_user_session_idx").on(t.userId, t.generatedSessionId),
  ],
);

/**
 * plan_progress_event: append-only progression decisions triggered by logs.
 */
export const planProgressEvent = pgTable(
  "plan_progress_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "cascade" }),
    logId: uuid("log_id").references(() => workoutLog.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    eventType: text("event_type").notNull(),
    programSlug: text("program_slug").notNull(),
    reason: text("reason"),
    beforeState: jsonb("before_state").notNull().default({}),
    afterState: jsonb("after_state").notNull().default({}),
    meta: jsonb("meta").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("plan_progress_event_plan_log_slug_uq").on(
      t.planId,
      t.logId,
      t.programSlug,
    ),
    index("plan_progress_event_plan_idx").on(t.planId, t.createdAt),
    index("plan_progress_event_user_idx").on(t.userId, t.createdAt),
  ],
);

/**
 * workout_set: 정규화된 세트 이벤트
 */
export const workoutSet = pgTable(
  "workout_set",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    logId: uuid("log_id")
      .notNull()
      .references(() => workoutLog.id, { onDelete: "cascade" }),

    exerciseId: uuid("exercise_id").references(() => exercise.id, { onDelete: "set null" }),
    exerciseName: text("exercise_name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),

    setNumber: integer("set_number").notNull().default(1),
    reps: integer("reps"),
    weightKg: numeric("weight_kg", { precision: 8, scale: 2, mode: "number" }),
    rpe: integer("rpe"),
    isExtra: boolean("is_extra").notNull().default(false),

    meta: jsonb("meta").notNull().default({}),
  },
  (t) => [
    index("workout_set_log_idx").on(t.logId),
    index("workout_set_exercise_id_idx").on(t.exerciseId),
    index("workout_set_exercise_idx").on(t.exerciseName),
    index("workout_set_exercise_name_lower_idx").on(
      sql`lower(${t.exerciseName})`,
    ),
  ],
);

/**
 * stats_cache: cached aggregate payloads for expensive stats queries
 */
export const statsCache = pgTable(
  "stats_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    metric: text("metric").notNull(),
    paramsHash: text("params_hash").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("stats_cache_user_metric_params_uq").on(
      t.userId,
      t.metric,
      t.paramsHash,
    ),
    index("stats_cache_user_idx").on(t.userId),
    index("stats_cache_updated_at_idx").on(t.updatedAt),
  ],
);

/**
 * user_setting: per-user persisted settings (primitive JSON values)
 */
export const userSetting = pgTable(
  "user_setting",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("user_setting_user_key_uq").on(t.userId, t.key),
    index("user_setting_user_idx").on(t.userId),
    index("user_setting_user_updated_idx").on(t.userId, t.updatedAt),
  ],
);

/**
 * ux_event_log: client UX event stream persisted server-side for cross-device continuity
 */
export const uxEventLog = pgTable(
  "ux_event_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    clientEventId: text("client_event_id").notNull(),
    name: text("name").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    props: jsonb("props").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("ux_event_log_user_client_event_uq").on(
      t.userId,
      t.clientEventId,
    ),
    index("ux_event_log_user_recorded_idx").on(t.userId, t.recordedAt),
    index("ux_event_log_user_name_recorded_idx").on(
      t.userId,
      t.name,
      t.recordedAt,
    ),
  ],
);

/**
 * migration_run_log: migration execution telemetry for deploy/ops alerts
 */
export const migrationRunLog = pgTable(
  "migration_run_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: text("run_id").notNull(),
    runner: text("runner").notNull(),
    host: text("host"),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    message: text("message"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lockWaitMs: integer("lock_wait_ms").notNull().default(0),
    details: jsonb("details").notNull().default({}),
  },
  (t) => [
    uniqueIndex("migration_run_log_run_id_uq").on(t.runId),
    index("migration_run_log_started_idx").on(t.startedAt),
    index("migration_run_log_status_started_idx").on(t.status, t.startedAt),
  ],
);

/**
 * app_user: 인증된 사용자.
 *
 * 기존에는 WORKOUT_AUTH_USER_ID 환경변수로 단일 사용자였지만,
 * 이제 email + password (PBKDF2) 기반 멀티유저 인증.
 *
 * 기존 모든 도메인 테이블의 user_id (text) 컬럼은 이 테이블의 id (uuid)를
 * 문자열로 저장한다. id는 string으로 select되어 호환됨.
 */
export const appUser = pgTable(
  "app_user",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("app_user_email_uq").on(t.email)],
);

/**
 * auth_session: 쿠키 기반 세션 토큰.
 *
 * - token: opaque random string, 클라이언트 cookie에 저장
 * - userId: app_user.id 참조 (문자열)
 * - expiresAt: 만료 시각 (TTL)
 */
export const authSession = pgTable(
  "auth_session",
  {
    token: text("token").primaryKey(),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("auth_session_user_idx").on(t.userId),
    index("auth_session_expires_idx").on(t.expiresAt),
  ],
);

export const passwordResetToken = pgTable(
  "password_reset_token",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [
    index("password_reset_token_user_idx").on(t.userId),
    index("password_reset_token_expires_idx").on(t.expiresAt),
  ],
);

export const emailVerificationToken = pgTable(
  "email_verification_token",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (t) => [
    index("email_verification_token_user_idx").on(t.userId),
    index("email_verification_token_expires_idx").on(t.expiresAt),
  ],
);

export const authEventLog = pgTable(
  "auth_event_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id"),
    eventType: text("event_type").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    success: boolean("success").notNull(),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("auth_event_log_user_created_idx").on(t.userId, t.createdAt),
    index("auth_event_log_type_created_idx").on(t.eventType, t.createdAt),
  ],
);
