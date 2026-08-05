import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { INTERIOR_SCHEMES, schemeByKey } from "@/lib/engine/interiors";

/**
 * The AI interior stylist: maps "how should it feel" onto one of the
 * catalog schemes (ADR-007 — the AI picks from the deterministic catalog,
 * it never invents colors). 503 without an API key; the client falls back
 * to the keyword matcher and says so honestly.
 */

const STYLIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemeKey", "note"],
  properties: {
    schemeKey: { type: "string", enum: INTERIOR_SCHEMES.map((s) => s.key) },
    note: { type: "string", maxLength: 300 },
  },
} as const;

export async function POST(req: Request) {
  const apiKey = process.env.AI_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI styling is not configured on this deployment." }, { status: 503 });
  }

  let body: { text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 400) {
    return NextResponse.json({ error: "text (≤400 chars) is required." }, { status: 422 });
  }

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 512,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: STYLIST_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content:
            "Pick the interior design scheme that best matches how this homeowner wants their home to feel, " +
            "and write one warm sentence (the note) explaining why it fits their words.\n\nSchemes:\n" +
            INTERIOR_SCHEMES.map((s) => `- ${s.key}: ${s.label} — ${s.blurb}`).join("\n") +
            "\n\nHomeowner: " +
            JSON.stringify(body.text),
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "That description could not be styled." }, { status: 422 });
    }
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No styling produced." }, { status: 502 });
    }
    const parsed = JSON.parse(textBlock.text) as { schemeKey: string; note: string };
    if (!schemeByKey(parsed.schemeKey)) {
      return NextResponse.json({ error: "The stylist named an unknown scheme." }, { status: 502 });
    }
    return NextResponse.json({ schemeKey: parsed.schemeKey, note: parsed.note });
  } catch (error) {
    return NextResponse.json({ error: `Styling failed (${String(error)}).` }, { status: 502 });
  }
}
