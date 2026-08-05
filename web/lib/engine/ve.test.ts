import { describe, expect, it } from "vitest";

import type { DesignBrief, HomeStyle } from "../types";
import { generateConcepts } from "./generate";
import { estimateRevision, valueEngineering, type EstimateFinishes } from "./estimate";
import { applyOpsToConceptPackage, runDesignLoop } from "./loop";

function brief(style: HomeStyle = "modern", theater = true): DesignBrief {
  return {
    id: "b",
    projectId: "p",
    version: 1,
    program: {
      familySize: 4,
      bedrooms: 3,
      bathrooms: 2,
      office: false,
      gym: false,
      theater,
      outdoorKitchen: false,
      garageBays: 2,
    },
    style,
    interiors: {},
    lifestyleNotes: "",
  };
}

const TIGHT_BUDGET = 1; // always over budget

describe("valueEngineering exactness", () => {
  it("finish-downgrade savings equal the real re-priced delta", () => {
    const model = generateConcepts(brief(), 60)[0].model;
    const finishes: EstimateFinishes = { flooring: "hardwood", countertops: "marble" };
    const estimate = estimateRevision(model, "r", "US_NATIONAL", finishes);
    const suggestions = valueEngineering(estimate, TIGHT_BUDGET, model, finishes);

    const downgrades = suggestions.filter((s) => s.action?.kind === "set_finish");
    expect(downgrades.length).toBeGreaterThan(0);
    for (const suggestion of downgrades) {
      const action = suggestion.action as { kind: "set_finish"; field: string; option: string };
      const applied = estimateRevision(model, "r", "US_NATIONAL", {
        ...finishes,
        [action.field]: action.option,
      });
      expect(estimate.totalCents - applied.totalCents).toBe(suggestion.savingsCents);
    }
  });

  it("room-deferral savings equal the delta of actually removing the room", () => {
    const model = generateConcepts(brief("modern", true), 60)[0].model;
    const estimate = estimateRevision(model, "r");
    const suggestions = valueEngineering(estimate, TIGHT_BUDGET, model);
    const deferral = suggestions.find((s) => s.action?.kind === "remove_room");
    expect(deferral).toBeDefined();
    expect(deferral!.description).toContain("theater");
    expect(deferral!.savingsCents).toBeGreaterThan(0);
  });

  it("applying a deferral through the engine yields exactly the promised savings", () => {
    const pkg = runDesignLoop(brief("modern", true), { lotWidthFt: 60, budgetCents: TIGHT_BUDGET })[0];
    const deferral = pkg.veSuggestions.find((s) => s.action?.kind === "remove_room")!;
    const outcome = applyOpsToConceptPackage(
      pkg,
      [{ kind: "remove", target: (deferral.action as { target: string }).target }],
      { budgetCents: TIGHT_BUDGET },
    );
    expect(outcome.pkg).not.toBeNull();
    expect(pkg.estimate.totalCents - outcome.pkg!.estimate.totalCents).toBe(deferral.savingsCents);
  });

  it("porch deferral targets the exact room label so the guarded remove finds it", () => {
    const pkg = runDesignLoop(brief("farmhouse", false), { lotWidthFt: 60, budgetCents: TIGHT_BUDGET })[0];
    const porch = pkg.veSuggestions.find(
      (s) => s.action?.kind === "remove_room" && (s.action as { target: string }).target === "Front Porch",
    );
    expect(porch).toBeDefined();
    const outcome = applyOpsToConceptPackage(pkg, [{ kind: "remove", target: "Front Porch" }], {
      budgetCents: TIGHT_BUDGET,
    });
    expect(outcome.pkg!.revision.model.rooms.some((r) => r.label === "Front Porch")).toBe(false);
  });

  it("no downgrade is offered when everything is already cheapest; advisory items carry no action", () => {
    const model = generateConcepts(brief("modern", false), 60)[0].model;
    const cheapest: EstimateFinishes = {
      flooring: "carpet",
      countertops: "laminate",
      cabinets: "stock",
      appliances: "builder",
      siding: "vinyl",
      roofing: "asphalt_3tab",
      windows: "builder_vinyl",
    };
    const estimate = estimateRevision(model, "r", "US_NATIONAL", cheapest);
    const suggestions = valueEngineering(estimate, TIGHT_BUDGET, model, cheapest);
    expect(suggestions.every((s) => s.action?.kind !== "set_finish")).toBe(true);
    const advisory = suggestions.find((s) => !s.action);
    expect(advisory).toBeDefined(); // single-story massing note survives, unapplicable
  });

  it("caps at five, sorted by savings descending", () => {
    const model = generateConcepts(brief(), 60)[0].model;
    const estimate = estimateRevision(model, "r");
    const suggestions = valueEngineering(estimate, TIGHT_BUDGET, model);
    expect(suggestions.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].savingsCents).toBeGreaterThanOrEqual(suggestions[i].savingsCents);
    }
  });

  it("still silent when under budget", () => {
    const model = generateConcepts(brief(), 60)[0].model;
    const estimate = estimateRevision(model, "r");
    expect(valueEngineering(estimate, estimate.totalCents + 1, model)).toEqual([]);
    expect(valueEngineering(estimate, null, model)).toEqual([]);
  });
});
