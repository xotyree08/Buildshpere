import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { STYLES } from "@/lib/catalog/styles";
import { ANALYSIS_SCHEMA, validateAnalysis } from "@/lib/engine/inspiration";

interface AnalyzeRequest {
  /** Base64 image data, no data-URL prefix. */
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

const STYLE_GUIDE = STYLES.map((s) => `- ${s.key}: ${s.label} (${s.category}) — ${s.description}`).join("\n");

/**
 * Vision analysis of an inspiration photo (ADR-010). The model proposes
 * attributes as structured JSON; validateAnalysis clamps them to our
 * catalogs before anything downstream sees them. Without an API key the
 * route degrades to 503 and the client falls back to manual style choice.
 */
export async function POST(req: Request) {
  const apiKey = process.env.AI_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI photo analysis is not configured on this deployment." },
      { status: 503 },
    );
  }

  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.imageBase64 !== "string" || body.imageBase64.length < 100) {
    return NextResponse.json({ error: "imageBase64 is required." }, { status: 422 });
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(body.mediaType)) {
    return NextResponse.json({ error: "Unsupported media type." }, { status: 422 });
  }
  // Client downscales before upload; ~2MB base64 is the generous ceiling.
  if (body.imageBase64.length > 2_800_000) {
    return NextResponse.json({ error: "Image too large — resize before upload." }, { status: 413 });
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: ANALYSIS_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: body.mediaType, data: body.imageBase64 },
            },
            {
              type: "text",
              text:
                "This photo is a customer's architectural inspiration for a custom home they want to build. " +
                "Identify the home's architectural character. Choose styleKey (and optionally secondaryStyleKey) " +
                "from this catalog only:\n\n" +
                STYLE_GUIDE +
                "\n\nReport visible stories as levels (1 or 2 — count 3+ as 2), exterior features you can " +
                "actually see, your confidence 0-1 in the primary style, and one sentence of notes describing " +
                "the character a designer should aim for. If the image is not a home exterior, use confidence 0.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The image could not be analyzed. Try a different photo." },
        { status: 422 },
      );
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No analysis produced." }, { status: 502 });
    }

    const analysis = validateAnalysis(JSON.parse(textBlock.text));
    return NextResponse.json({ analysis });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Analysis is busy — try again in a moment." }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: "Photo analysis failed upstream." }, { status: 502 });
    }
    return NextResponse.json({ error: "Photo analysis failed." }, { status: 500 });
  }
}
