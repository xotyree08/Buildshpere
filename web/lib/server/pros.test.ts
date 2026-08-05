import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { createUser, getSessionUser, createSession } from "./auth";
import { ensureSchema, type Db } from "./db";
import { acceptReviewInvite, createReviewInvite, getProfile, saveProfile } from "./pros";
import { actOnReview, listOpenReviews, listReviewsForOwner, requestReview } from "./reviews";
import type { AuthUser } from "./auth";

async function testDb(): Promise<Db> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Db;
  await ensureSchema(pool);
  return pool;
}

let db: Db;
let owner: AuthUser;
let pro: AuthUser;
beforeEach(async () => {
  db = await testDb();
  const o = await createUser(db, "owner@example.com", "hunter2hunter2");
  const p = await createUser(db, "architect@example.com", "hunter2hunter2");
  if (!o.ok || !p.ok) throw new Error("signup failed");
  owner = o.user;
  pro = p.user;
});

describe("directed professional invites", () => {
  it("invite → accept: role granted, review claimed, invite single-use, token hashed", async () => {
    const created = await createReviewInvite(db, owner, "p1", "Craftsman Dream");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const raw = await db.query("select token_hash from review_invites");
    expect(raw.rows[0].token_hash).not.toBe(created.token);

    const accepted = await acceptReviewInvite(db, pro, created.token);
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.review.status).toBe("claimed");
      expect(accepted.review.professionalId).toBe(pro.id);
    }

    // Role was granted by the invitation, not an access code.
    const session = await createSession(db, pro.id);
    expect((await getSessionUser(db, session))?.role).toBe("professional");

    // Single-use: a second acceptor is refused.
    const other = await createUser(db, "other@example.com", "hunter2hunter2");
    if (!other.ok) throw new Error("signup failed");
    const second = await acceptReviewInvite(db, other.user, created.token);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toContain("already used");
  });

  it("directed reviews never appear in the open queue; open ones still do", async () => {
    await createReviewInvite(db, owner, "p-directed", "Private Home");
    const other = await createUser(db, "second-owner@example.com", "hunter2hunter2");
    if (!other.ok) throw new Error("signup failed");
    await requestReview(db, other.user, "p-open", "Open Home");

    const queue = await listOpenReviews(db);
    expect(queue.map((r) => r.projectId)).toEqual(["p-open"]);

    // …but the invited professional sees their directed review once they hold it.
    const invite = await createReviewInvite(db, owner, "p-directed", "Private Home");
    if (!invite.ok) throw new Error("invite failed");
    await acceptReviewInvite(db, pro, invite.token);
    const proQueue = await listOpenReviews(db, pro.id);
    expect(proQueue.map((r) => r.projectId).sort()).toEqual(["p-directed", "p-open"]);
  });

  it("the owner cannot accept their own invite; garbage tokens are refused", async () => {
    const created = await createReviewInvite(db, owner, "p1", "Home");
    if (!created.ok) throw new Error("invite failed");
    const self = await acceptReviewInvite(db, owner, created.token);
    expect(self.ok).toBe(false);
    expect((await acceptReviewInvite(db, pro, "nope")).ok).toBe(false);
    expect((await acceptReviewInvite(db, pro, "0".repeat(64))).ok).toBe(false);
  });
});

describe("professional profiles — credentials before authority", () => {
  it("validates shape and stores as self-reported, never verified", async () => {
    expect((await saveProfile(db, pro.id, { fullName: "A", discipline: "architect", licenseNumber: "TX123", licenseState: "TX" })).ok).toBe(false);
    expect((await saveProfile(db, pro.id, { fullName: "Ada Architect", discipline: "wizard", licenseNumber: "TX123", licenseState: "TX" })).ok).toBe(false);
    expect((await saveProfile(db, pro.id, { fullName: "Ada Architect", discipline: "architect", licenseNumber: "!!", licenseState: "TX" })).ok).toBe(false);
    expect((await saveProfile(db, pro.id, { fullName: "Ada Architect", discipline: "architect", licenseNumber: "TX123", licenseState: "Texas" })).ok).toBe(false);

    const saved = await saveProfile(db, pro.id, {
      fullName: "Ada Architect",
      discipline: "architect",
      licenseNumber: "tx-12345",
      licenseState: "tx",
    });
    expect(saved.ok).toBe(true);
    const profile = await getProfile(db, pro.id);
    expect(profile?.licenseNumber).toBe("TX-12345");
    expect(profile?.licenseState).toBe("TX");
    expect(profile?.status).toBe("self_reported");
  });

  it("an approval surfaces the reviewer's credentials on the owner's review", async () => {
    const invite = await createReviewInvite(db, owner, "p1", "Craftsman Dream");
    if (!invite.ok) throw new Error("invite failed");
    const accepted = await acceptReviewInvite(db, pro, invite.token);
    if (!accepted.ok) throw new Error("accept failed");
    await saveProfile(db, pro.id, {
      fullName: "Ada Architect",
      discipline: "architect",
      licenseNumber: "TX-12345",
      licenseState: "TX",
    });

    const proUser: AuthUser = { ...pro, role: "professional" };
    const result = await actOnReview(db, proUser, accepted.review.id, "approve", "Solid plan.");
    expect(result.ok).toBe(true);

    const owned = await listReviewsForOwner(db, owner.id);
    expect(owned[0].status).toBe("approved");
    expect(owned[0].professional).toEqual({
      fullName: "Ada Architect",
      discipline: "architect",
      licenseNumber: "TX-12345",
      licenseState: "TX",
      credentialStatus: "self_reported",
    });
  });
});
