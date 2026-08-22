import { NextResponse } from "next/server";

import { runChecks } from "@/lib/engine/checks";
import { estimateRevision, valueEngineering } from "@/lib/engine/estimate";
import { repackWithout } from "@/lib/engine/repack";
import { applyRevision, parseRevisionRequest } from "@/lib/engine/revise";
import type { ParametricModel } from "@/lib/types";

interface ReviseRequest {
  model: ParametricModel;
  request: string;
  budgetCents?: number | null;
  regionCode?: string;
}

/**
 * Stateless revision turn (docs/MVP_PHASE1.md: POST /concepts/:id/revisions,
 * statelessly): change request in, revised model + checks + estimate out.
 */
export async function POST(req: Request) {
  let body: ReviseRequest;
  try {
    body = (await req.json()) as ReviseRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.model?.rooms) || body.model.rooms.length === 0) {
    return NextResponse.json({ error: "model.rooms is required." }, { status: 422 });
  }
  if (typeof body.request !== "string" || !body.request.trim()) {
    return NextResponse.json({ error: "request text is required." }, { status: 422 });
  }

  const { ops, unrecognized } = parseRevisionRequest(body.request);
  if (ops.length === 0) {
    return NextResponse.json({ error: "No actionable changes parsed.", unrecognized }, { status: 422 });
  }

  const { model, applied, rejected } = applyRevision(body.model, ops);
  if (applied.length === 0) {
    return NextResponse.json({ error: "All changes were rejected.", rejected, unrecognized }, { status: 422 });
  }

  const health = runChecks(model, "adhoc");
  const estimate = estimateRevision(model, "adhoc", body.regionCode);
  return NextResponse.json({
    model,
    applied,
    rejected,
    unrecognized,
    healthScore: health.score,
    checkResults: health.results,
    estimate,
    veSuggestions: valueEngineering(estimate, body.budgetCents ?? null, model, {}, repackWithout),
  });
}
