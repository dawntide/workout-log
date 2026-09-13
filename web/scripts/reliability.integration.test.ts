import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { db } from "@workout/core/db/client";
import { appUser, authOauthAccount, programTemplate, programVersion, plan, workoutLog, workoutSet, planProgressEvent } from "@workout/core/db/schema";
import { findOrCreateUserFromOAuth } from "../src/server/auth/oauth-link";
import { buildUserDataExport } from "@workout/core/export/userExport";
import { importUserData } from "@workout/core/import/userImport";
import { readStoredDecisionsByLogId } from "@workout/core/progression/autoProgression";
import { deleteUserDomainData } from "@workout/core/data/deleteUserData";

// Explicit opt-in and loopback only: this suite creates disposable test accounts.
const target = new URL(process.env.DATABASE_URL ?? "postgres://invalid/invalid");
if (process.env.WORKOUT_RELIABILITY_INTEGRATION !== "1" ||
    !["127.0.0.1", "localhost"].includes(target.hostname)) {
  throw new Error("Reliability integration tests require an explicitly enabled local database");
}
after(async () => { await global.__dbPool?.end(); });

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
