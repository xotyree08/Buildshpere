import { NextResponse } from "next/server";

import { styleInfo } from "@/lib/catalog/styles";
import { schemeByKey } from "@/lib/engine/interiors";
import { buildInteriorPrompt, PHOTOREAL_UNCONFIGURED, renderPhotoreal, type PhotorealEnv } from "@/lib/server/photoreal";
import { clientKey, RATE_LIMITED_MESSAGE, rateLimit } from "@/lib/server/ratelimit";
import { chargeRender, refundRender, remainingField } from "@/lib/server/rendercredit";

export const maxDuration = 60;

interface ShotRequest {
  imageDataUrl: string;
  roomLabel?: string;
  style?: string;
  interiorScheme?: string;
  projectId?: string;
}

/**
 * One stop of a photoreal walkthrough. Draws down the reservation made by
 * /render/walkthrough/start rather than the customer-visible walkthrough
 * credit, so a tour costs exactly one walkthrough however many stops it has.
 */
export async function POST(req: Request) {
  // A tour fires these back to back, so the cap is per-stop generous but
  // still bounded — one runaway client cannot drain an account.
  const verdict = rateLimit(clientKey(req, "walkthrough-shot"), 30, 10 * 60_000);
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: RATE_LIMITED_MESSAGE },
      { status: 429, headers: { "retry-after": String(verdict.retryAfterSeconds) } },
    );
  }

  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json({ error: PHOTOREAL_UNCONFIGURED }, { status: 503 });
  }

  let body: ShotRequest;
  try {
    body = (await req.json()) as ShotRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.imageDataUrl !== "string" || !body.imageDataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "imageDataUrl (a data: image) is required." }, { status: 422 });
  }
  if (body.imageDataUrl.length > 4_000_000) {
    return NextResponse.json({ error: "Capture too large — try a smaller viewer size." }, { status: 413 });
  }

  const charge = await chargeRender(body.projectId, "walkthrough_shot", "walkthrough stop");
  if (charge instanceof NextResponse) {
    // A reservation that ran dry is not the same failure as an unlicensed
    // project; say which one so the customer knows whether to start again.
    return charge;
  }

  const styleLabel = styleInfo(body.style)?.label ?? "custom";
  const schemeLabel = schemeByKey(body.interiorScheme)?.label;
  const result = await renderPhotoreal(process.env as PhotorealEnv, fetch, {
    imageDataUrl: body.imageDataUrl,
    prompt: buildInteriorPrompt(body.roomLabel?.slice(0, 60) || "room", styleLabel, schemeLabel),
  });

  if (!result.ok) {
    await refundRender(charge, "walkthrough stop failed");
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ imageDataUrl: result.imageDataUrl, ...remainingField(charge) });
}
