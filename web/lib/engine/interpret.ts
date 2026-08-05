/**
 * Conversational revision interpretation (ADR-007 discipline, same shape as
 * the inspiration analyzer): the model translates a free-form request into
 * the SAME structured ops the deterministic parser emits; this module
 * validates and clamps them against the actual plan before anything applies.
 * Geometry never comes from the model.
 */

import type { ParametricModel, RoomKind } from "../types";
import { ADDABLE_KINDS, opTargetExists, type RevisionOp } from "./revise";

export const MAX_OPS = 6;
export const MIN_FACTOR = 0.5;
export const MAX_FACTOR = 2;

/** Structured-output schema: an op is one of three shapes (anyOf). */
export const INTERPRET_SCHEMA = {
  type: "object",
  properties: {
    ops: {
      type: "array",
      items: {
        anyOf: [
          {
            type: "object",
            properties: {
              kind: { const: "resize" },
              target: { type: "string", description: "A room from the plan, by label or kind." },
              factor: { type: "number", description: "Area multiplier, 0.5–2. >1 grows, <1 shrinks." },
            },
            required: ["kind", "target", "factor"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { const: "add" },
              room: { type: "string", enum: ADDABLE_KINDS, description: "Kind of room to add." },
            },
            required: ["kind", "room"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { const: "remove" },
              target: { type: "string", description: "A room from the plan, by label or kind." },
            },
            required: ["kind", "target"],
            additionalProperties: false,
          },
        ],
      },
      description: "Structured revision operations. Empty when nothing actionable.",
    },
    note: {
      type: "string",
      description: "One sentence for the customer: what you understood and did, or why nothing applied.",
    },
  },
  required: ["ops", "note"],
  additionalProperties: false,
} as const;

export interface Interpretation {
  ops: RevisionOp[];
  note: string;
  /** Ops the validator dropped, for transparency. */
  dropped: number;
}

/** Deterministic clamp of model-proposed ops to this specific plan. */
export function validateInterpretation(raw: unknown, model: ParametricModel): Interpretation {
  const r = (raw ?? {}) as Record<string, unknown>;
  const note = typeof r.note === "string" ? r.note.slice(0, 300) : "";
  const rawOps = Array.isArray(r.ops) ? r.ops : [];

  const ops: RevisionOp[] = [];
  let dropped = 0;

  for (const item of rawOps) {
    if (ops.length >= MAX_OPS) {
      dropped++;
      continue;
    }
    const o = (item ?? {}) as Record<string, unknown>;
    if (o.kind === "resize" && typeof o.target === "string" && typeof o.factor === "number") {
      if (!opTargetExists(model, o.target) || !Number.isFinite(o.factor)) {
        dropped++;
        continue;
      }
      const factor = Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, o.factor));
      if (Math.abs(factor - 1) < 0.01) {
        dropped++;
        continue;
      }
      ops.push({ kind: "resize", target: o.target, factor: Math.round(factor * 100) / 100 });
    } else if (o.kind === "add" && typeof o.room === "string" && ADDABLE_KINDS.includes(o.room as RoomKind)) {
      ops.push({ kind: "add", room: o.room as RoomKind, label: o.room as string });
    } else if (o.kind === "remove" && typeof o.target === "string" && opTargetExists(model, o.target)) {
      ops.push({ kind: "remove", target: o.target });
    } else {
      dropped++;
    }
  }

  return { ops, note, dropped };
}

/** Compact room summary the model sees — labels it may target. */
export function describePlan(model: ParametricModel): string {
  return model.rooms
    .filter((r) => r.kind !== "hallway")
    .map((r) => `- ${r.label} (${r.kind}, ${Math.round(r.rect[2] * r.rect[3])} sqft, level ${r.level + 1})`)
    .join("\n");
}
