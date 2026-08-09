import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { tierInfo, WALKTHROUGH_SHOTS } from "../catalog/licenses";
import { createUser, type AuthUser } from "./auth";
import { ensureSchema, type Db } from "./db";
import {
  addCredits,
  consumeCredit,
  creditExhaustedMessage,
  getLicense,
  grantLicense,
  hasActiveLicense,
  LICENSE_REQUIRED_MESSAGE,
  listLicenses,
  reserveWalkthrough,
} from "./licenses";

async function testDb(): Promise<Db> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Db;
  await ensureSchema(pool);
  return pool;
}

let db: Db;
let user: AuthUser;
beforeEach(async () => {
  db = await testDb();
  const signup = await createUser(db, "owner@example.com", "hunter2hunter2");
  if (!signup.ok) throw new Error("signup failed");
  user = signup.user;
});

describe("project licenses (one home = one license)", () => {
  it("granting writes the tier's full allowance into the ledger", async () => {
    await grantLicense(db, { userId: user.id, projectId: "p1", tier: "concept", source: "stripe" });
    const license = await getLicense(db, user.id, "p1");
    expect(license?.tier).toBe("concept");
    expect(license?.status).toBe("active");
    expect(license?.expiresAt).toBeNull();
    expect(license?.remaining.premium_render).toBe(10);
    expect(license?.remaining.major_revision).toBe(2);
  });

  it("Build+ carries a 24-month access window; other tiers never expire", async () => {
    await grantLicense(db, { userId: user.id, projectId: "p1", tier: "buildplus", source: "stripe" });
    const license = await getLicense(db, user.id, "p1");
    expect(license?.expiresAt).not.toBeNull();
    const months = (new Date(license!.expiresAt!).getTime() - Date.now()) / (30.44 * 24 * 3600 * 1000);
    expect(months).toBeGreaterThan(23.5);
    expect(months).toBeLessThan(24.5);
  });

  it("consuming decrements exactly one credit and refuses at zero with the add-on pointer", async () => {
    await grantLicense(db, { userId: user.id, projectId: "p1", tier: "concept", source: "stripe" });
    for (let i = 9; i >= 0; i--) {
      const spend = await consumeCredit(db, user.id, "p1", "premium_render");
      expect(spend).toEqual({ ok: true, remaining: i });
    }
    const empty = await consumeCredit(db, user.id, "p1", "premium_render");
    expect(empty).toEqual({ ok: false, error: creditExhaustedMessage("premium_render") });
  });

  it("an unlicensed project cannot consume anything", async () => {
    const spend = await consumeCredit(db, user.id, "nope", "premium_render");
    expect(spend).toEqual({ ok: false, error: LICENSE_REQUIRED_MESSAGE });
    expect(await hasActiveLicense(db, user.id, "nope")).toBe(false);
  });

  it("add-on packs top up a kind without touching others", async () => {
    await grantLicense(db, { userId: user.id, projectId: "p1", tier: "concept", source: "stripe" });
    const license = await getLicense(db, user.id, "p1");
    await addCredits(db, license!.id, "premium_render", 25, "25 additional premium renders");
    const after = await getLicense(db, user.id, "p1");
    expect(after?.remaining.premium_render).toBe(35);
    expect(after?.remaining.major_revision).toBe(2);
  });

  it("upgrading grants only the allowance difference — spent credits stay spent", async () => {
    await grantLicense(db, { userId: user.id, projectId: "p1", tier: "concept", source: "stripe" });
    await consumeCredit(db, user.id, "p1", "premium_render");
    await grantLicense(db, { userId: user.id, projectId: "p1", tier: "complete", source: "stripe" });
    const license = await getLicense(db, user.id, "p1");
    expect(license?.tier).toBe("complete");
    // 10 included − 1 used + (60 − 10) upgrade difference = 59, never 69.
    expect(license?.remaining.premium_render).toBe(59);
    expect(license?.remaining.walkthrough).toBe(tierInfo("complete")!.allowances.walkthrough);
  });

  it("licenses are scoped to their owner", async () => {
    await grantLicense(db, { userId: user.id, projectId: "p1", tier: "design", source: "stripe" });
    const other = await createUser(db, "other@example.com", "hunter2hunter2");
    if (!other.ok) throw new Error("signup failed");
    expect(await getLicense(db, other.user.id, "p1")).toBeNull();
    expect(await consumeCredit(db, other.user.id, "p1", "premium_render")).toEqual({
      ok: false,
      error: LICENSE_REQUIRED_MESSAGE,
    });
    expect((await listLicenses(db, user.id)).map((l) => l.projectId)).toEqual(["p1"]);
  });
});

describe("walkthrough reservation (one credit buys a whole tour)", () => {
  it("spends one walkthrough and reserves a stop per shot", async () => {
    await grantLicense(db, { userId: user.id, projectId: "p1", tier: "design", source: "stripe" });
    const before = await getLicense(db, user.id, "p1");
    expect(before?.remaining.walkthrough).toBe(1);

    const reserved = await reserveWalkthrough(db, user.id, "p1");
    expect(reserved).toEqual({ ok: true, shots: WALKTHROUGH_SHOTS, remaining: 0 });

    const after = await getLicense(db, user.id, "p1");
    expect(after?.remaining.walkthrough).toBe(0);
    expect(after?.remaining.walkthrough_shot).toBe(WALKTHROUGH_SHOTS);
  });

  it("every stop draws down the reservation, never the walkthrough credit again", async () => {
    await grantLicense(db, { userId: user.id, projectId: "p1", tier: "design", source: "stripe" });
    await reserveWalkthrough(db, user.id, "p1");
    for (let i = WALKTHROUGH_SHOTS - 1; i >= 0; i--) {
      const shot = await consumeCredit(db, user.id, "p1", "walkthrough_shot");
      expect(shot).toEqual({ ok: true, remaining: i });
    }
    const after = await getLicense(db, user.id, "p1");
    expect(after?.remaining.walkthrough).toBe(0);
  });

  it("a spent reservation says to start a new tour, not to buy a pack that isn't sold", async () => {
    await grantLicense(db, { userId: user.id, projectId: "p1", tier: "design", source: "stripe" });
    await reserveWalkthrough(db, user.id, "p1");
    for (let i = 0; i < WALKTHROUGH_SHOTS; i++) await consumeCredit(db, user.id, "p1", "walkthrough_shot");

    const dry = await consumeCredit(db, user.id, "p1", "walkthrough_shot");
    expect(dry.ok).toBe(false);
    if (dry.ok) return;
    expect(dry.error).toContain("uses one walkthrough credit");
    expect(dry.error).not.toContain("Add-on");
  });

  it("a project with no walkthrough left cannot start a tour, and nothing is reserved", async () => {
    // Concept includes renders and revisions but no walkthrough at all.
    await grantLicense(db, { userId: user.id, projectId: "p1", tier: "concept", source: "stripe" });
    const denied = await reserveWalkthrough(db, user.id, "p1");
    expect(denied.ok).toBe(false);
    const after = await getLicense(db, user.id, "p1");
    expect(after?.remaining.walkthrough_shot ?? 0).toBe(0);
  });

  it("an unlicensed project cannot reserve", async () => {
    const denied = await reserveWalkthrough(db, user.id, "nope");
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.error).toBe(LICENSE_REQUIRED_MESSAGE);
  });
});
