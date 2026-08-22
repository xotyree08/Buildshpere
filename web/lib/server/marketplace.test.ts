/**
 * The marketplace has two properties worth defending in tests, both of them
 * about what a participant is allowed to know:
 *
 *   - The directory never implies a verification nobody performed.
 *   - Proposals are sealed. A professional sees their own bid and no other.
 *
 * The rest — awarding, withdrawing, cancelling — is ordinary state, but it is
 * state about money, so the transitions are pinned too.
 */

import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureSchema, type Db } from "./db";
import {
  acceptProposal,
  cancelRequest,
  DIRECTORY_DISCLAIMER,
  listOpenRequests,
  listProposals,
  openRequest,
  searchProfessionals,
  setListed,
  submitProposal,
  withdrawProposal,
} from "./marketplace";

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

async function pro(id: string, discipline: string, state = "CA", name = id): Promise<string> {
  await user(id);
  await db.query(
    `insert into professional_profiles
       (user_id, full_name, discipline, license_number, license_state, status, submitted_at, listed)
     values ($1,$2,$3,$4,$5,'self_reported',$6,false)`,
    [id, name, discipline, "LIC-123", state, NOW],
  );
  return id;
}

async function project(id: string, ownerId: string): Promise<string> {
  await db.query(
    "insert into projects (id, owner_id, name, status, data, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$6)",
    [id, ownerId, id, "draft", JSON.stringify({ project: { id } }), NOW],
  );
  return id;
}

beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  db = new Pool() as unknown as Db;
  await ensureSchema(db);
  await user("owner");
  await project("p1", "owner");
});

describe("the directory", () => {
  it("lists nobody until they opt in", async () => {
    // A professional who joined through a directed invite to review one
    // project did not ask to appear in a public directory.
    await pro("arch", "architect");
    expect(await searchProfessionals(db)).toHaveLength(0);
    expect((await setListed(db, "arch", true)).ok).toBe(true);
    expect(await searchProfessionals(db)).toHaveLength(1);
  });

  it("carries the self-reported disclaimer on every single result", async () => {
    // So a caller cannot render a list that reads like a vetted panel.
    await pro("arch", "architect");
    await pro("eng", "engineer");
    await setListed(db, "arch", true);
    await setListed(db, "eng", true);

    const found = await searchProfessionals(db);
    expect(found).toHaveLength(2);
    for (const entry of found) {
      expect(entry.disclaimer).toBe(DIRECTORY_DISCLAIMER);
      expect(entry.status).toBe("self_reported");
    }
    expect(DIRECTORY_DISCLAIMER).toContain("not verified");
  });

  it("filters by discipline, state and name", async () => {
    await pro("arch", "architect", "CA", "Ada Lovelace");
    await pro("eng", "engineer", "NY", "Grace Hopper");
    await setListed(db, "arch", true);
    await setListed(db, "eng", true);

    expect(await searchProfessionals(db, { discipline: "architect" })).toHaveLength(1);
    expect(await searchProfessionals(db, { state: "ny" })).toHaveLength(1);
    expect(await searchProfessionals(db, { query: "grace" })).toHaveLength(1);
    expect(await searchProfessionals(db, { discipline: "architect", state: "NY" })).toHaveLength(0);
  });

  it("opting out takes you back off it", async () => {
    await pro("arch", "architect");
    await setListed(db, "arch", true);
    await setListed(db, "arch", false);
    expect(await searchProfessionals(db)).toHaveLength(0);
  });

  it("cannot be joined without a profile", async () => {
    await user("nobody");
    expect(await setListed(db, "nobody", true)).toMatchObject({ ok: false });
  });
});

describe("asking for quotes", () => {
  beforeEach(async () => {
    await pro("arch1", "architect");
    await pro("arch2", "architect");
    await pro("eng", "engineer");
    await setListed(db, "arch1", true);
    await setListed(db, "arch2", true);
    await setListed(db, "eng", true);
  });

  const scope = { projectId: "p1", discipline: "architect", scope: "Stamp the structural plan." };

  it("only the project's owner may open one", async () => {
    expect(await openRequest(db, "arch1", scope)).toMatchObject({ ok: false });
    expect((await openRequest(db, "owner", scope)).ok).toBe(true);
  });

  it("refuses a second open request for the same discipline", async () => {
    await openRequest(db, "owner", scope);
    expect(await openRequest(db, "owner", scope)).toMatchObject({ ok: false });
  });

  it("reaches listed professionals in that discipline, and no others", async () => {
    await openRequest(db, "owner", scope);
    expect(await listOpenRequests(db, "arch1")).toHaveLength(1);
    expect(await listOpenRequests(db, "eng")).toHaveLength(0);

    await setListed(db, "arch2", false);
    expect(await listOpenRequests(db, "arch2")).toHaveLength(0);
  });
});

describe("proposals are sealed", () => {
  let requestId: string;

  beforeEach(async () => {
    await pro("arch1", "architect");
    await pro("arch2", "architect");
    await setListed(db, "arch1", true);
    await setListed(db, "arch2", true);
    const opened = await openRequest(db, "owner", {
      projectId: "p1",
      discipline: "architect",
      scope: "Stamp the structural plan.",
    });
    if (!opened.ok) throw new Error(opened.error);
    requestId = opened.value.id;
    await submitProposal(db, "arch1", { requestId, feeCents: 250_000, timelineDays: 14, note: "Two weeks." });
    await submitProposal(db, "arch2", { requestId, feeCents: 180_000, timelineDays: 21, note: "Three." });
  });

  it("the owner sees every bid, cheapest first", async () => {
    const seen = await listProposals(db, "owner", requestId);
    if (!seen.ok) throw new Error(seen.error);
    expect(seen.value).toHaveLength(2);
    expect(seen.value[0].feeCents).toBe(180_000);
  });

  it("a professional sees only their own", async () => {
    // An open book turns a quote into an auction and the low bid into a race.
    const seen = await listProposals(db, "arch1", requestId);
    if (!seen.ok) throw new Error(seen.error);
    expect(seen.value).toHaveLength(1);
    expect(seen.value[0].professionalId).toBe("arch1");
  });

  it("a stranger sees nothing", async () => {
    await user("nosy");
    const seen = await listProposals(db, "nosy", requestId);
    if (!seen.ok) throw new Error(seen.error);
    expect(seen.value).toHaveLength(0);
  });

  it("re-proposing replaces your own bid rather than adding one", async () => {
    await submitProposal(db, "arch1", { requestId, feeCents: 200_000, timelineDays: 10, note: "Revised." });
    const seen = await listProposals(db, "owner", requestId);
    if (!seen.ok) throw new Error(seen.error);
    expect(seen.value).toHaveLength(2);
    expect(seen.value.find((p) => p.professionalId === "arch1")?.feeCents).toBe(200_000);
  });

  it("refuses a bid from someone unlisted, or in the wrong discipline", async () => {
    await pro("eng", "engineer");
    await setListed(db, "eng", true);
    expect(await submitProposal(db, "eng", { requestId, feeCents: 1, timelineDays: 1, note: "" })).toMatchObject({ ok: false });

    await setListed(db, "arch2", false);
    expect(
      await submitProposal(db, "arch2", { requestId, feeCents: 1000, timelineDays: 1, note: "" }),
    ).toMatchObject({ ok: false });
  });

  it("refuses a nonsense fee or timeline", async () => {
    expect(await submitProposal(db, "arch1", { requestId, feeCents: 0, timelineDays: 5, note: "" })).toMatchObject({ ok: false });
    expect(await submitProposal(db, "arch1", { requestId, feeCents: 100, timelineDays: 0, note: "" })).toMatchObject({ ok: false });
  });
});

describe("awarding", () => {
  let requestId: string;
  let cheap: string;

  beforeEach(async () => {
    await pro("arch1", "architect");
    await pro("arch2", "architect");
    await setListed(db, "arch1", true);
    await setListed(db, "arch2", true);
    const opened = await openRequest(db, "owner", {
      projectId: "p1",
      discipline: "architect",
      scope: "Stamp it.",
    });
    if (!opened.ok) throw new Error(opened.error);
    requestId = opened.value.id;
    await submitProposal(db, "arch1", { requestId, feeCents: 250_000, timelineDays: 14, note: "" });
    const second = await submitProposal(db, "arch2", { requestId, feeCents: 180_000, timelineDays: 21, note: "" });
    if (!second.ok) throw new Error(second.error);
    cheap = second.value.id;
  });

  it("accepting one declines the rest and closes the request", async () => {
    expect((await acceptProposal(db, "owner", cheap)).ok).toBe(true);
    const seen = await listProposals(db, "owner", requestId);
    if (!seen.ok) throw new Error(seen.error);
    expect(seen.value.find((p) => p.id === cheap)?.status).toBe("accepted");
    expect(seen.value.filter((p) => p.status === "declined")).toHaveLength(1);
    // And nobody can bid on it afterwards.
    expect(
      await submitProposal(db, "arch1", { requestId, feeCents: 1000, timelineDays: 1, note: "" }),
    ).toMatchObject({ ok: false });
  });

  it("only the owner may accept", async () => {
    expect(await acceptProposal(db, "arch1", cheap)).toMatchObject({ ok: false });
    expect(await acceptProposal(db, "arch2", cheap)).toMatchObject({ ok: false });
  });

  it("cannot be awarded twice", async () => {
    await acceptProposal(db, "owner", cheap);
    expect(await acceptProposal(db, "owner", cheap)).toMatchObject({ ok: false });
  });

  it("a professional may withdraw their own while it is open", async () => {
    expect(await withdrawProposal(db, "arch1", cheap)).toMatchObject({ ok: false });
    expect((await withdrawProposal(db, "arch2", cheap)).ok).toBe(true);
    expect(await acceptProposal(db, "owner", cheap)).toMatchObject({ ok: false });
  });

  it("cancelling declines everything outstanding", async () => {
    expect((await cancelRequest(db, "owner", requestId)).ok).toBe(true);
    const seen = await listProposals(db, "owner", requestId);
    if (!seen.ok) throw new Error(seen.error);
    expect(seen.value.every((p) => p.status === "declined")).toBe(true);
    expect(await cancelRequest(db, "owner", requestId)).toMatchObject({ ok: false });
  });
});
