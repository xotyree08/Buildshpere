import { describe, expect, it } from "vitest";

import { runDesignLoop } from "../engine/loop";
import type { DesignBrief, Project } from "../types";
import { generateReportPdf } from "./report";

const brief: DesignBrief = {
  id: "b1",
  projectId: "p1",
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

const project: Project = {
  id: "p1",
  ownerId: "local",
  name: "Cedar Ridge",
  addressText: null,
  lotWidthFt: 90,
  lotDepthFt: 140,
  budgetCents: 45000000,
  status: "designing",
};

function input() {
  const packages = runDesignLoop(brief, {
    lotWidthFt: 90,
    budgetCents: 45000000,
    regionCode: "US_NATIONAL",
  });
  return { project, packages };
}

describe("generateReportPdf", () => {
  it("produces a real multi-page PDF with a page per concept", () => {
    const { project: p, packages } = input();
    const doc = generateReportPdf({ project: p, packages });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1 + packages.length);
    const bytes = doc.output("arraybuffer");
    expect(bytes.byteLength).toBeGreaterThan(20000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("embeds the project name, disclaimer, and estimate content", () => {
    const { project: p, packages } = input();
    const doc = generateReportPdf({ project: p, packages });
    // jsPDF stores page text uncompressed by default — assert directly.
    const raw = doc.output();
    expect(raw).toContain("Cedar Ridge");
    expect(raw).toContain("Design Report");
    expect(raw).toContain("onbuildsphere.com");
  });

  it("honors the latest revision when one exists", () => {
    const { project: p, packages } = input();
    const doc1 = generateReportPdf({ project: p, packages });
    const revised = [
      {
        ...packages[0],
        revisions: [
          {
            revision: {
              id: "r1",
              conceptId: packages[0].concept.id,
              parentRevisionId: null,
              model: packages[0].concept.model,
              changeSummary: "test",
              healthScore: 42,
            },
            healthScore: 42,
            checkResults: packages[0].checkResults,
            estimate: packages[0].estimate,
            veSuggestions: [],
            rejected: [],
          },
        ],
      },
      ...packages.slice(1),
    ];
    const doc2 = generateReportPdf({ project: p, packages: revised });
    expect(doc2.output()).toContain("Health 42");
    expect(doc1.output()).not.toContain("Health 42");
  });
});
