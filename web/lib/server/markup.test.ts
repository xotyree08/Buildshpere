/**
 * The markup workspace, and the one decision in it that matters: an issue
 * raised against an older drawing is reported STALE rather than dragged onto
 * the new geometry. Carrying a pin forward is cheap and wrong — the
 * coordinates land on a different part of the building and the note ends up
 * libelling an innocent wall.
 */

import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureSchema, type Db } from "./db";
import {
  addIssue,
  deleteIssue,
  freshnessOf,
  listIssues,
  markupIsAdvisory,
  resolveIssue,
} from "./markup";
import { createOrg, setMember, setProjectOrg } from "./orgs";

let db: Db;
const NOW = new Date(1_700_000_000_000).toISOString();

async function user(id: string): Promise<string> {
  await db.query("insert into users (id, email, password_hash, created_at) values ($1,$2,$3,$4)", [
    id,
    `${id}@example.com`,
    "x",
    NOW,
  ]);
  return id;
}

async function project(id: string, ownerId: string): Promise<string> {
  await db.query(
    "insert into projects (id, owner_id, name, status, data, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$6)",
    [id, ownerId, id, "draft", JSON.stringify({ project: { id } }), NOW],
  );
  return id;
}

function pin(overrides: Partial<Parameters<typeof addIssue>[2]> = {}) {
  return {
    projectId: "p1",
    sheet: "plan" as const,
    version: 1,
    x: 12.5,
    y: 30,
    body: "This wall is too close to the property line.",
    ...overrides,
  };
}

beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  db = new Pool() as unknown as Db;
  await ensureSchema(db);
  await user("owner");
  await project("p1", "owner");
});

describe("pinning an issue to a drawing version", () => {
  it("is current while the design has not moved", async () => {
    const added = await addIssue(db, "owner", pin({ version: 3 }));
    expect(added.ok).toBe(true);
    const listed = await listIssues(db, "owner", "p1", 3);
    if (!listed.ok) throw new Error(listed.error);
    expect(listed.value[0].freshness).toBe("current");
  });

  it("goes stale when the design moves on, and is not repositioned", async () => {
    await addIssue(db, "owner", pin({ version: 3, x: 12.5, y: 30 }));
    const listed = await listIssues(db, "owner", "p1", 4);
    if (!listed.ok) throw new Error(listed.error);
    expect(listed.value[0].freshness).toBe("stale");
    // Still shown, still where it was put: a real thing somebody said about a
    // drawing that no longer exists.
    expect(listed.value[0].x).toBe(12.5);
    expect(listed.value[0].pinnedVersion).toBe(3);
  });

  it("freshness is computed, never stored", () => {
    // If it were a column, every revision would have to remember to update
    // every issue, and one that forgot would leave a stale note looking fine.
    expect(freshnessOf(2, 2)).toBe("current");
    expect(freshnessOf(2, 3)).toBe("stale");
    expect(freshnessOf(3, 2)).toBe("stale");
  });

  it("refuses a pin with no position or no version", async () => {
    expect(await addIssue(db, "owner", pin({ x: Number.NaN }))).toMatchObject({ ok: false });
    expect(await addIssue(db, "owner", pin({ version: -1 }))).toMatchObject({ ok: false });
    expect(await addIssue(db, "owner", pin({ version: 1.5 }))).toMatchObject({ ok: false });
  });

  it("refuses an empty note", async () => {
    expect(await addIssue(db, "owner", pin({ body: "   " }))).toMatchObject({ ok: false });
  });
});

describe("who may mark up", () => {
  it("a stranger cannot read or write", async () => {
    await user("stranger");
    expect(await addIssue(db, "stranger", pin())).toMatchObject({ ok: false });
    expect(await listIssues(db, "stranger", "p1", 1)).toMatchObject({ ok: false });
  });

  it("a colleague in the project's organization can", async () => {
    await user("colleague");
    const org = await createOrg(db, "owner", "Meridian");
    if (!org.ok) throw new Error(org.error);
    await setMember(db, "owner", org.value.id, "colleague", "member");
    await setProjectOrg(db, "owner", "p1", org.value.id);

    expect((await addIssue(db, "colleague", pin())).ok).toBe(true);
  });

  it("the professional who claimed the review can, without being a member", async () => {
    // This is the point of the feature: the reviewer is deliberately outside
    // the project, and still has to be able to point at things.
    await user("pro");
    await db.query(
      `insert into review_requests
         (id, project_id, owner_id, project_name, status, professional_id, invited, created_at, updated_at)
       values ($1,$2,$3,$4,'claimed',$5,'open',$6,$6)`,
      ["rev1", "p1", "owner", "p1", "pro", NOW],
    );
    expect((await addIssue(db, "pro", pin())).ok).toBe(true);
  });
});

describe("resolving and deleting", () => {
  it("resolves once, and records who did it", async () => {
    const added = await addIssue(db, "owner", pin());
    if (!added.ok) throw new Error(added.error);
    expect((await resolveIssue(db, "owner", added.value.id)).ok).toBe(true);
    expect(await resolveIssue(db, "owner", added.value.id)).toMatchObject({ ok: false });

    const listed = await listIssues(db, "owner", "p1", 1);
    if (!listed.ok) throw new Error(listed.error);
    expect(listed.value[0]).toMatchObject({ status: "resolved", resolvedBy: "owner" });
  });

  it("only the author may delete, and only while it is open", async () => {
    await user("colleague");
    const org = await createOrg(db, "owner", "Meridian");
    if (!org.ok) throw new Error(org.error);
    await setMember(db, "owner", org.value.id, "colleague", "member");
    await setProjectOrg(db, "owner", "p1", org.value.id);

    const added = await addIssue(db, "colleague", pin());
    if (!added.ok) throw new Error(added.error);
    expect(await deleteIssue(db, "owner", added.value.id)).toMatchObject({ ok: false });
    expect((await deleteIssue(db, "colleague", added.value.id)).ok).toBe(true);
  });

  it("a resolved issue stays on the record", async () => {
    const added = await addIssue(db, "owner", pin());
    if (!added.ok) throw new Error(added.error);
    await resolveIssue(db, "owner", added.value.id);
    expect(await deleteIssue(db, "owner", added.value.id)).toMatchObject({ ok: false });
  });

  it("acting on an issue that does not exist says so", async () => {
    expect(await resolveIssue(db, "owner", "nope")).toMatchObject({ ok: false });
    expect(await deleteIssue(db, "owner", "nope")).toMatchObject({ ok: false });
  });
});

describe("the seal boundary (BS-PRO-005)", () => {
  it("a markup carries no seal, and says so", () => {
    // Asserted rather than assumed: if someone adds a `sealed` column, this
    // fails and makes them say why.
    expect(markupIsAdvisory.sealed).toBe(false);
    expect(markupIsAdvisory.claim).toContain("no seal");
    expect(markupIsAdvisory.claim).toContain("review record");
  });

  it("no issue row can claim to be sealed", async () => {
    const added = await addIssue(db, "owner", pin());
    if (!added.ok) throw new Error(added.error);
    expect(Object.keys(added.value)).not.toContain("sealed");
    expect(Object.keys(added.value)).not.toContain("signature");
  });
});
