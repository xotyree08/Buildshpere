import { describe, expect, it } from "vitest";

import { shedPhotos, type StoredProject } from "./store";

function project(id: string, photo: string | null): StoredProject {
  return {
    project: {
      id,
      ownerId: "local",
      name: "P",
      addressText: null,
      lotWidthFt: 60,
      lotDepthFt: 120,
      budgetCents: 1000,
      status: "designing",
    },
    brief: null,
    packages: [],
    regionCode: "US_NATIONAL",
    inspiration: photo === null ? undefined : { photoDataUrl: photo, analysis: null },
  };
}

describe("shedPhotos (quota-degradation path, LESSONS L2)", () => {
  it("strips photo payloads but keeps projects and analyses", () => {
    const shed = shedPhotos([project("a", "data:image/jpeg;base64,xxxx"), project("b", null)]);
    expect(shed).toHaveLength(2);
    expect(shed[0].inspiration?.photoDataUrl).toBe("");
    expect(shed[0].inspiration).toBeDefined(); // analysis container survives
    expect(shed[1].inspiration).toBeUndefined();
  });

  it("does not mutate the input", () => {
    const original = project("a", "data:image/jpeg;base64,xxxx");
    shedPhotos([original]);
    expect(original.inspiration?.photoDataUrl).toBe("data:image/jpeg;base64,xxxx");
  });
});
