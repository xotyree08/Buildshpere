import { NextResponse } from "next/server";

import { styleInfo } from "@/lib/catalog/styles";
import { schemeByKey } from "@/lib/engine/interiors";
import { buildPanoramaPrompt, PHOTOREAL_UNCONFIGURED, renderPhotoreal, type PhotorealEnv } from "@/lib/server/photoreal";
import { clientKey, RATE_LIMITED_MESSAGE, rateLimit } from "@/lib/server/ratelimit";
import { chargeRender, refundRender, remainingField } from "@/lib/server/rendercredit";

/** Image models are slow; hold the function open for the full prediction. */
export const maxDuration = 60;

interface Scene360Request {
  /** JPEG capture of the room from the 3D viewer, as a data URL. */
  imageDataUrl: string;
  roomLabel?: string;
  style?: string;
  interiorScheme?: string;
  projectId?: string;
}

/**
 * A 360° panorama of one room. Costs the project one `scene_360` credit —
 * the interactive 3D walk itself is free and always will be; what is metered
 * is the rendered deliverable.
 */
export async function POST(req: Request) {
  const verdict = rateLimit(clientKey(req, "scene360"), 6, 10 * 60_000);
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: RATE_LIMITED_MESSAGE },
      { status: 429, headers: { "retry-after": String(verdict.retryAfterSeconds) } },
    );
  }

  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json({ error: PHOTOREAL_UNCONFIGURED }, { status: 503 });
  }

  let body: Scene360Request;
  try {
    body = (await req.json()) as Scene360Request;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.imageDataUrl !== "string" || !body.imageDataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "imageDataUrl (a data: image) is required." }, { status: 422 });
  }
  if (body.imageDataUrl.length > 4_000_000) {
    return NextResponse.json({ error: "Capture too large — try a smaller viewer size." }, { status: 413 });
  }

  const charge = await chargeRender(body.projectId, "scene_360", "360° scene");
  if (charge instanceof NextResponse) return charge;

  const styleLabel = styleInfo(body.style)?.label ?? "custom";
  const schemeLabel = schemeByKey(body.interiorScheme)?.label;
  const result = await renderPhotoreal(process.env as PhotorealEnv, fetch, {
    imageDataUrl: body.imageDataUrl,
    prompt: buildPanoramaPrompt(body.roomLabel?.slice(0, 60) || "room", styleLabel, schemeLabel),
  });

  if (!result.ok) {
    await refundRender(charge, "360° scene failed");
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ imageDataUrl: result.imageDataUrl, ...remainingField(charge) });
}
