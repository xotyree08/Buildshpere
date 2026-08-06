import { describe, expect, it } from "vitest";

import { numField } from "./forms";

describe("numField", () => {
  it("parses ordinary input", () => {
    expect(numField("450000", { min: 50000, fallback: 450000 })).toBe(450000);
    expect(numField("3", { min: 1, max: 8, fallback: 3 })).toBe(3);
  });

  it("an erased field falls back instead of becoming 0", () => {
    expect(numField("", { min: 1, max: 8, fallback: 3 })).toBe(3);
    expect(numField("   ", { min: 50000, fallback: 450000 })).toBe(450000);
  });

  it("garbage falls back instead of NaN", () => {
    expect(numField("abc", { min: 1, max: 8, fallback: 2 })).toBe(2);
  });

  it("clamps to the field's range", () => {
    expect(numField("99", { min: 1, max: 8, fallback: 3 })).toBe(8);
    expect(numField("0", { min: 1, max: 8, fallback: 3 })).toBe(1);
    expect(numField("-20", { min: 0, max: 4, fallback: 2 })).toBe(0);
  });

  it("rounds to whole numbers unless told otherwise", () => {
    expect(numField("3.7", { min: 1, max: 8, fallback: 3 })).toBe(4);
    expect(numField("3.5", { min: 0, max: 100, fallback: 0, integer: false })).toBe(3.5);
  });
});
