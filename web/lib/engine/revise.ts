/**
 * Revision engine: a change request becomes structured ops, ops mutate the
 * room program, and the program re-packs through the same assembleModel path
 * as initial generation — so a revised plan obeys all the same layout rules.
 *
 * ADR-007 applies: the phrase parser here is deterministic keyword matching.
 * A conversational AI can sit in front of it later, emitting the same ops —
 * geometry never comes from a model.
 */

import type { ParametricModel, RoomKind } from "../types";
import { assembleModel, type RoomSpec } from "./generate";

export type RevisionOp =
  | { kind: "resize"; target: string; factor: number }
  | { kind: "add"; room: RoomKind; label: string }
  | { kind: "remove"; target: string };

export interface ParsedRequest {
  ops: RevisionOp[];
  unrecognized: string[];
}

/** Room-kind vocabulary for matching phrases to rooms. */
const KIND_WORDS: [RoomKind, string[]][] = [
  ["kitchen", ["kitchen"]],
  ["bathroom", ["bathroom", "bath"]],
  ["bedroom", ["bedroom", "bed room"]],
  ["living", ["living room", "living"]],
  ["dining", ["dining room", "dining"]],
  ["office", ["office", "study"]],
  ["gym", ["gym", "fitness"]],
  ["theater", ["theater", "theatre", "media room"]],
  ["garage", ["garage"]],
  ["laundry", ["laundry"]],
  ["mudroom", ["mudroom", "mud room"]],
  ["closet", ["storage", "closet", "mechanical"]],
  ["outdoor", ["outdoor kitchen", "outdoor"]],
];

export const ADD_DEFAULTS: Partial<Record<RoomKind, { label: string; areaSqft: number; aspect: number; public: boolean }>> = {
  bedroom: { label: "Bedroom", areaSqft: 156, aspect: 1.2, public: false },
  bathroom: { label: "Bath", areaSqft: 60, aspect: 1.4, public: false },
  office: { label: "Office", areaSqft: 132, aspect: 1.1, public: false },
  gym: { label: "Gym", areaSqft: 180, aspect: 1.3, public: false },
  theater: { label: "Theater", areaSqft: 220, aspect: 1.4, public: false },
  mudroom: { label: "Mudroom", areaSqft: 64, aspect: 1.2, public: false },
  laundry: { label: "Laundry", areaSqft: 64, aspect: 1.0, public: false },
  closet: { label: "Storage", areaSqft: 48, aspect: 1.0, public: false },
  outdoor: { label: "Outdoor Kitchen", areaSqft: 140, aspect: 1.5, public: true },
};

function matchKindWord(clause: string): { kind: RoomKind; word: string } | null {
  for (const [kind, words] of KIND_WORDS) {
    for (const word of words) {
      if (clause.includes(word)) return { kind, word };
    }
  }
  return null;
}

/** Deterministic parse of a change request into revision ops. */
export function parseRevisionRequest(text: string): ParsedRequest {
  const ops: RevisionOp[] = [];
  const unrecognized: string[] = [];
  const clauses = text
    .toLowerCase()
    .split(/,|;|\band\b|\.|\n/)
    .map((c) => c.trim())
    .filter(Boolean);

  for (const clause of clauses) {
    const match = matchKindWord(clause);
    if (!match) {
      unrecognized.push(clause);
      continue;
    }
    const grow = /\b(bigger|larger|expand|grow|more space|enlarge|huge)\b/.test(clause);
    const shrink = /\b(smaller|shrink|reduce|tighter|compact)\b/.test(clause);
    const add = /\b(add|include|with a|need a|want a|another)\b/.test(clause);
    const remove = /\b(remove|delete|drop|without|no more|get rid of|cut)\b/.test(clause);
    const strong = /\b(much|way|a lot|significantly|huge)\b/.test(clause);

    if (remove) ops.push({ kind: "remove", target: match.word });
    else if (add && ADD_DEFAULTS[match.kind]) ops.push({ kind: "add", room: match.kind, label: ADD_DEFAULTS[match.kind]!.label });
    else if (grow) ops.push({ kind: "resize", target: match.word, factor: strong ? 1.5 : 1.25 });
    else if (shrink) ops.push({ kind: "resize", target: match.word, factor: strong ? 0.65 : 0.8 });
    else unrecognized.push(clause);
  }

  return { ops, unrecognized };
}

interface LeveledSpec extends RoomSpec {
  level: number;
}

/** Recover the room program from a packed model (hallways are re-derived on packing). */
function deriveSpecs(model: ParametricModel): LeveledSpec[] {
  return model.rooms
    .filter((r) => r.kind !== "hallway")
    .map((r) => ({
      // The key comes back with the room. Dropping it here is what made every
      // revision hand back a storey of strangers: the same kitchen, renamed,
      // so no diff could pair it with itself and no approval could survive it.
      key: r.key,
      kind: r.kind,
      label: r.label,
      areaSqft: Math.round(r.rect[2] * r.rect[3]),
      aspect: Math.round((r.rect[2] / r.rect[3]) * 100) / 100,
      public: ["living", "kitchen", "dining", "outdoor"].includes(r.kind),
      level: r.level,
    }));
}

function findSpec(specs: LeveledSpec[], target: string): LeveledSpec | undefined {
  const t = target.toLowerCase();
  return (
    specs.find((s) => s.label.toLowerCase() === t) ??
    specs.find((s) => s.label.toLowerCase().includes(t)) ??
    specs.find((s) => {
      const m = matchKindWord(t);
      return m != null && s.kind === m.kind;
    })
  );
}

/** Room kinds an add op may introduce. */
export const ADDABLE_KINDS = Object.keys(ADD_DEFAULTS) as RoomKind[];

/** Whether a resize/remove target matches anything in this model. */
export function opTargetExists(model: ParametricModel, target: string): boolean {
  const t = target.toLowerCase();
  return model.rooms.some(
    (r) =>
      r.kind !== "hallway" &&
      (r.label.toLowerCase() === t ||
        r.label.toLowerCase().includes(t) ||
        (matchKindWord(t)?.kind ?? null) === r.kind),
  );
}

export interface ReviseResult {
  model: ParametricModel;
  applied: string[];
  rejected: string[];
}

/** Apply ops to a model's program and re-pack. Deterministic. */
export function applyRevision(model: ParametricModel, ops: RevisionOp[]): ReviseResult {
  const specs = deriveSpecs(model);
  const applied: string[] = [];
  const rejected: string[] = [];

  for (const op of ops) {
    if (op.kind === "resize") {
      const spec = findSpec(specs, op.target);
      if (!spec) {
        rejected.push(`No "${op.target}" in this plan to resize.`);
        continue;
      }
      spec.areaSqft = Math.max(30, Math.round(spec.areaSqft * op.factor));
      applied.push(`${op.factor > 1 ? "Enlarged" : "Reduced"} ${spec.label} to ~${spec.areaSqft} sqft`);
    } else if (op.kind === "remove") {
      const spec = findSpec(specs, op.target);
      if (!spec) {
        rejected.push(`No "${op.target}" in this plan to remove.`);
        continue;
      }
      if (spec.kind === "kitchen" || (spec.kind === "bathroom" && specs.filter((s) => s.kind === "bathroom").length === 1)) {
        rejected.push(`Kept ${spec.label} — every home needs it.`);
        continue;
      }
      specs.splice(specs.indexOf(spec), 1);
      applied.push(`Removed ${spec.label}`);
    } else {
      const dflt = ADD_DEFAULTS[op.room];
      if (!dflt) {
        rejected.push(`Can't add a ${op.room} yet.`);
        continue;
      }
      const count = specs.filter((s) => s.kind === op.room).length;
      const privateLevel = model.levels - 1;
      specs.push({
        ...dflt,
        kind: op.room,
        label: count > 0 ? `${dflt.label} ${count + 1}` : dflt.label,
        level: op.room === "bedroom" || op.room === "bathroom" ? privateLevel : 0,
      });
      applied.push(`Added ${dflt.label}`);
    }
  }

  const maxRow = Math.max(24, ...model.rooms.map((r) => r.rect[0] + r.rect[2]));
  const levelSpecs: RoomSpec[][] = Array.from({ length: model.levels }, (_, lvl) =>
    specs.filter((s) => s.level === lvl),
  );
  // a level emptied by removals collapses out
  const nonEmpty = levelSpecs.filter((l) => l.length > 0);

  return { model: assembleModel(nonEmpty, maxRow), applied, rejected };
}
