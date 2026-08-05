/**
 * Professional review lifecycle (EngineerSphere's first slice, Phase 2):
 * requested → claimed → approved | changes_requested → (re-)requested.
 * One request per project. Ownership and assignment enforced in code and
 * SQL (L1); every transition is validated, never trusted from the client.
 */

import { randomUUID } from "crypto";

import type { AuthUser } from "./auth";
import type { Db } from "./db";

export type ReviewStatus = "requested" | "claimed" | "approved" | "changes_requested";

export interface ReviewRequest {
  id: string;
  projectId: string;
  ownerId: string;
  projectName: string;
  status: ReviewStatus;
  note: string | null;
  professionalId: string | null;
  professionalEmail: string | null;
  updatedAt: string;
}

function fromRow(row: Record<string, unknown>): ReviewRequest {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    ownerId: String(row.owner_id),
    projectName: String(row.project_name),
    status: String(row.status) as ReviewStatus,
    note: (row.note as string | null) ?? null,
    professionalId: (row.professional_id as string | null) ?? null,
    professionalEmail: (row.professional_email as string | null) ?? null,
    updatedAt: String(row.updated_at),
  };
}

export type ReviewResult = { ok: true; review: ReviewRequest } | { ok: false; error: string };

/** Owner requests review; re-requesting after an outcome reopens the same record. */
export async function requestReview(
  db: Db,
  owner: AuthUser,
  projectId: string,
  projectName: string,
): Promise<ReviewResult> {
  const now = new Date().toISOString();
  const existing = await db.query("select * from review_requests where project_id = $1", [projectId]);
  const row = existing.rows[0];
  if (row) {
    if (String(row.owner_id) !== owner.id) return { ok: false, error: "This project already has a review owned by another account." };
    if (row.status === "requested" || row.status === "claimed") return { ok: true, review: fromRow(row) };
    await db.query("update review_requests set status = $1, project_name = $2, updated_at = $3 where id = $4", [
      "requested",
      projectName,
      now,
      String(row.id),
    ]);
    const updated = await db.query("select * from review_requests where id = $1", [String(row.id)]);
    return { ok: true, review: fromRow(updated.rows[0]) };
  }

  const id = randomUUID();
  await db.query(
    "insert into review_requests (id, project_id, owner_id, project_name, status, note, professional_id, professional_email, created_at, updated_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)",
    [id, projectId, owner.id, projectName, "requested", null, null, null, now],
  );
  const created = await db.query("select * from review_requests where id = $1", [id]);
  return { ok: true, review: fromRow(created.rows[0]) };
}

export async function listReviewsForOwner(db: Db, ownerId: string): Promise<ReviewRequest[]> {
  const res = await db.query("select * from review_requests where owner_id = $1 order by updated_at desc", [ownerId]);
  return res.rows.map(fromRow);
}

/** The professional queue: everything not yet approved. */
export async function listOpenReviews(db: Db): Promise<ReviewRequest[]> {
  const res = await db.query(
    "select * from review_requests where status != $1 order by updated_at desc",
    ["approved"],
  );
  return res.rows.map(fromRow);
}

export type ReviewAction = "claim" | "approve" | "request_changes";

export async function actOnReview(
  db: Db,
  professional: AuthUser,
  reviewId: string,
  action: ReviewAction,
  note?: string,
): Promise<ReviewResult> {
  if (professional.role !== "professional") return { ok: false, error: "Professional access required." };
  const res = await db.query("select * from review_requests where id = $1", [reviewId]);
  const row = res.rows[0];
  if (!row) return { ok: false, error: "Review not found." };
  const review = fromRow(row);
  const now = new Date().toISOString();

  if (action === "claim") {
    if (review.professionalId && review.professionalId !== professional.id)
      return { ok: false, error: "Another professional already claimed this review." };
    if (review.status === "approved") return { ok: false, error: "This review is already approved." };
    await db.query(
      "update review_requests set status = $1, professional_id = $2, professional_email = $3, updated_at = $4 where id = $5",
      ["claimed", professional.id, professional.email, now, reviewId],
    );
  } else {
    if (review.professionalId !== professional.id)
      return { ok: false, error: "Only the claiming professional can act on this review." };
    if (review.status !== "claimed" && review.status !== "requested")
      return { ok: false, error: `Cannot ${action.replace("_", " ")} a review in status "${review.status}".` };
    const trimmed = (note ?? "").trim().slice(0, 2000);
    if (action === "request_changes" && !trimmed)
      return { ok: false, error: "Requesting changes needs a note telling the owner what to change." };
    await db.query("update review_requests set status = $1, note = $2, updated_at = $3 where id = $4", [
      action === "approve" ? "approved" : "changes_requested",
      trimmed || review.note,
      now,
      reviewId,
    ]);
  }

  const updated = await db.query("select * from review_requests where id = $1", [reviewId]);
  return { ok: true, review: fromRow(updated.rows[0]) };
}
