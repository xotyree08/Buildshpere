import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { createUser, setRole, type AuthUser } from "./auth";
import { ensureSchema, type Db } from "./db";
import { actOnReview, listOpenReviews, listReviewsForOwner, requestReview } from "./reviews";

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
let otherPro: AuthUser;

beforeEach(async () => {
  db = await testDb();
  const o = await createUser(db, "owner@x.co", "hunter2hunter2");
  const p = await createUser(db, "pro@x.co", "hunter2hunter2");
  const q = await createUser(db, "pro2@x.co", "hunter2hunter2");
  if (!o.ok || !p.ok || !q.ok) throw new Error("setup failed");
  owner = o.user;
  await setRole(db, p.user.id, "professional");
  await setRole(db, q.user.id, "professional");
  pro = { ...p.user, role: "professional" };
  otherPro = { ...q.user, role: "professional" };
});

describe("review lifecycle", () => {
  it("request → claim → request_changes → re-request → approve", async () => {
    const created = await requestReview(db, owner, "p1", "Dream Home");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.review.status).toBe("requested");

    const claimed = await actOnReview(db, pro, created.review.id, "claim");
    expect(claimed.ok && claimed.review.status === "claimed").toBe(true);

    const changes = await actOnReview(db, pro, created.review.id, "request_changes", "Widen the hall.");
    expect(changes.ok && changes.review.status === "changes_requested").toBe(true);
    if (changes.ok) expect(changes.review.note).toBe("Widen the hall.");

    const reopened = await requestReview(db, owner, "p1", "Dream Home");
    expect(reopened.ok && reopened.review.status === "requested").toBe(true);
    if (reopened.ok) expect(reopened.review.id).toBe(created.review.id); // same record reopens

    const approved = await actOnReview(db, pro, created.review.id, "approve", "Looks good now.");
    expect(approved.ok && approved.review.status === "approved").toBe(true);
  });

  it("requesting twice while open returns the same review, not a duplicate", async () => {
    const a = await requestReview(db, owner, "p1", "Home");
    const b = await requestReview(db, owner, "p1", "Home");
    expect(a.ok && b.ok && a.review.id === b.review.id).toBe(true);
    expect(await listReviewsForOwner(db, owner.id)).toHaveLength(1);
  });

  it("request_changes without a note is refused", async () => {
    const created = await requestReview(db, owner, "p1", "Home");
    if (!created.ok) throw new Error("setup");
    await actOnReview(db, pro, created.review.id, "claim");
    const result = await actOnReview(db, pro, created.review.id, "request_changes", "   ");
    expect(result.ok).toBe(false);
  });
});

describe("review authorization", () => {
  it("homeowners cannot act; only the claiming professional can conclude", async () => {
    const created = await requestReview(db, owner, "p1", "Home");
    if (!created.ok) throw new Error("setup");

    const ownerActs = await actOnReview(db, { ...owner, role: "homeowner" }, created.review.id, "claim");
    expect(ownerActs.ok).toBe(false);

    await actOnReview(db, pro, created.review.id, "claim");
    const rival = await actOnReview(db, otherPro, created.review.id, "approve", "mine now");
    expect(rival.ok).toBe(false);
    const rivalClaim = await actOnReview(db, otherPro, created.review.id, "claim");
    expect(rivalClaim.ok).toBe(false);
  });

  it("owner listings are isolated; the pro queue excludes approved work", async () => {
    const created = await requestReview(db, owner, "p1", "Home");
    if (!created.ok) throw new Error("setup");
    expect(await listReviewsForOwner(db, pro.id)).toHaveLength(0);

    expect(await listOpenReviews(db)).toHaveLength(1);
    await actOnReview(db, pro, created.review.id, "claim");
    await actOnReview(db, pro, created.review.id, "approve", "done");
    expect(await listOpenReviews(db)).toHaveLength(0);
    expect((await listReviewsForOwner(db, owner.id))[0].status).toBe("approved");
  });
});

describe("role migration", () => {
  it("new users default to homeowner; setRole upgrades", async () => {
    const res = await db.query("select role from users where email = $1", ["owner@x.co"]);
    expect(String(res.rows[0].role)).toBe("homeowner");
    const pro2 = await db.query("select role from users where email = $1", ["pro@x.co"]);
    expect(String(pro2.rows[0].role)).toBe("professional");
  });
});
