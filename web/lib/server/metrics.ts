/**
 * Usage metrics with the privacy promise kept: one counter per page path
 * per UTC day. No cookies, no IP addresses, no user agents, no
 * identifiers of any kind — a row literally cannot describe a person.
 * The privacy policy names this exact shape.
 */

import type { Db } from "./db";

/** Paths worth counting; everything else collapses or drops. */
const KNOWN_PATHS = [
  "/",
  "/sample",
  "/faq",
  "/privacy",
  "/terms",
  "/pro",
  "/reset",
  "/app",
  "/app/new",
  "/app/account",
  "/app/project",
] as const;

/**
 * Collapse a raw pathname to a countable bucket: project subpages all
 * count as /app/project (ids are never stored), unknown paths return
 * null and are not recorded.
 */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 200) return null;
  const path = raw.split("?")[0].replace(/\/+$/, "") || "/";
  if (path.startsWith("/app/project/")) return "/app/project";
  if (path.startsWith("/app/admin")) return null; // admins aren't traffic
  if (path.startsWith("/share/")) return "/app/project";
  return (KNOWN_PATHS as readonly string[]).includes(path) ? path : null;
}

/** UTC day bucket, e.g. "2026-08-06". */
export function dayOf(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function recordHit(db: Db, path: string, day = dayOf()): Promise<void> {
  await db.query(
    `insert into metrics_daily (day, path, hits) values ($1, $2, 1)
     on conflict (day, path) do update set hits = metrics_daily.hits + 1`,
    [day, path],
  );
}

export interface MetricRow {
  day: string;
  path: string;
  hits: number;
}

export async function listMetrics(db: Db, sinceDay: string): Promise<MetricRow[]> {
  const res = await db.query(
    "select day, path, hits from metrics_daily where day >= $1 order by day desc, hits desc",
    [sinceDay],
  );
  return res.rows.map((r) => ({ day: String(r.day), path: String(r.path), hits: Number(r.hits) }));
}
