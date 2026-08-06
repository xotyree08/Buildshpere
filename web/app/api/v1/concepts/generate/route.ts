import { NextResponse } from "next/server";

import type { FinishSelections } from "@/lib/catalog/materials";
import { runDesignLoop } from "@/lib/engine/loop";
import type { DesignBrief } from "@/lib/types";

interface GenerateRequest {
  brief: DesignBrief;
  lotWidthFt?: number | null;
  lotDepthFt?: number | null;
  budgetCents?: number | null;
  regionCode?: string;
  finishes?: FinishSelections;
}

/**
 * Stateless design-loop endpoint (docs/MVP_PHASE1.md). Runs synchronously for
 * now because the deterministic engines are fast; the contract stays stable
 * when generation moves behind the job queue (ADR-008).
 */
export async function POST(req: Request) {
  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const program = body.brief?.program;
  if (!program || typeof program.bedrooms !== "number" || program.bedrooms < 1) {
    return NextResponse.json({ error: "brief.program with at least 1 bedroom is required." }, { status: 422 });
  }

  const packages = runDesignLoop(body.brief, {
    lotWidthFt: body.lotWidthFt ?? null,
    lotDepthFt: body.lotDepthFt ?? null,
    budgetCents: body.budgetCents ?? null,
    regionCode: body.regionCode,
    finishes: body.finishes,
  });
  return NextResponse.json({ packages });
}
