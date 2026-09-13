import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { appUser, authOauthAccount, programTemplate, programVersion, plan, workoutLog, workoutSet, planProgressEvent, generatedSession, planRuntimeState } from "@workout/core/db/schema";
import { findOrCreateUserFromOAuth } from "../src/server/auth/oauth-link";
import { buildUserDataExport } from "@workout/core/export/userExport";
import { importUserData } from "@workout/core/import/userImport";
import { readStoredDecisionsByLogId } from "@workout/core/progression/autoProgression";
import { deleteUserDomainData } from "@workout/core/data/deleteUserData";
import { upsertWorkoutLogService } from "@workout/core/services/workout-log/upsert-log";
import { REF5_PROTOCOL_VERSION, REF5_INITIAL_DIRECT_STANDARDS_KG, createInitialRef5State, generateRef5Session } from "@workout/core/program-engine/ref5";
import { rebuildRef5ProgressionForPlan } from "@workout/core/progression/ref5-auto-progression";

// Explicit opt-in and loopback only: this suite creates disposable test accounts.
const target = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid");
if (process.env.WORKOUT_RELIABILITY_INTEGRATION !== "1" ||
    !["127.0.0.1", "localhost"].includes(target.hostname)) {
  throw new Error("Reliability integration tests require an explicitly enabled local database");
}
after(async () => { await global.__dbPool?.end(); });

test("backdated creates and reordered edits keep the newly submitted progression choice", async () => {
  const [user] = await db.insert(appUser).values({ email: `reliability-${randomUUID()}@example.com`, passwordHash: "test" }).returning();
  try {
    const [template] = await db.insert(programTemplate).values({ slug: `reliability-${randomUUID()}`, name: "Test", type: "LOGIC", visibility: "PRIVATE", ownerUserId: user.id }).returning();
    const [version] = await db.insert(programVersion).values({ templateId: template.id, version: 1, definition: { kind: "greyskull-lp" } }).returning();
    const [userPlan] = await db.insert(plan).values({ userId: user.id, name: "Test", type: "SINGLE", rootProgramVersionId: version.id, params: { autoProgression: true, trainingMaxKg: { SQUAT: 100 } } }).returning();
    const input = { userId: user.id, timezone: "UTC", locale: "en" as const, planId: userPlan.id,
      sets: [{ exerciseName: "Back Squat", reps: 5, weightKg: 100, setNumber: 1 }] };
    await upsertWorkoutLogService({ ...input, performedAt: new Date("2026-09-02T12:00:00Z") });
    const choice = { SQUAT: { mode: "hold" as const, workKg: 67.5 } };
    const earlier = await upsertWorkoutLogService({ ...input, performedAt: new Date("2026-09-01T12:00:00Z"), progressionTargetDecisions: choice });
    assert.deepEqual((await readStoredDecisionsByLogId(db, user.id)).get(earlier.log.id), choice);
    const replacement = { SQUAT: { mode: "reset" as const, workKg: 55 } };
    await upsertWorkoutLogService({ ...input, logId: earlier.log.id, performedAt: new Date("2026-09-03T12:00:00Z"), progressionTargetDecisions: replacement });
    assert.deepEqual((await readStoredDecisionsByLogId(db, user.id)).get(earlier.log.id), replacement);
    await upsertWorkoutLogService({ ...input, logId: earlier.log.id, performedAt: new Date("2026-08-31T12:00:00Z") });
    assert.deepEqual((await readStoredDecisionsByLogId(db, user.id)).get(earlier.log.id), replacement);
  } finally {
    await db.transaction((tx) => deleteUserDomainData(tx, user.id));
    await db.delete(appUser).where(eq(appUser.id, user.id));
  }
});

for (const completed of [false, true]) test(`REF5 import restores ${completed ? "completed" : "started"} sessions and rolls back invalid snapshots`, async () => {
  const [user] = await db.insert(appUser).values({ email: `reliability-${randomUUID()}@example.com`, passwordHash: "test" }).returning();
  try {
    const [template] = await db.insert(programTemplate).values({ slug: `reliability-${randomUUID()}`, name: "REF5", type: "LOGIC", visibility: "PRIVATE", ownerUserId: user.id }).returning();
    const [version] = await db.insert(programVersion).values({ templateId: template.id, version: 1, definition: { kind: "ref5" } }).returning();
    const [userPlan] = await db.insert(plan).values({ userId: user.id, name: "REF5", type: "SINGLE",
      rootProgramVersionId: version.id, params: { programFamily: "ref5", protocolVersion: REF5_PROTOCOL_VERSION,
        ref5: { startingValuesKg: REF5_INITIAL_DIRECT_STANDARDS_KG } } }).returning();
    const startEventId = randomUUID();
    const domain = generateRef5Session(createInitialRef5State(), {
      sessionId: `REF5:2026-09-01T12:00:00.000Z:${startEventId}`, snapshotId: `${startEventId}:snapshot`,
      actualStartAt: "2026-09-01T12:00:00.000Z", timeZone: "UTC", todayBodyweightKg: 75,
      recent7DayMeasurementCount: 0, recent7DayAverageKg: null, manualMicro: false,
    });
    const [session] = await db.insert(generatedSession).values({ userId: user.id, planId: userPlan.id, sessionKey: domain.sessionId,
      snapshot: { schemaVersion: 4, program: { slug: "ref5-adaptive-strength" }, ref5: {
        protocolVersion: REF5_PROTOCOL_VERSION, startCommitted: true, startEventId, domainSnapshot: domain,
      } },
    }).returning();
    const before = await db.transaction((tx) => rebuildRef5ProgressionForPlan({ tx, userId: user.id, planId: userPlan.id }));
    assert.equal(before.applied, true);
    if (completed) {
      await upsertWorkoutLogService({ userId: user.id, planId: userPlan.id, generatedSessionId: session.id,
        performedAt: new Date(domain.actualStartAt), timezone: "UTC", locale: "en",
        sets: domain.exercises.flatMap((exercise) => exercise.sets.map((set) => ({
          exerciseName: exercise.exerciseName, setNumber: set.setNumber, reps: set.plannedReps,
          weightKg: set.externalLoadKg, rpe: 10, isExtra: false, meta: { ref5: {
            prescription: exercise, protocolVersion: REF5_PROTOCOL_VERSION, terminationReason: "NORMAL",
            actualStartAt: domain.actualStartAt, startEventId, completionEventId: `${startEventId}:completion`,
            runtimeRevisionBefore: domain.runtimeRevision, runtimeRevisionAfter: domain.runtimeRevision + 1,
            plannedReps: set.plannedReps, actualReps: set.plannedReps,
          } },
        }))),
      });
    }
    const [expectedRuntime] = await db.select().from(planRuntimeState).where(eq(planRuntimeState.planId, userPlan.id));
    const backup = JSON.parse(JSON.stringify(await buildUserDataExport(user.id)));
    await db.transaction((tx) => deleteUserDomainData(tx, user.id));
    await importUserData(user.id, backup, "replace");
    const [restoredRuntime] = await db.select().from(planRuntimeState).where(eq(planRuntimeState.planId, userPlan.id));
    assert.deepEqual(restoredRuntime?.state, expectedRuntime.state);
    assert.equal(restoredRuntime?.engineVersion, expectedRuntime.engineVersion);
    const [restoredSession] = await db.select().from(generatedSession).where(eq(generatedSession.id, session.id));
    assert.equal(restoredSession.status, completed ? "DONE" : "PLANNED");
    const invalid = structuredClone(backup);
    invalid.generatedSessions[0].snapshot = {};
    await assert.rejects(importUserData(user.id, invalid, "replace"));
    const [retained] = await db.select().from(planRuntimeState).where(eq(planRuntimeState.planId, userPlan.id));
    assert.deepEqual(retained.state, expectedRuntime.state);
  } finally {
    await db.transaction((tx) => deleteUserDomainData(tx, user.id));
    await db.delete(appUser).where(eq(appUser.id, user.id));
  }
});

test("a verified Google email cannot attach to a pre-registered password account", async () => {
  const email = `reliability-${randomUUID()}@example.com`;
  const [user] = await db.insert(appUser).values({ email, passwordHash: "attacker-password" }).returning();
  try {
    await assert.rejects(findOrCreateUserFromOAuth({
      provider: "google", providerSubject: randomUUID(), email,
      emailVerified: true, displayName: "Real owner",
    }), { name: "OAuthAccountLinkRequiredError" });
    assert.equal((await db.select().from(authOauthAccount).where(eq(authOauthAccount.userId, user.id))).length, 0);
  } finally {
    await db.delete(appUser).where(eq(appUser.id, user.id));
  }
});

test("explicit linking requires the matching account and preserves subsequent OAuth sign-in", async () => {
  const email = `reliability-${randomUUID()}@example.com`;
  const [user] = await db.insert(appUser).values({ email, passwordHash: "existing-password" }).returning();
  const input = { provider: "google" as const, providerSubject: randomUUID(), email,
    emailVerified: true, displayName: "Owner" };
  try {
    await assert.rejects(findOrCreateUserFromOAuth({ ...input, linkingUserId: randomUUID() }),
      { name: "OAuthAccountLinkRequiredError" });
    assert.deepEqual(await findOrCreateUserFromOAuth({ ...input, linkingUserId: user.id }),
      { userId: user.id, isNewUser: false, isNewLink: true });
    assert.deepEqual(await findOrCreateUserFromOAuth(input),
      { userId: user.id, isNewUser: false, isNewLink: false });
    await assert.rejects(findOrCreateUserFromOAuth({ ...input, linkingUserId: randomUUID() }),
      { name: "OAuthAccountLinkRequiredError" });
  } finally {
    await db.delete(appUser).where(eq(appUser.id, user.id));
  }
});

test("a new Google identity creates one account and signs back into it", async () => {
  const input = { provider: "google" as const, providerSubject: randomUUID(),
    email: `reliability-${randomUUID()}@example.com`, emailVerified: true, displayName: "Owner" };
  const created = await findOrCreateUserFromOAuth(input);
  try {
    assert.equal(created.isNewUser, true);
    assert.deepEqual(await findOrCreateUserFromOAuth(input),
      { userId: created.userId, isNewUser: false, isNewLink: false });
  } finally {
    await db.delete(appUser).where(eq(appUser.id, created.userId));
  }
});

test("JSON alone restores manual progression decisions after the original data is gone", async () => {
  const [user] = await db.insert(appUser).values({ email: `reliability-${randomUUID()}@example.com`, passwordHash: "test" }).returning();
  try {
    const [template] = await db.insert(programTemplate).values({
      slug: `reliability-${randomUUID()}`, name: "Test Greyskull", type: "LOGIC", visibility: "PRIVATE", ownerUserId: user.id,
    }).returning();
    const [version] = await db.insert(programVersion).values({
      templateId: template.id, version: 1, definition: { kind: "greyskull-lp" },
    }).returning();
    const [userPlan] = await db.insert(plan).values({ userId: user.id, name: "Test", type: "SINGLE",
      rootProgramVersionId: version.id, params: { autoProgression: true, trainingMaxKg: { SQUAT: 100 } },
    }).returning();
    const [log] = await db.insert(workoutLog).values({ userId: user.id, planId: userPlan.id }).returning();
    await db.insert(workoutSet).values({ logId: log.id, exerciseName: "Back Squat", reps: 5, weightKg: 100, setNumber: 1, sortOrder: 0 });
    const decisions = { SQUAT: { mode: "hold" as const, workKg: 67.5 } };
    await db.insert(planProgressEvent).values({ userId: user.id, planId: userPlan.id, logId: log.id,
      programSlug: template.slug, eventType: "HOLD", meta: { targetDecisionsOverride: decisions },
    });
    const backup = JSON.parse(JSON.stringify(await buildUserDataExport(user.id)));
    assert.deepEqual(backup.progressionDecisions, [{ logId: log.id, decisions }]);
    await db.transaction((tx) => deleteUserDomainData(tx, user.id));
    assert.equal((await readStoredDecisionsByLogId(db, user.id)).size, 0);
    const result = await importUserData(user.id, backup, "replace");
    assert.equal(result.applied, true);
    assert.deepEqual((await readStoredDecisionsByLogId(db, user.id)).get(log.id), decisions);
    // New files are authoritative: an intentionally empty decision list must
    // not silently borrow a later decision from the target database.
    await importUserData(user.id, { ...backup, progressionDecisions: [] }, "replace");
    assert.equal((await readStoredDecisionsByLogId(db, user.id)).size, 0);
  } finally {
    await db.transaction((tx) => deleteUserDomainData(tx, user.id));
    await db.delete(appUser).where(eq(appUser.id, user.id));
  }
});
