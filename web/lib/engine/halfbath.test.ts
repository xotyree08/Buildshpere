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
