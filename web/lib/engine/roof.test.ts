import { describe, expect, it } from "vitest";

import { STYLES } from "../catalog/styles";
import type { DesignBrief, HomeStyle } from "../types";
import { generateConcepts } from "./generate";
import { buildIsoScene } from "./iso";
import { massingBias, PORCH_STYLES, roofFor } from "./roof";
import { buildRoof } from "./roofgeom";

function brief(style: HomeStyle): DesignBrief {
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
      theater: false,
      outdoorKitchen: false,
      garageBays: 2,
    },
    style,
    interiors: {},
    lifestyleNotes: "",
  };
}

describe("roofFor", () => {
  it("covers every style in the catalog with a sane spec", () => {
    for (const s of STYLES) {
      const spec = roofFor(s.key);
      expect(["flat", "gable", "hip"]).toContain(spec.form);
      expect(spec.steepness).toBeGreaterThanOrEqual(0);
      expect(spec.steepness).toBeLessThanOrEqual(1.6);
      if (spec.form === "flat") expect(spec.steepness).toBe(0);
      else expect(spec.steepness).toBeGreaterThan(0);
    }
  });

  it("differentiates the icons: Victorian steep, ranch low hip, modern flat, A-frame extreme", () => {
    expect(roofFor("victorian").steepness).toBeGreaterThan(1);
    expect(roofFor("ranch")).toEqual({ form: "hip", steepness: 0.35 });
    expect(roofFor("modern").form).toBe("flat");
    expect(roofFor("a_frame").steepness).toBeGreaterThan(roofFor("cape_cod").steepness);
  });
});

describe("style-aware generation", () => {
  it("porch styles get a real front porch; modern does not", () => {
    const farmhouse = generateConcepts(brief("farmhouse"), 60);
    for (const c of farmhouse) {
      expect(c.model.rooms.some((r) => r.label === "Front Porch")).toBe(true);
    }
    const modern = generateConcepts(brief("modern"), 60);
    for (const c of modern) {
      expect(c.model.rooms.some((r) => r.label === "Front Porch")).toBe(false);
    }
    expect(PORCH_STYLES.has("farmhouse")).toBe(true);
  });

  it("two-story styles lead with the two-story concept; single-story styles with the ranch spread", () => {
    expect(massingBias("victorian")).toBe("two");
    expect(generateConcepts(brief("victorian"), 60)[0].model.levels).toBe(2);
    expect(massingBias("ranch")).toBe("single");
    expect(generateConcepts(brief("ranch"), 60)[0].model.levels).toBe(1);
    expect(massingBias("modern")).toBeNull();
  });

  it("stays deterministic per style", () => {
    expect(generateConcepts(brief("craftsman"), 60)).toEqual(generateConcepts(brief("craftsman"), 60));
  });
});

describe("roof geometry in the massing scene", () => {
  it("flat styles add no roof faces; pitched styles add four per wing, drawn last", () => {
    const modern = generateConcepts(brief("modern"), 60)[0];
    const flatScene = buildIsoScene(modern.model, "modern");
    expect(flatScene.faces.filter((f) => f.roomKey === "roof")).toHaveLength(0);

    const farmhouse = generateConcepts(brief("farmhouse"), 60)[0];
    const scene = buildIsoScene(farmhouse.model, "farmhouse");
    const roof = scene.faces.filter((f) => f.roomKey === "roof");
    // Four facets per wing — two slopes and two ends. A real plan is not one
    // rectangle, so it is not one wing either; the count follows the roof the
    // estimate is priced from rather than a bounding box drawn over it.
    const wings = buildRoof(farmhouse.model, "farmhouse").wings.length;
    expect(wings).toBeGreaterThan(0);
    expect(roof).toHaveLength(4 * wings);
    // roof faces sort after every wall/top face of the building
    const lastNonRoof = Math.max(...scene.faces.map((f, i) => (f.roomKey === "roof" ? -1 : i)));
    const firstRoof = scene.faces.findIndex((f) => f.roomKey === "roof");
    expect(firstRoof).toBeGreaterThan(lastNonRoof);
  });

  it("no style argument means no roof — backward compatible", () => {
    const c = generateConcepts(brief("farmhouse"), 60)[0];
    expect(buildIsoScene(c.model).faces.every((f) => f.roomKey !== "roof")).toBe(true);
  });

  it("hip and gable both produce finite geometry on two-story plans", () => {
    for (const style of ["georgian", "cape_cod"] as const) {
      const two = generateConcepts(brief(style), 60).find((c) => c.model.levels === 2)!;
      const scene = buildIsoScene(two.model, style);
      const roof = scene.faces.filter((f) => f.roomKey === "roof");
      expect(roof).toHaveLength(4 * buildRoof(two.model, style).wings.length);
      for (const f of roof) {
        for (const p of f.points) {
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
        }
      }
    }
  });
});
