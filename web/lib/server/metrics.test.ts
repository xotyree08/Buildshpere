import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureSchema, type Db } from "./db";
import { dayOf, listMetrics, normalizePath, recordHit } from "./metrics";

async function testDb(): Promise<Db> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Db;
  await ensureSchema(pool);
  return pool;
}

let db: Db;
beforeEach(async () => {
  db = await testDb();
});

describe("cookieless metrics", () => {
  it("normalizes paths: buckets project ids, drops admin and unknown paths", () => {
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/sample")).toBe("/sample");
    expect(normalizePath("/app/project/abc-123")).toBe("/app/project");
    expect(normalizePath("/app/project/abc-123/bids")).toBe("/app/project");
    expect(normalizePath("/share/tok123")).toBe("/app/project");
    expect(normalizePath("/app/admin/errors")).toBeNull();
    expect(normalizePath("/wp-admin.php")).toBeNull();
    expect(normalizePath(42)).toBeNull();
    expect(normalizePath("x".repeat(300))).toBeNull();
  });

  it("increments one counter per day+path, never storing anything else", async () => {
    await recordHit(db, "/", "2026-08-06");
    await recordHit(db, "/", "2026-08-06");
    await recordHit(db, "/sample", "2026-08-06");
    await recordHit(db, "/", "2026-08-07");
    const rows = await listMetrics(db, "2026-08-01");
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.day === "2026-08-06" && r.path === "/")?.hits).toBe(2);
    expect(rows.find((r) => r.path === "/sample")?.hits).toBe(1);
    // The row shape IS the privacy promise: day, path, hits — nothing more.
    expect(Object.keys(rows[0]).sort()).toEqual(["day", "hits", "path"]);
  });

  it("since-day filter cuts old rows; dayOf buckets by UTC date", async () => {
    await recordHit(db, "/", "2026-07-01");
    await recordHit(db, "/", "2026-08-06");
    expect(await listMetrics(db, "2026-08-01")).toHaveLength(1);
    expect(dayOf(new Date("2026-08-06T23:59:59Z"))).toBe("2026-08-06");
    expect(dayOf(new Date("2026-08-06T00:00:00Z"))).toBe("2026-08-06");
  });
});
