import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { createUser, type AuthUser } from "./auth";
import { ensureSchema, type Db } from "./db";
import { listNotifications, markAllRead, notify, unreadCount } from "./notifications";

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
  const signup = await createUser(db, "notified@example.com", "hunter2hunter2");
  if (!signup.ok) throw new Error("signup failed");
  user = signup.user;
});

describe("notification center (§14)", () => {
  it("notifies, counts unread, and marks all read idempotently", async () => {
    await notify(db, user.id, "review.approve", "Your plan was approved.", "p1");
    await notify(db, user.id, "review.claim", "A pro claimed your review.");
    expect(await unreadCount(db, user.id)).toBe(2);

    const list = await listNotifications(db, user.id);
    expect(list).toHaveLength(2);
    expect(list.every((n) => n.readAt === null)).toBe(true);
    expect(list.find((n) => n.kind === "review.approve")?.projectId).toBe("p1");

    await markAllRead(db, user.id);
    await markAllRead(db, user.id); // idempotent
    expect(await unreadCount(db, user.id)).toBe(0);
    expect((await listNotifications(db, user.id)).every((n) => n.readAt !== null)).toBe(true);
  });

  it("one user's notifications never appear in another's list", async () => {
    const other = await createUser(db, "other@example.com", "hunter2hunter2");
    if (!other.ok) throw new Error("signup failed");
    await notify(db, other.user.id, "review.approve", "Someone else's news.");
    expect(await listNotifications(db, user.id)).toEqual([]);
    expect(await unreadCount(db, user.id)).toBe(0);
  });
});
