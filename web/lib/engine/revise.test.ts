import { describe, expect, it } from "vitest";

import type { DesignBrief } from "../types";
import { generateConcepts } from "./generate";
import { applyRevision, parseRevisionRequest } from "./revise";
import { runDesignLoop, reviseConceptPackage } from "./loop";

const brief: DesignBrief = {
  id: "brief-1",
  projectId: "proj-1",
  version: 1,
  program: {
    familySize: 4,
    bedrooms: 3,
    bathrooms: 2,
    office: false,
    gym: false,
    theater: true,
    outdoorKitchen: false,
    garageBays: 2,
  },
  style: "modern",
  interiors: {},
  lifestyleNotes: "",
};

describe("parseRevisionRequest", () => {
  it("maps grow/shrink/add/remove phrases to ops", () => {
    const { ops, unrecognized } = parseRevisionRequest(
      "Make the kitchen bigger, add a mudroom and remove the theater",
    );
    expect(unrecognized).toHaveLength(0);
    expect(ops).toEqual([
      { kind: "resize", target: "kitchen", factor: 1.25 },
      { kind: "add", room: "mudroom", label: "Mudroom" },
      { kind: "remove", target: "theater" },
    ]);
  });

  it("scales strong modifiers", () => {
    const { ops } = parseRevisionRequest("much bigger living room");
    expect(ops).toEqual([{ kind: "resize", target: "living room", factor: 1.5 }]);
  });

  it("reports unparseable clauses instead of guessing", () => {
    const { ops, unrecognized } = parseRevisionRequest("make it feel more cozy");
    expect(ops).toHaveLength(0);
    expect(unrecognized).toHaveLength(1);
  });
});

describe("applyRevision", () => {
  const model = () => generateConcepts(brief, 60)[0].model;

  it("resizes the targeted room", () => {
    const before = model();
    const kitchenBefore = before.rooms.find((r) => r.kind === "kitchen")!;
    const { model: after, applied } = applyRevision(before, [
      { kind: "resize", target: "kitchen", factor: 1.25 },
    ]);
    const kitchenAfter = after.rooms.find((r) => r.kind === "kitchen")!;
    const areaBefore = kitchenBefore.rect[2] * kitchenBefore.rect[3];
    const areaAfter = kitchenAfter.rect[2] * kitchenAfter.rect[3];
    expect(areaAfter).toBeGreaterThan(areaBefore * 1.15);
    expect(applied).toHaveLength(1);
  });

  it("adds and removes rooms", () => {
    const { model: after } = applyRevision(model(), [
      { kind: "add", room: "mudroom", label: "Mudroom" },
      { kind: "remove", target: "theater" },
    ]);
    expect(after.rooms.some((r) => r.kind === "mudroom")).toBe(true);
    expect(after.rooms.some((r) => r.kind === "theater")).toBe(false);
  });

  it("refuses to remove the kitchen or the only bathroom", () => {
    const twoBath = model();
    const { rejected } = applyRevision(twoBath, [{ kind: "remove", target: "kitchen" }]);
    expect(rejected).toHaveLength(1);
    expect(twoBath.rooms.some((r) => r.kind === "kitchen")).toBe(true);
  });

  it("is deterministic", () => {
    const ops = parseRevisionRequest("bigger kitchen, add an office").ops;
    expect(applyRevision(model(), ops)).toEqual(applyRevision(model(), ops));
  });
});

describe("reviseConceptPackage", () => {
  const basePkg = () =>
    runDesignLoop(brief, { lotWidthFt: 60, budgetCents: null, regionCode: "US_NATIONAL" })[0];

  it("produces a re-checked, re-priced revision with lineage", () => {
    const base = basePkg();
    const { pkg, unrecognized } = reviseConceptPackage(base, "make the kitchen much bigger", {
      budgetCents: null,
    });
    expect(unrecognized).toHaveLength(0);
    expect(pkg).not.toBeNull();
    expect(pkg!.revision.parentRevisionId).toBe(`${base.concept.id}-r0`);
    expect(pkg!.revision.changeSummary).toContain("Kitchen");
    expect(pkg!.estimate.totalCents).toBeGreaterThan(base.estimate.totalCents);
    expect(pkg!.checkResults.length).toBeGreaterThan(0);
  });

  it("chains revisions off the latest model", () => {
    const base = basePkg();
    const first = reviseConceptPackage(base, "add an office", { budgetCents: null }).pkg!;
    const withHistory = { ...base, revisions: [first] };
    const second = reviseConceptPackage(withHistory, "add a gym", { budgetCents: null }).pkg!;
    expect(second.revision.parentRevisionId).toBe(first.revision.id);
    expect(second.revision.model.rooms.some((r) => r.kind === "office")).toBe(true);
    expect(second.revision.model.rooms.some((r) => r.kind === "gym")).toBe(true);
  });

  it("returns null with feedback when nothing parses", () => {
    const { pkg, unrecognized } = reviseConceptPackage(basePkg(), "just vibes", { budgetCents: null });
    expect(pkg).toBeNull();
    expect(unrecognized.length).toBeGreaterThan(0);
  });

  it("returns null when every op is rejected", () => {
    const { pkg, unrecognized } = reviseConceptPackage(basePkg(), "remove the kitchen", {
      budgetCents: null,
    });
    expect(pkg).toBeNull();
    expect(unrecognized.length).toBeGreaterThan(0);
  });
});
