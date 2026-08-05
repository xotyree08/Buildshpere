import { NextResponse } from "next/server";

import { estimateRevision } from "@/lib/engine/estimate";
import type { ParametricModel } from "@/lib/types";

interface EstimateRequest {
  model: ParametricModel;
  regionCode?: string;
}

/** Stateless re-pricing of a parametric model (docs/MVP_PHASE1.md). */
export async function POST(req: Request) {
  let body: EstimateRequest;
  try {
    body = (await req.json()) as EstimateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!Array.isArray(body.model?.rooms) || body.model.rooms.length === 0) {
    return NextResponse.json({ error: "model.rooms is required." }, { status: 422 });
  }

  return NextResponse.json({ estimate: estimateRevision(body.model, "adhoc", body.regionCode) });
}
