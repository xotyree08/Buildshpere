import { describe, expect, it } from "vitest";

import type { DesignBrief } from "../types";
import { generateConcepts } from "./generate";
import { runChecks } from "./checks";
import { buildPermitReadiness, type ReadinessInput } from "./permit";
import { buildSitePlan } from "./site";

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

function baseInput(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  const model = generateConcepts(brief, 60)[0].model;
  return {
    levels: model.levels,
    sqft: 1800,
    checkResults: runChecks(model, "r").results,
    site: buildSitePlan(model, 150, 250), // generous lot → fits
    reviewStatus: null,
    ...overrides,
  };
}

describe("buildPermitReadiness", () => {
  it("approved review + fitting site + no failing checks → submittable, future items remain future", () => {
    const input = baseInput({ reviewStatus: "approved" });
    // sanity: the generated concept has no failing checks on a generous lot
    expect(input.checkResults.some((r) => r.status === "fail")).toBe(false);
    const readiness = buildPermitReadiness(input);
    expect(readiness.submittable).toBe(true);
    expect(readiness.actionNeeded).toBe(0);
    expect(readiness.future).toBe(3);
    expect(readiness.items.find((i) => i.key === "professional_review")?.status).toBe("ready");
  });

  it("site violations surface as action_needed with the violation text", () => {
    const model = generateConcepts(brief, 60)[0].model;
    const tight = buildSitePlan(model, 40, 250); // too narrow
    const readiness = buildPermitReadiness(baseInput({ site: tight, reviewStatus: "approved" }));
    const site = readiness.items.find((i) => i.key === "site_plan")!;
    expect(site.status).toBe("action_needed");
    expect(site.detail).toContain("Side yards");
    expect(readiness.submittable).toBe(false);
  });

  it("failing health checks block submission and name the checks", () => {
    const failing = baseInput({
      reviewStatus: "approved",
      checkResults: [
        { revisionId: "r", check: "accessibility", status: "fail", detail: "No ground-floor bath." },
        { revisionId: "r", check: "storage", status: "warn", detail: "Thin storage." },
      ],
    });
    const readiness = buildPermitReadiness(failing);
    const health = readiness.items.find((i) => i.key === "design_health")!;
    expect(health.status).toBe("action_needed");
    expect(health.detail).toContain("accessibility");
    expect(readiness.submittable).toBe(false);
  });

  it("review states map to the right readiness statuses", () => {
    expect(
      buildPermitReadiness(baseInput({ reviewStatus: null })).items.find((i) => i.key === "professional_review")!.status,
    ).toBe("action_needed");
    expect(
      buildPermitReadiness(baseInput({ reviewStatus: "requested" })).items.find((i) => i.key === "professional_review")!
        .status,
    ).toBe("pending_professional");
    expect(
      buildPermitReadiness(baseInput({ reviewStatus: "claimed" })).items.find((i) => i.key === "professional_review")!
        .status,
    ).toBe("pending_professional");
    const changes = buildPermitReadiness(
      baseInput({ reviewStatus: "changes_requested", reviewNote: "Widen the hall." }),
    ).items.find((i) => i.key === "professional_review")!;
    expect(changes.status).toBe("action_needed");
    expect(changes.detail).toContain("Widen the hall.");
  });

  it("future items are always present and never counted against submittability", () => {
    const readiness = buildPermitReadiness(baseInput({ reviewStatus: "approved" }));
    const futureKeys = readiness.items.filter((i) => i.status === "future").map((i) => i.key);
    expect(futureKeys.sort()).toEqual(["energy", "jurisdiction", "structural"]);
    expect(readiness.submittable).toBe(true);
  });

  it("is deterministic", () => {
    const input = baseInput({ reviewStatus: "requested" });
    expect(buildPermitReadiness(input)).toEqual(buildPermitReadiness(input));
  });
});
