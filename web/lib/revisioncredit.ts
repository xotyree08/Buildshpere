/**
 * The client half of major-revision metering.
 *
 * The design loop runs in the browser, so the order is: compute the change,
 * ask whether it is major, and only spend a round — and only then commit —
 * when it is. A minor change never contacts the server at all, which is the
 * point: finishes, fixtures, furniture, and small adjustments are free by
 * construction, not by a rule that could drift.
 */

import { classifyRevision } from "./engine/revisionscope";
import type { ParametricModel } from "./types";

export type RevisionAuthorization =
  | { ok: true; notice: string | null }
  | { ok: false; error: string };

export async function authorizeRevision(
  projectId: string,
  before: ParametricModel,
  after: ParametricModel,
): Promise<RevisionAuthorization> {
  const scope = classifyRevision(before, after);
  if (!scope.major) return { ok: true, notice: null };

  try {
    const res = await fetch("/api/v1/revisions/major", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, summary: scope.reasons.join("; ") }),
    });
    const body = (await res.json()) as {
      metered?: boolean;
      remaining?: number;
      error?: string;
      tier?: string;
    };
    if (!res.ok) {
      return { ok: false, error: body.error ?? "This revision could not be authorized." };
    }
    if (!body.metered) return { ok: true, notice: null };

    const left = body.remaining ?? 0;
    const plural = left === 1 ? "" : "s";
    // An unlicensed project is spending its free allowance, not a paid round;
    // saying so keeps the licensing offer honest instead of implying the
    // customer already bought something.
    const balance =
      body.tier === "free"
        ? `${left} free major revision${plural} left — licensing this project starts its included rounds fresh.`
        : `${left} revision round${plural} remaining on this project.`;
    return { ok: true, notice: `Major revision (${scope.reasons.join("; ")}) — ${balance}` };
  } catch {
    // A network failure must not silently hand out a paid round, and must
    // not silently eat the customer's change either: refuse and say why.
    return { ok: false, error: "Could not reach the server to record this revision — try again." };
  }
}
