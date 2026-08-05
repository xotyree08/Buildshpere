import { describe, expect, it } from "vitest";

import type { DesignBrief } from "../types";
import { generateConcepts } from "./generate";
import { validateInterpretation, MAX_OPS, describePlan } from "./interpret";
import { applyOpsToConceptPackage, runDesignLoop } from "./loop";

const brief: DesignBrief = {
  id: "b",
  projectId: "p",
  version: 1,
  program: {
    familySize: 4,
    bedrooms: 3,
    bathrooms: 2,
    office: false,
    gym: false,
    theater: false,
    outdoorKitchen: false,
    garageBays: 2,
  },
  style: "modern",
  interiors: {},
  lifestyleNotes: "",
};

const model = () => generateConcepts(brief, 60)[0].model;

describe("validateInterpretation", () => {
  it("passes through clean ops against real rooms", () => {
    const { ops, dropped } = validateInterpretation(
      {
        ops: [
          { kind: "resize", target: "kitchen", factor: 1.3 },
          { kind: "add", room: "office" },
          { kind: "remove", target: "dining room" },
        ],
        note: "Opened up the kitchen, added a workspace.",
      },
      model(),
    );
    expect(ops).toHaveLength(3);
    expect(dropped).toBe(0);
  });

  it("clamps factors and drops no-op resizes", () => {
    const { ops, dropped } = validateInterpretation(
      {
        ops: [
          { kind: "resize", target: "kitchen", factor: 9 },
          { kind: "resize", target: "living room", factor: 0.01 },
          { kind: "resize", target: "kitchen", factor: 1.001 },
        ],
        note: "",
      },
      model(),
    );
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({ kind: "resize", target: "kitchen", factor: 2 });
    expect(ops[1]).toEqual({ kind: "resize", target: "living room", factor: 0.5 });
    expect(dropped).toBe(1); // the ~1.0 no-op
  });

  it("drops ops targeting rooms that don't exist and unknown add kinds", () => {
    const { ops, dropped } = validateInterpretation(
      {
        ops: [
          { kind: "resize", target: "ballroom", factor: 1.5 },
          { kind: "add", room: "helipad" },
          { kind: "remove", target: "moat" },
          { kind: "remove", target: "garage" },
        ],
        note: "",
      },
      model(),
    );
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe("remove");
    expect(dropped).toBe(3);
  });

  it("caps the op count and survives garbage", () => {
    const many = Array.from({ length: 12 }, () => ({ kind: "add", room: "bedroom" }));
    const capped = validateInterpretation({ ops: many, note: "" }, model());
    expect(capped.ops).toHaveLength(MAX_OPS);
    expect(capped.dropped).toBe(12 - MAX_OPS);

    for (const junk of [null, 42, "hi", { ops: "nope" }, { ops: [null, 7, {}] }]) {
      const v = validateInterpretation(junk, model());
      expect(v.ops).toEqual([]);
    }
  });
});

describe("AI ops flow through the same engine path as parsed ops", () => {
  it("applyOpsToConceptPackage produces a scored, priced revision from validated ops", () => {
    const base = runDesignLoop(brief, { lotWidthFt: 60, budgetCents: null })[0];
    const { ops } = validateInterpretation(
      { ops: [{ kind: "resize", target: "kitchen", factor: 1.4 }, { kind: "add", room: "office" }], note: "" },
      base.concept.model,
    );
    const outcome = applyOpsToConceptPackage(base, ops, { budgetCents: null });
    expect(outcome.pkg).not.toBeNull();
    expect(outcome.pkg!.revision.model.rooms.some((r) => r.kind === "office")).toBe(true);
    expect(outcome.pkg!.estimate.totalCents).toBeGreaterThan(base.estimate.totalCents);
    expect(outcome.pkg!.checkResults.length).toBeGreaterThan(0);
  });

  it("kitchen-removal guardrail holds on the AI path too", () => {
    const base = runDesignLoop(brief, { lotWidthFt: 60, budgetCents: null })[0];
    const { ops } = validateInterpretation(
      { ops: [{ kind: "remove", target: "kitchen" }], note: "" },
      base.concept.model,
    );
    const outcome = applyOpsToConceptPackage(base, ops, { budgetCents: null });
    expect(outcome.pkg).toBeNull();
    expect(outcome.unrecognized.some((m) => m.includes("Kept"))).toBe(true);
  });
});

describe("describePlan", () => {
  it("lists targetable rooms with kind, size, and level — no hallways", () => {
    const text = describePlan(model());
    expect(text).toContain("Kitchen");
    expect(text).toContain("sqft");
    expect(text).not.toContain("Hall");
  });
});
