import { describe, expect, it } from "vitest";

import { estimateRevision } from "./estimate";
import { generateConcepts } from "./generate";
import { furnishRoom } from "./interiors";
import { buildPlumbingPlan } from "./plumbing";
import type { DesignBrief } from "../types";

function brief(bathrooms: number): DesignBrief {
  return {
    id: "b1",
    projectId: "p1",
    version: 1,
    program: {
      familySize: 4,
      bedrooms: 3,
      bathrooms,
      office: false,
      gym: false,
      theater: false,
      outdoorKitchen: false,
      garageBays: 2,
    },
    style: "craftsman",
    interiors: {},
    lifestyleNotes: "",
  };
}

describe("half baths", () => {
  it("2.5 baths generates two full baths plus a small powder room", () => {
    const model = generateConcepts(brief(2.5), 90)[0].model;
    const baths = model.rooms.filter((r) => r.kind === "bathroom");
    expect(baths).toHaveLength(3);
    const powder = baths.find((r) => r.label === "Powder Room")!;
    expect(powder).toBeDefined();
    const area = powder.rect[2] * powder.rect[3];
    expect(area).toBeLessThan(40); // genuinely a powder room, not a third bath
    expect(generateConcepts(brief(2.5), 90)[0].baths).toBe(2.5);
  });

  it("whole numbers generate no powder room", () => {
    const model = generateConcepts(brief(2), 90)[0].model;
    const baths = model.rooms.filter((r) => r.kind === "bathroom");
    expect(baths).toHaveLength(2);
    expect(baths.some((r) => /powder/i.test(r.label))).toBe(false);
  });

  it("the estimate prices the powder room as half a bath", () => {
    const model = generateConcepts(brief(2.5), 90)[0].model;
    const estimate = estimateRevision(model, "r1");
    const bathLine = estimate.lineItems.find((li) => li.description.includes("Bath rough-in"))!;
    expect(bathLine.qty).toBe(2.5);
  });

  it("the plumbing plan gives the powder room no shower", () => {
    const model = generateConcepts(brief(2.5), 90)[0].model;
    const plan = buildPlumbingPlan(model);
    const powder = plan.rooms.find((r) => /powder/i.test(r.room.label))!;
    const types = powder.fixtures.map((f) => f.type);
    expect(types).toContain("lavatory");
    expect(types).toContain("toilet");
    expect(types).not.toContain("shower_tub");
    const fullBath = plan.rooms.find((r) => r.room.label === "Primary Bath")!;
    expect(fullBath.fixtures.map((f) => f.type)).toContain("shower_tub");
  });

  it("staging never puts a shower in the powder room", () => {
    const model = generateConcepts(brief(2.5), 90)[0].model;
    const powder = model.rooms.find((r) => /powder/i.test(r.label))!;
    const items = furnishRoom(powder);
    expect(items.some((i) => i.label.includes("Shower"))).toBe(false);
  });
});

describe("target square footage", () => {
  const withSqft = (targetSqft?: number): DesignBrief => ({
    ...brief(2),
    program: { ...brief(2).program, targetSqft },
  });

  const livableSqft = (b: DesignBrief) =>
    Math.round(
      generateConcepts(b, 90)[0]
        .model.rooms.filter((r) => r.kind !== "garage" && r.kind !== "outdoor")
        .reduce((s, r) => s + r.rect[2] * r.rect[3], 0),
    );

  it("a 2,600 sqft target lands within ~12% of it", () => {
    const sqft = livableSqft(withSqft(2600));
    expect(Math.abs(sqft - 2600) / 2600).toBeLessThan(0.12);
  });

  it("bigger target genuinely grows the home; absent target is unchanged behavior", () => {
    const auto = livableSqft(withSqft(undefined));
    const big = livableSqft(withSqft(3400));
    const small = livableSqft(withSqft(1200));
    expect(big).toBeGreaterThan(auto);
    expect(small).toBeLessThan(auto);
    // Clamp floor: rooms never shrink below usability even for absurd targets.
    expect(livableSqft(withSqft(600))).toBeGreaterThan(900);
  });
});
