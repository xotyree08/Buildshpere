import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { ADDABLE_KINDS } from "@/lib/engine/revise";
import { describePlan, INTERPRET_SCHEMA, validateInterpretation } from "@/lib/engine/interpret";
import type { ParametricModel } from "@/lib/types";
import { clientKey, RATE_LIMITED_MESSAGE, rateLimit } from "@/lib/server/ratelimit";

interface InterpretRequest {
  request: string;
  model: ParametricModel;
}

/**
 * Conversational fallback for revision requests the deterministic parser
 * can't handle ("make it cozier"). The model proposes structured ops;
 * validateInterpretation clamps them to this plan before the client applies
 * them through the same engine path as parsed ops. 503 without an API key —
 * the client keeps the parser-only experience.
 */
export async function POST(req: Request) {
  const verdict = rateLimit(clientKey(req, "interpret"), 30, 10 * 60_000);
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: RATE_LIMITED_MESSAGE },
      { status: 429, headers: { "retry-after": String(verdict.retryAfterSeconds) } },
    );
  }

  const apiKey = process.env.AI_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI interpretation is not configured on this deployment." }, { status: 503 });
  }

  let body: InterpretRequest;
  try {
    body = (await req.json()) as InterpretRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.request !== "string" || !body.request.trim() || body.request.length > 500) {
    return NextResponse.json({ error: "request text (≤500 chars) is required." }, { status: 422 });
  }
  if (!Array.isArray(body.model?.rooms) || body.model.rooms.length === 0) {
    return NextResponse.json({ error: "model.rooms is required." }, { status: 422 });
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: INTERPRET_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content:
            "You translate a homeowner's free-form change request into structured revision operations " +
            "for their floor plan. Current rooms:\n\n" +
            describePlan(body.model) +
            "\n\nAddable room kinds: " +
            ADDABLE_KINDS.join(", ") +
            ".\n\nRules: resize factors between 0.5 and 2 (>1 grows a room, <1 shrinks it); target rooms " +
            "by their label or kind from the list above; at most 6 operations. Interpret intent — " +
            '"cozier" might mean modestly shrinking oversized public rooms, "I work from home" might ' +
            "mean adding an office or growing an existing one. If nothing in the request maps to plan " +
            "changes, return an empty ops array and say why in the note.\n\nRequest: " +
            JSON.stringify(body.request),
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "That request could not be interpreted." }, { status: 422 });
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No interpretation produced." }, { status: 502 });
    }

    const interpretation = validateInterpretation(JSON.parse(textBlock.text), body.model);
    return NextResponse.json({ interpretation });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Interpretation is busy — try again in a moment." }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json({ error: "Interpretation failed upstream." }, { status: 502 });
    }
    return NextResponse.json({ error: "Interpretation failed." }, { status: 500 });
  }
}
