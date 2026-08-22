/**
 * Marketplace (BS-PRO-001/002): finding a professional, and asking several of
 * them what they would charge.
 *
 * Two things this file is careful about.
 *
 * FIRST, it never implies verification it does not have. A profile's `status`
 * is `self_reported` — nobody has checked that licence number against a
 * board. `DIRECTORY_DISCLAIMER` travels with every result so the caller
 * cannot render a list of professionals that reads like a vetted panel, and a
 * test asserts every search result still carries it. When licensing-board
 * data arrives, `status` becomes `verified` and the disclaimer can soften;
 * until then it says what is true.
 *
 * SECOND, being listed is opt-in. A professional who joined through a
 * directed invite to review one project did not ask to appear in a public
 * directory, and enrolling them silently would be a privacy decision made on
 * their behalf.
 *
 * Proposals are sealed. A professional sees the request and their own
 * proposal, never a rival's — an open book turns a quote into an auction and
 * the low bid into a race. The owner sees everything, which is the point.
 */

import type { Db } from "./db";
import { DISCIPLINES, type Discipline, type ProfessionalProfile } from "./pros";

export const DIRECTORY_DISCLAIMER =
  "Credentials are self-reported. BuildSphere has not verified licence numbers with any state board — confirm them directly before engaging anyone.";

export interface DirectoryEntry extends ProfessionalProfile {
  /** Repeated on every entry so a caller cannot drop it by accident. */
  disclaimer: string;
}

export type MarketResult<T> = { ok: true; value: T } | { ok: false; error: string };

function fail<T>(error: string): MarketResult<T> {
  return { ok: false, error };
}

function isDiscipline(value: unknown): value is Discipline {
  return typeof value === "string" && (DISCIPLINES as readonly string[]).includes(value);
}

/**
 * Search the directory.
 *
 * Only profiles that opted in are returned, ever. `query` matches the name;
 * it is a LIKE rather than anything cleverer because the directory is small
 * and a wrong search result is worse than a slow one.
 */
export async function searchProfessionals(
  db: Db,
  filters: { discipline?: string; state?: string; query?: string } = {},
): Promise<DirectoryEntry[]> {
  const where: string[] = ["listed = true"];
  const params: unknown[] = [];

  if (isDiscipline(filters.discipline)) {
    params.push(filters.discipline);
    where.push(`discipline = $${params.length}`);
  }
  if (typeof filters.state === "string" && filters.state.trim() !== "") {
    params.push(filters.state.trim().toUpperCase());
    where.push(`upper(license_state) = $${params.length}`);
  }
  if (typeof filters.query === "string" && filters.query.trim() !== "") {
    params.push(`%${filters.query.trim().toLowerCase()}%`);
    where.push(`lower(full_name) like $${params.length}`);
  }

  const res = await db.query(
    `select user_id, full_name, discipline, license_number, license_state, status, submitted_at
       from professional_profiles
      where ${where.join(" and ")}
      order by full_name`,
    params,
  );
  return res.rows.map((r) => ({
    userId: String(r.user_id),
    fullName: String(r.full_name),
    discipline: String(r.discipline) as Discipline,
    licenseNumber: String(r.license_number),
    licenseState: String(r.license_state),
    status: String(r.status),
    submittedAt: String(r.submitted_at),
    disclaimer: DIRECTORY_DISCLAIMER,
  }));
}

/** Opt in or out of appearing in the directory. */
export async function setListed(db: Db, userId: string, listed: boolean): Promise<MarketResult<null>> {
  const exists = await db.query("select 1 from professional_profiles where user_id = $1", [userId]);
  if (exists.rows.length === 0) return fail("Submit your credentials before joining the directory.");
  await db.query("update professional_profiles set listed = $1 where user_id = $2", [listed, userId]);
  return { ok: true, value: null };
}

export type RequestStatus = "open" | "awarded" | "cancelled";
export type ProposalStatus = "submitted" | "accepted" | "declined" | "withdrawn";

export interface QuoteRequest {
  id: string;
  projectId: string;
  ownerId: string;
  discipline: Discipline;
  scope: string;
  status: RequestStatus;
  createdAt: string;
}

export interface Proposal {
  id: string;
  requestId: string;
  professionalId: string;
  feeCents: number;
  timelineDays: number;
  note: string;
  status: ProposalStatus;
  createdAt: string;
}

const MAX_SCOPE = 4000;
const MAX_NOTE = 4000;

export async function openRequest(
  db: Db,
  ownerId: string,
  input: { projectId: string; discipline: string; scope: string },
): Promise<MarketResult<QuoteRequest>> {
  const owned = await db.query("select 1 from projects where id = $1 and owner_id = $2", [
    input.projectId,
    ownerId,
  ]);
  if (owned.rows.length === 0) return fail("That is not your project.");
  if (!isDiscipline(input.discipline)) return fail("Choose a discipline.");
  const scope = input.scope.trim();
  if (scope.length === 0) return fail("Say what you need done.");
  if (scope.length > MAX_SCOPE) return fail(`Keep the scope under ${MAX_SCOPE} characters.`);

  const open = await db.query(
    "select 1 from quote_requests where project_id = $1 and discipline = $2 and status = 'open'",
    [input.projectId, input.discipline],
  );
  if (open.rows.length > 0) {
    return fail("There is already an open request for that discipline on this project.");
  }

  const id = `req_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  await db.query(
    "insert into quote_requests (id, project_id, owner_id, discipline, scope, status, created_at) values ($1,$2,$3,$4,$5,'open',$6)",
    [id, input.projectId, ownerId, input.discipline, scope, now],
  );
  return {
    ok: true,
    value: {
      id,
      projectId: input.projectId,
      ownerId,
      discipline: input.discipline,
      scope,
      status: "open",
      createdAt: now,
    },
  };
}

async function getRequest(db: Db, requestId: string): Promise<QuoteRequest | null> {
  const res = await db.query("select * from quote_requests where id = $1", [requestId]);
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    ownerId: String(r.owner_id),
    discipline: String(r.discipline) as Discipline,
    scope: String(r.scope),
    status: String(r.status) as RequestStatus,
    createdAt: String(r.created_at),
  };
}

/** Open requests a listed professional in that discipline may bid on. */
export async function listOpenRequests(db: Db, professionalId: string): Promise<QuoteRequest[]> {
  const profile = await db.query(
    "select discipline from professional_profiles where user_id = $1 and listed = true",
    [professionalId],
  );
  const discipline = profile.rows[0]?.discipline;
  if (!discipline) return [];
  const res = await db.query(
    "select * from quote_requests where status = 'open' and discipline = $1 order by created_at desc",
    [String(discipline)],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    ownerId: String(r.owner_id),
    discipline: String(r.discipline) as Discipline,
    scope: String(r.scope),
    status: String(r.status) as RequestStatus,
    createdAt: String(r.created_at),
  }));
}

/** Submit a proposal, or replace your own — one per professional per request. */
export async function submitProposal(
  db: Db,
  professionalId: string,
  input: { requestId: string; feeCents: number; timelineDays: number; note: string },
): Promise<MarketResult<Proposal>> {
  const request = await getRequest(db, input.requestId);
  if (!request) return fail("No such request.");
  if (request.status !== "open") return fail("That request is no longer open.");

  const listed = await db.query(
    "select 1 from professional_profiles where user_id = $1 and listed = true and discipline = $2",
    [professionalId, request.discipline],
  );
  if (listed.rows.length === 0) {
    return fail("Only listed professionals in that discipline can propose.");
  }
  if (!Number.isInteger(input.feeCents) || input.feeCents <= 0) return fail("Quote a fee.");
  if (!Number.isInteger(input.timelineDays) || input.timelineDays <= 0) {
    return fail("Say how long it will take.");
  }
  const note = input.note.trim().slice(0, MAX_NOTE);

  const now = new Date().toISOString();
  const existing = await db.query(
    "select id from proposals where request_id = $1 and professional_id = $2",
    [input.requestId, professionalId],
  );
  if (existing.rows.length > 0) {
    const id = String(existing.rows[0].id);
    await db.query(
      "update proposals set fee_cents = $1, timeline_days = $2, note = $3, status = 'submitted', created_at = $4 where id = $5",
      [input.feeCents, input.timelineDays, note, now, id],
    );
    return {
      ok: true,
      value: {
        id,
        requestId: input.requestId,
        professionalId,
        feeCents: input.feeCents,
        timelineDays: input.timelineDays,
        note,
        status: "submitted",
        createdAt: now,
      },
    };
  }

  const id = `pro_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  await db.query(
    "insert into proposals (id, request_id, professional_id, fee_cents, timeline_days, note, status, created_at) values ($1,$2,$3,$4,$5,$6,'submitted',$7)",
    [id, input.requestId, professionalId, input.feeCents, input.timelineDays, note, now],
  );
  return {
    ok: true,
    value: {
      id,
      requestId: input.requestId,
      professionalId,
      feeCents: input.feeCents,
      timelineDays: input.timelineDays,
      note,
      status: "submitted",
      createdAt: now,
    },
  };
}

function toProposal(r: Record<string, unknown>): Proposal {
  return {
    id: String(r.id),
    requestId: String(r.request_id),
    professionalId: String(r.professional_id),
    feeCents: Number(r.fee_cents),
    timelineDays: Number(r.timeline_days),
    note: String(r.note),
    status: String(r.status) as ProposalStatus,
    createdAt: String(r.created_at),
  };
}

/**
 * Proposals on a request.
 *
 * The owner sees every bid — that is the point of asking several people. A
 * professional sees only their own: an open book turns a quote into an
 * auction, and the low bid into a race to the bottom.
 */
export async function listProposals(
  db: Db,
  userId: string,
  requestId: string,
): Promise<MarketResult<Proposal[]>> {
  const request = await getRequest(db, requestId);
  if (!request) return fail("No such request.");

  if (request.ownerId === userId) {
    const res = await db.query(
      "select * from proposals where request_id = $1 order by fee_cents",
      [requestId],
    );
    return { ok: true, value: res.rows.map(toProposal) };
  }
  const res = await db.query(
    "select * from proposals where request_id = $1 and professional_id = $2",
    [requestId, userId],
  );
  return { ok: true, value: res.rows.map(toProposal) };
}

/** Accept one proposal. Every other bid on that request is declined with it. */
export async function acceptProposal(
  db: Db,
  ownerId: string,
  proposalId: string,
): Promise<MarketResult<null>> {
  const res = await db.query("select request_id, status from proposals where id = $1", [proposalId]);
  const row = res.rows[0];
  if (!row) return fail("No such proposal.");

  const request = await getRequest(db, String(row.request_id));
  if (!request) return fail("No such request.");
  if (request.ownerId !== ownerId) return fail("Only the project's owner can accept a proposal.");
  if (request.status !== "open") return fail("That request has already been settled.");
  if (row.status !== "submitted") return fail("That proposal is no longer on the table.");

  await db.query("update proposals set status = 'accepted' where id = $1", [proposalId]);
  await db.query(
    "update proposals set status = 'declined' where request_id = $1 and id <> $2 and status = 'submitted'",
    [request.id, proposalId],
  );
  await db.query("update quote_requests set status = 'awarded' where id = $1", [request.id]);
  return { ok: true, value: null };
}

/** Withdraw your own proposal while the request is still open. */
export async function withdrawProposal(
  db: Db,
  professionalId: string,
  proposalId: string,
): Promise<MarketResult<null>> {
  const res = await db.query("select professional_id, status from proposals where id = $1", [proposalId]);
  const row = res.rows[0];
  if (!row) return fail("No such proposal.");
  if (String(row.professional_id) !== professionalId) return fail("That is not your proposal.");
  if (row.status !== "submitted") return fail("That proposal is no longer on the table.");

  await db.query("update proposals set status = 'withdrawn' where id = $1", [proposalId]);
  return { ok: true, value: null };
}

export async function cancelRequest(
  db: Db,
  ownerId: string,
  requestId: string,
): Promise<MarketResult<null>> {
  const request = await getRequest(db, requestId);
  if (!request) return fail("No such request.");
  if (request.ownerId !== ownerId) return fail("That is not your request.");
  if (request.status !== "open") return fail("That request has already been settled.");

  await db.query("update quote_requests set status = 'cancelled' where id = $1", [requestId]);
  await db.query(
    "update proposals set status = 'declined' where request_id = $1 and status = 'submitted'",
    [requestId],
  );
  return { ok: true, value: null };
}
