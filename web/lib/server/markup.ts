/**
 * Markup workspace (BS-PRO-003/004/005): comments pinned to a point on a
 * drawing, at the version the drawing was when someone pointed at it.
 *
 * The version is the whole difficulty. A note that says "this wall is too
 * close to the property line" means nothing without the drawing it was drawn
 * on, and a plan that has been re-packed since may not have that wall any
 * more. Two ways to handle it:
 *
 *   - Carry the pin forward onto the new geometry. Cheap, and wrong: the pin
 *     lands wherever those coordinates now happen to fall, which is a
 *     different part of the building, and the note now libels an innocent
 *     wall.
 *   - Record the version, and report an issue raised against an older one as
 *     STALE rather than moving it.
 *
 * This does the second. A stale issue is still shown — it is a real thing
 * somebody said — but it is shown as pointing at a drawing that no longer
 * exists, which is the truth.
 *
 * BS-PRO-005, the seal boundary: nothing here is a seal. A markup is one
 * person's advice on a drawing. The only place a credential attaches to this
 * project is the review record, and `markupIsAdvisory` exists so that claim is
 * asserted in a test rather than assumed by whoever reads the table next.
 */

import type { Db } from "./db";
import { canAccessProject } from "./orgs";

export type IssueStatus = "open" | "resolved";

/** Which drawing a pin sits on. Named, not numbered — sheets get reordered. */
export type Sheet =
  | "plan"
  | "elevation_front"
  | "elevation_side"
  | "site"
  | "electrical"
  | "plumbing";

export const SHEETS: Sheet[] = [
  "plan",
  "elevation_front",
  "elevation_side",
  "site",
  "electrical",
  "plumbing",
];

export function isSheet(value: unknown): value is Sheet {
  return typeof value === "string" && (SHEETS as string[]).includes(value);
}

export interface MarkupIssue {
  id: string;
  projectId: string;
  sheet: Sheet;
  /** The design version this pin was placed against. */
  pinnedVersion: number;
  /** Drawing coordinates, in feet, in that sheet's own space. */
  x: number;
  y: number;
  body: string;
  authorId: string;
  status: IssueStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

/** An issue, plus whether the drawing it points at is still the current one. */
export interface PinnedIssue extends MarkupIssue {
  freshness: "current" | "stale";
}

export type MarkupResult<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_BODY = 2000;

/**
 * Whether an issue still points at the drawing it was raised on.
 *
 * Deliberately not a boolean on the row: freshness is a relationship between
 * the issue and the design as it is *now*, so storing it would mean every
 * revision had to remember to go and update every issue, and one that forgot
 * would leave a stale note looking current.
 */
export function freshnessOf(pinnedVersion: number, currentVersion: number): "current" | "stale" {
  return pinnedVersion === currentVersion ? "current" : "stale";
}

/**
 * BS-PRO-005. A markup is advice, never a seal.
 *
 * Asserted rather than assumed: if someone later adds a `sealed` column here,
 * the test that reads this will fail and make them say why.
 */
export const markupIsAdvisory = {
  sealed: false,
  claim:
    "A markup is one person's comment on a drawing. It carries no seal, no signature and no professional certification. The review record is the only place a credential attaches to this project.",
} as const;

/** Who may read or write markup: anyone who can reach the project. */
async function mayMarkup(db: Db, userId: string, projectId: string): Promise<boolean> {
  if (await canAccessProject(db, userId, projectId)) return true;
  // The professional who claimed the review, who is the point of the feature
  // and is deliberately not a project member.
  const claimed = await db.query(
    "select 1 from review_requests where project_id = $1 and professional_id = $2 limit 1",
    [projectId, userId],
  );
  return claimed.rows.length > 0;
}

export async function addIssue(
  db: Db,
  authorId: string,
  input: { projectId: string; sheet: Sheet; version: number; x: number; y: number; body: string },
): Promise<MarkupResult<MarkupIssue>> {
  if (!(await mayMarkup(db, authorId, input.projectId))) {
    return { ok: false, error: "You do not have access to that project." };
  }
  const body = input.body.trim();
  if (body.length === 0) return { ok: false, error: "An issue needs something written in it." };
  if (body.length > MAX_BODY) return { ok: false, error: `Keep it under ${MAX_BODY} characters.` };
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    return { ok: false, error: "A pin needs a position on the drawing." };
  }
  if (!Number.isInteger(input.version) || input.version < 0) {
    return { ok: false, error: "A pin needs the design version it was placed against." };
  }

  const id = `iss_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  await db.query(
    `insert into markup_issues
       (id, project_id, sheet, pinned_version, x, y, body, author_id, status, created_at, resolved_at, resolved_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,null,null)`,
    [id, input.projectId, input.sheet, input.version, input.x, input.y, body, authorId, now],
  );
  return {
    ok: true,
    value: {
      id,
      projectId: input.projectId,
      sheet: input.sheet,
      pinnedVersion: input.version,
      x: input.x,
      y: input.y,
      body,
      authorId,
      status: "open",
      createdAt: now,
      resolvedAt: null,
      resolvedBy: null,
    },
  };
}

function toIssue(row: Record<string, unknown>): MarkupIssue {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    sheet: (isSheet(row.sheet) ? row.sheet : "plan") as Sheet,
    pinnedVersion: Number(row.pinned_version),
    x: Number(row.x),
    y: Number(row.y),
    body: String(row.body),
    authorId: String(row.author_id),
    status: row.status === "resolved" ? "resolved" : "open",
    createdAt: String(row.created_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    resolvedBy: row.resolved_by ? String(row.resolved_by) : null,
  };
}

export async function listIssues(
  db: Db,
  userId: string,
  projectId: string,
  currentVersion: number,
): Promise<MarkupResult<PinnedIssue[]>> {
  if (!(await mayMarkup(db, userId, projectId))) {
    return { ok: false, error: "You do not have access to that project." };
  }
  const res = await db.query(
    "select * from markup_issues where project_id = $1 order by created_at",
    [projectId],
  );
  return {
    ok: true,
    value: res.rows.map((row) => {
      const issue = toIssue(row);
      return { ...issue, freshness: freshnessOf(issue.pinnedVersion, currentVersion) };
    }),
  };
}

export async function resolveIssue(
  db: Db,
  userId: string,
  issueId: string,
): Promise<MarkupResult<null>> {
  const res = await db.query("select project_id, status from markup_issues where id = $1", [issueId]);
  const row = res.rows[0];
  if (!row) return { ok: false, error: "No such issue." };
  if (!(await mayMarkup(db, userId, String(row.project_id)))) {
    return { ok: false, error: "You do not have access to that project." };
  }
  if (row.status === "resolved") return { ok: false, error: "That issue is already resolved." };

  await db.query("update markup_issues set status = 'resolved', resolved_at = $1, resolved_by = $2 where id = $3", [
    new Date().toISOString(),
    userId,
    issueId,
  ]);
  return { ok: true, value: null };
}

/**
 * Delete an issue.
 *
 * Only its author, and only while it is open: once someone has resolved a
 * note, the record that it was raised and dealt with is worth keeping.
 */
export async function deleteIssue(
  db: Db,
  userId: string,
  issueId: string,
): Promise<MarkupResult<null>> {
  const res = await db.query("select author_id, status from markup_issues where id = $1", [issueId]);
  const row = res.rows[0];
  if (!row) return { ok: false, error: "No such issue." };
  if (String(row.author_id) !== userId) return { ok: false, error: "Only the author can delete an issue." };
  if (row.status === "resolved") return { ok: false, error: "A resolved issue stays on the record." };

  await db.query("delete from markup_issues where id = $1", [issueId]);
  return { ok: true, value: null };
}
