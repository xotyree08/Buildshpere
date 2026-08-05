import { describe, expect, it } from "vitest";

import { featureLabel, validateAnalysis } from "./inspiration";

describe("validateAnalysis", () => {
  it("passes through a clean analysis", () => {
    const a = validateAnalysis({
      styleKey: "craftsman",
      secondaryStyleKey: "farmhouse",
      confidence: 0.85,
      levels: 2,
      features: ["front_porch", "columns"],
      notes: "Warm craftsman bungalow with tapered porch columns.",
    });
    expect(a.styleKey).toBe("craftsman");
    expect(a.secondaryStyleKey).toBe("farmhouse");
    expect(a.confidence).toBe(0.85);
    expect(a.levels).toBe(2);
    expect(a.features).toEqual(["front_porch", "columns"]);
  });

  it("clamps unknown styles to null instead of trusting the model", () => {
    const a = validateAnalysis({
      styleKey: "brutalist",
      secondaryStyleKey: "gothic",
      confidence: 0.9,
      levels: 1,
      features: [],
      notes: "",
    });
    expect(a.styleKey).toBeNull();
    expect(a.secondaryStyleKey).toBeNull();
  });

  it("clamps confidence, levels, and junk features", () => {
    const a = validateAnalysis({
      styleKey: "modern",
      secondaryStyleKey: null,
      confidence: 7,
      levels: 5,
      features: ["large_windows", "helipad", "large_windows", 42],
      notes: "x".repeat(1000),
    });
    expect(a.confidence).toBe(1);
    expect(a.levels).toBe(2); // 2+ stories clamp to our generator's two-story maximum
    expect(a.features).toEqual(["large_windows"]);
    expect(a.notes.length).toBeLessThanOrEqual(300);
  });

  it("drops a secondary style equal to the primary", () => {
    const a = validateAnalysis({
      styleKey: "coastal",
      secondaryStyleKey: "coastal",
      confidence: 0.5,
      levels: 1,
      features: [],
      notes: "",
    });
    expect(a.secondaryStyleKey).toBeNull();
  });

  it("survives garbage input entirely", () => {
    for (const junk of [null, undefined, 42, "hello", [], {}]) {
      const a = validateAnalysis(junk);
      expect(a.styleKey).toBeNull();
      expect(a.confidence).toBe(0);
      expect(a.levels).toBe(1);
      expect(a.features).toEqual([]);
    }
  });
});

describe("featureLabel", () => {
  it("humanizes feature keys", () => {
    expect(featureLabel("front_porch")).toBe("Front Porch");
    expect(featureLabel("board_and_batten")).toBe("Board And Batten");
  });
});
