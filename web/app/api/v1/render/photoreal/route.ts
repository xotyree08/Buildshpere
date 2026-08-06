import { NextResponse } from "next/server";

import { ROOFING, SIDING, WINDOWS, type FinishSelections } from "@/lib/catalog/materials";
import { styleInfo } from "@/lib/catalog/styles";
import { buildPhotorealPrompt, PHOTOREAL_UNCONFIGURED, renderPhotoreal, type PhotorealEnv } from "@/lib/server/photoreal";
import { clientKey, RATE_LIMITED_MESSAGE, rateLimit } from "@/lib/server/ratelimit";

/** Image models are slow; hold the function open for the full prediction. */
export const maxDuration = 60;

interface PhotorealRequest {
  /** JPEG capture of the 3D viewer, as a data URL. */
  imageDataUrl: string;
  style?: string;
  finishes?: FinishSelections;
}

export async function POST(req: Request) {
  // The most expensive render we offer — tightest cap of all.
  const verdict = rateLimit(clientKey(req, "photoreal"), 6, 10 * 60_000);
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: RATE_LIMITED_MESSAGE },
      { status: 429, headers: { "retry-after": String(verdict.retryAfterSeconds) } },
    );
  }

  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json({ error: PHOTOREAL_UNCONFIGURED }, { status: 503 });
  }

  let body: PhotorealRequest;
  try {
    body = (await req.json()) as PhotorealRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.imageDataUrl !== "string" || !body.imageDataUrl.startsWith("data:image/")) {
    return NextResponse.json({ error: "imageDataUrl (a data: image) is required." }, { status: 422 });
  }
  if (body.imageDataUrl.length > 4_000_000) {
    return NextResponse.json({ error: "Capture too large — try a smaller viewer size." }, { status: 413 });
  }

  const styleLabel = styleInfo(body.style)?.label ?? "custom";
  const f = body.finishes ?? {};
  const materialLabels = [
    SIDING.find((o) => o.key === f.siding)?.label && `${SIDING.find((o) => o.key === f.siding)!.label} siding`,
    ROOFING.find((o) => o.key === f.roofing)?.label && `${ROOFING.find((o) => o.key === f.roofing)!.label} roof`,
    WINDOWS.find((o) => o.key === f.windows)?.label && `${WINDOWS.find((o) => o.key === f.windows)!.label} windows`,
  ].filter((v): v is string => Boolean(v));

  const result = await renderPhotoreal(process.env as PhotorealEnv, fetch, {
    imageDataUrl: body.imageDataUrl,
    prompt: buildPhotorealPrompt(styleLabel, materialLabels),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ imageDataUrl: result.imageDataUrl });
}
