/**
 * Professional onboarding (EngineerSphere, BS-PRO-001/002 first slice):
 * a homeowner invites THEIR OWN architect/designer with a single-use
 * capability link. Accepting grants the professional role and binds the
 * project's review to that professional — directed reviews never appear
 * in the open marketplace queue.
 *
 * Credentials are captured, validated for shape, and stored as
 * SELF-REPORTED. There is no licensing-board integration yet, so nothing
 * here claims automated verification (L8) — approvals record the
 * credentials as entered, clearly labeled. And per spec BS-PRO-005 the
 * platform never applies a professional's seal: an approval is a review
 * record, not a stamp.
 */

import { createHash, randomBytes } from "crypto";

import type { AuthUser } from "./auth";
import { setRole } from "./auth";
import type { Db } from "./db";
import { requestReview, type ReviewRequest } from "./reviews";

function tokenHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

export const DISCIPLINES = ["architect", "engineer", "designer", "surveyor"] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export interface ProfessionalProfile {
  userId: string;
  fullName: string;
  discipline: Discipline;
  licenseNumber: string;
  licenseState: string;
  /** 'self_reported' today; 'verified' arrives with licensing-board data. */
  status: string;
  submittedAt: string;
}

export type InviteCreateResult = { ok: true; token: string } | { ok: false; error: string };

/** Mint (or rotate) the single-use invite for a project's review. */
export async function createReviewInvite(
  db: Db,
  owner: AuthUser,
  projectId: string,
  projectName: string,
): Promise<InviteCreateResult> {
  const review = await requestReview(db, owner, projectId, projectName);
  if (!review.ok) return review;
  // Directed reviews leave the open queue immediately.
  await db.query("update review_requests set invited = 'directed' where id = $1", [review.review.id]);
  await db.query("delete from review_invites where review_id = $1 and used_by is null", [
    review.review.id,
  ]);
  const raw = randomBytes(32).toString("hex");
  await db.query(
    "insert into review_invites (token_hash, review_id, owner_id, created_at) values ($1, $2, $3, $4)",
    [tokenHash(raw), review.review.id, owner.id, new Date().toISOString()],
  );
  return { ok: true, token: raw };
}

export type InviteAcceptResult = { ok: true; review: ReviewRequest } | { ok: false; error: string };

/**
 * Accept an invite: single-use, grants the professional role, and claims
 * the review for the acceptor in one step.
 */
export async function acceptReviewInvite(
  db: Db,
  user: AuthUser,
  rawToken: string,
): Promise<InviteAcceptResult> {
  if (!TOKEN_SHAPE.test(rawToken)) return { ok: false, error: "This invite link is not valid." };
  const res = await db.query("select * from review_invites where token_hash = $1", [tokenHash(rawToken)]);
  const invite = res.rows[0];
  if (!invite) return { ok: false, error: "This invite link is invalid or was replaced by a newer one." };
  if (invite.used_by) return { ok: false, error: "This invite was already used — ask the homeowner for a fresh link." };
  if (String(invite.owner_id) === user.id) {
    return { ok: false, error: "This is your own invite — send the link to your architect or designer instead." };
  }

  const reviewRes = await db.query("select * from review_requests where id = $1", [String(invite.review_id)]);
  const review = reviewRes.rows[0];
  if (!review) return { ok: false, error: "The review behind this invite no longer exists." };
  if (review.professional_id && String(review.professional_id) !== user.id) {
    return { ok: false, error: "Another professional already holds this review." };
  }

  const now = new Date().toISOString();
  if (user.role !== "professional") await setRole(db, user.id, "professional");
  await db.query(
    "update review_requests set status = 'claimed', professional_id = $1, professional_email = $2, updated_at = $3 where id = $4",
    [user.id, user.email, now, String(invite.review_id)],
  );
  await db.query("update review_invites set used_by = $1, used_at = $2 where token_hash = $3", [
    user.id,
    now,
    tokenHash(rawToken),
  ]);
  const updated = await db.query("select * from review_requests where id = $1", [String(invite.review_id)]);
  const row = updated.rows[0];
  return {
    ok: true,
    review: {
      id: String(row.id),
      projectId: String(row.project_id),
      ownerId: String(row.owner_id),
      projectName: String(row.project_name),
      status: String(row.status) as ReviewRequest["status"],
      note: (row.note as string | null) ?? null,
      professionalId: (row.professional_id as string | null) ?? null,
      professionalEmail: (row.professional_email as string | null) ?? null,
      updatedAt: String(row.updated_at),
    },
  };
}

export type ProfileResult = { ok: true; profile: ProfessionalProfile } | { ok: false; error: string };

export async function saveProfile(
  db: Db,
  userId: string,
  input: { fullName?: string; discipline?: string; licenseNumber?: string; licenseState?: string },
): Promise<ProfileResult> {
  const fullName = (input.fullName ?? "").trim();
  const discipline = (input.discipline ?? "").trim().toLowerCase();
  const licenseNumber = (input.licenseNumber ?? "").trim().toUpperCase();
  const licenseState = (input.licenseState ?? "").trim().toUpperCase();

  if (fullName.length < 2 || fullName.length > 120) return { ok: false, error: "Enter your full name as licensed." };
  if (!DISCIPLINES.includes(discipline as Discipline)) {
    return { ok: false, error: `Discipline must be one of: ${DISCIPLINES.join(", ")}.` };
  }
  if (!/^[A-Z0-9.-]{3,24}$/.test(licenseNumber)) {
    return { ok: false, error: "License number should be 3–24 letters, digits, dots, or dashes." };
  }
  if (!/^[A-Z]{2}$/.test(licenseState)) {
    return { ok: false, error: "License state should be a two-letter code (e.g. TX)." };
  }

  const now = new Date().toISOString();
  await db.query(
    `insert into professional_profiles (user_id, full_name, discipline, license_number, license_state, status, submitted_at)
     values ($1, $2, $3, $4, $5, 'self_reported', $6)
     on conflict (user_id) do update set
       full_name = excluded.full_name, discipline = excluded.discipline,
       license_number = excluded.license_number, license_state = excluded.license_state,
       status = 'self_reported', submitted_at = excluded.submitted_at`,
    [userId, fullName, discipline, licenseNumber, licenseState, now],
  );
  return {
    ok: true,
    profile: { userId, fullName, discipline: discipline as Discipline, licenseNumber, licenseState, status: "self_reported", submittedAt: now },
  };
}

export async function getProfile(db: Db, userId: string): Promise<ProfessionalProfile | null> {
  const res = await db.query("select * from professional_profiles where user_id = $1", [userId]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    userId: String(r.user_id),
    fullName: String(r.full_name),
    discipline: String(r.discipline) as Discipline,
    licenseNumber: String(r.license_number),
    licenseState: String(r.license_state),
    status: String(r.status),
    submittedAt: String(r.submitted_at),
  };
}
