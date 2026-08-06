import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureSchema, type Db } from "./db";
import { isAdminEmail, listErrors, recordError, sanitizeReport } from "./errors";

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

describe("error reports (L3)", () => {
  it("sanitizes hostile input: clamps lengths, defaults unknown kinds, never throws", () => {
    expect(sanitizeReport(null)).toEqual({ kind: "window", message: "unknown", stack: null, url: null });
    expect(sanitizeReport({ kind: "boundary", message: "boom", stack: "at x", url: "/app" })).toEqual({
      kind: "boundary",
      message: "boom",
      stack: "at x",
      url: "/app",
    });
    const huge = sanitizeReport({ kind: "evil", message: "x".repeat(9000), stack: "y".repeat(9000), url: "z".repeat(900) });
    expect(huge.kind).toBe("window");
    expect(huge.message).toHaveLength(500);
    expect(huge.stack).toHaveLength(4000);
    expect(huge.url).toHaveLength(300);
  });

  it("records and lists newest-first with the user agent attached", async () => {
    await recordError(db, sanitizeReport({ kind: "window", message: "first" }), "TestBrowser/1.0");
    await recordError(db, sanitizeReport({ kind: "promise", message: "second", url: "/app/new" }), null);
    const list = await listErrors(db);
    expect(list).toHaveLength(2);
    expect(list.map((e) => e.message)).toContain("first");
    expect(list.map((e) => e.message)).toContain("second");
    expect(list.find((e) => e.message === "first")?.userAgent).toBe("TestBrowser/1.0");
    expect(list.find((e) => e.message === "second")?.url).toBe("/app/new");
  });

  it("admin allowlist: exact emails only, case-insensitive, empty means nobody", () => {
    const env = { ADMIN_EMAILS: "owner@example.com, Second@Example.com" };
    expect(isAdminEmail("owner@example.com", env)).toBe(true);
    expect(isAdminEmail("OWNER@EXAMPLE.COM", env)).toBe(true);
    expect(isAdminEmail("second@example.com", env)).toBe(true);
    expect(isAdminEmail("intruder@example.com", env)).toBe(false);
    expect(isAdminEmail("owner@example.com", {})).toBe(false);
    expect(isAdminEmail("owner@example.com", { ADMIN_EMAILS: "" })).toBe(false);
  });
});
