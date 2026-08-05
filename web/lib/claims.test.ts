import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { CONCEPT_DISCLAIMER, ESTIMATE_RANGE_CLAIM } from "./claims";
import { SPHERES } from "./spheres";
import { generateConcepts } from "./engine/generate";
import { estimateRevision } from "./engine/estimate";
import type { DesignBrief } from "./types";

/**
 * Claims-drift tests (LESSONS_LEARNED.md L8): the build fails if customer-
 * facing claims stop matching the code that backs them — the pattern that
 * kept WHOLE's store listing honest.
 */

const WEB_ROOT = join(__dirname, "..");

function source(relPath: string): string {
  return readFileSync(join(WEB_ROOT, relPath), "utf8");
}

describe("claims stay wired to the UI", () => {
  it("the project page renders the canonical concept disclaimer and range claim", () => {
    const page = source("app/app/project/[id]/page.tsx");
    expect(page).toContain("CONCEPT_DISCLAIMER");
    expect(page).toContain("ESTIMATE_RANGE_CLAIM");
  });

  it("the design report carries the same canonical claims", () => {
    const page = source("app/app/project/[id]/report/page.tsx");
    expect(page).toContain("CONCEPT_DISCLAIMER");
    expect(page).toContain("ESTIMATE_RANGE_CLAIM");
  });

  it("the landing page shows every sphere with its roadmap phase — nothing unshipped presented as live", () => {
    const page = source("app/page.tsx");
    expect(page).toContain("Phase {s.phase}");
    for (const sphere of SPHERES) {
      expect(sphere.phase).toBeGreaterThanOrEqual(1);
      expect(sphere.phase).toBeLessThanOrEqual(5);
    }
    // Phases beyond 1 exist and are labeled — the roadmap is visible, not hidden.
    expect(SPHERES.some((s) => s.phase > 1)).toBe(true);
  });
});

describe("claims stay true to the engines", () => {
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

  it("the ±15% claim matches the engine's actual concept range", () => {
    const claimed = /±(\d+)%/.exec(ESTIMATE_RANGE_CLAIM);
    expect(claimed).not.toBeNull();
    const pct = Number(claimed![1]) / 100;

    const model = generateConcepts(brief, 60)[0].model;
    const est = estimateRevision(model, "r");
    expect(est.lowCents).toBe(Math.round(est.totalCents * (1 - pct)));
    expect(est.highCents).toBe(Math.round(est.totalCents * (1 + pct)));
  });

  it("estimates always carry an honest range, never a single false-precision number", () => {
    const model = generateConcepts(brief, 60)[0].model;
    const est = estimateRevision(model, "r");
    expect(est.lowCents).toBeLessThan(est.totalCents);
    expect(est.highCents).toBeGreaterThan(est.totalCents);
  });

  it("the disclaimer names what concepts are not", () => {
    expect(CONCEPT_DISCLAIMER).toContain("not construction documents");
  });
});
