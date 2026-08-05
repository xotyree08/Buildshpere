import { describe, expect, it } from "vitest";

import { DEFAULT_FINISHES, ROOFING, SIDING } from "../catalog/materials";
import { exteriorPalette, shade } from "./palette";
import { deterministicProvider, getRenderProvider } from "./provider";
import { generateConcepts } from "../engine/generate";
import type { DesignBrief } from "../types";

const HEX = /^#[0-9a-f]{6}$/;

describe("exteriorPalette", () => {
  it("every catalog siding and roofing option has a real material mapping", () => {
    for (const siding of SIDING) {
      for (const roofing of ROOFING) {
        const p = exteriorPalette({ siding: siding.key, roofing: roofing.key });
        expect(p.wall).toMatch(HEX);
        expect(p.roof).toMatch(HEX);
        expect(p.wallShade).not.toBe(p.wall);
        expect(p.roofShade).not.toBe(p.roof);
      }
    }
  });

  it("material colors differ across selections — picking brick visibly changes the render", () => {
    const fiber = exteriorPalette({ siding: "fiber_cement" });
    const brick = exteriorPalette({ siding: "brick_veneer" });
    expect(brick.wall).not.toBe(fiber.wall);
    expect(brick.wallTexture).toBe("brick");
    expect(exteriorPalette({ roofing: "metal_standing_seam" }).roofTexture).toBe("standing_seam");
  });

  it("unknown or absent keys degrade to the default selection, never crash", () => {
    const fallback = exteriorPalette({ siding: "unobtanium", roofing: "" });
    expect(fallback).toEqual(exteriorPalette(undefined));
    expect(fallback).toEqual(
      exteriorPalette({ siding: DEFAULT_FINISHES.siding, roofing: DEFAULT_FINISHES.roofing }),
    );
  });

  it("shade darkens every channel and stays a valid color", () => {
    expect(shade("#808080", 0.5)).toBe("#404040");
    expect(shade("#ffffff", 0.72)).toMatch(HEX);
    expect(shade("#000000", 0.5)).toBe("#000000");
  });
});

describe("render provider seam", () => {
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
    style: "craftsman",
    interiors: {},
    lifestyleNotes: "",
  };

  it("the registry returns the deterministic provider, which emits the same palette the views draw", async () => {
    const provider = getRenderProvider();
    expect(provider).toBe(deterministicProvider);

    const model = generateConcepts(brief, 60)[0].model;
    const output = await provider.renderExterior({
      model,
      style: "craftsman",
      finishes: { siding: "cedar", roofing: "slate" },
    });
    expect(output.kind).toBe("palette");
    if (output.kind === "palette") {
      expect(output.palette).toEqual(exteriorPalette({ siding: "cedar", roofing: "slate" }));
    }
  });
});
