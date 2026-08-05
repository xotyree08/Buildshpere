import { describe, expect, it } from "vitest";

import { buildBidPackages } from "../engine/bids";
import { estimateRevision } from "../engine/estimate";
import { generateConcepts } from "../engine/generate";
import { buildMaintenancePlan } from "../engine/maintenance";
import { buildSchedule } from "../engine/schedule";
import type { DesignBrief } from "../types";
import { generateBidPackagePdf, generateMaintenancePdf, generateSchedulePdf } from "./documents";

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

const model = generateConcepts(brief, 90)[0].model;
const estimate = estimateRevision(model, "r1");

function isPdf(bytes: ArrayBuffer): boolean {
  return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
}

describe("document PDFs", () => {
  it("bid package: one page per trade, prices left blank", () => {
    const set = buildBidPackages(model, estimate);
    const doc = generateBidPackagePdf("Cedar Ridge", set);
    expect(doc.getNumberOfPages()).toBe(set.trades.length);
    expect(isPdf(doc.output("arraybuffer"))).toBe(true);
    const raw = doc.output();
    expect(raw).toContain("Framing & Structure");
    expect(raw).toContain("Instructions to bidders");
    // The owner's internal budget must never appear on the printed sheets.
    expect(raw).not.toContain("Owner budget");
  });

  it("schedule: gantt, draws to 100%, honesty notes", () => {
    const schedule = buildSchedule(model, estimate);
    const doc = generateSchedulePdf("Cedar Ridge", schedule);
    expect(isPdf(doc.output("arraybuffer"))).toBe(true);
    const raw = doc.output();
    expect(raw).toContain("Construction Schedule");
    expect(raw).toContain("100%");
    expect(raw).toContain("Framing");
  });

  it("maintenance: material-driven tasks flow into the PDF", () => {
    const plan = buildMaintenancePlan({ roofing: "cedar_shake" });
    const doc = generateMaintenancePdf("Cedar Ridge", plan);
    expect(isPdf(doc.output("arraybuffer"))).toBe(true);
    const raw = doc.output();
    expect(raw).toContain("Treat shakes");
    expect(raw).toContain("Year-by-year calendar");
    expect(raw).toContain("not quotes");
  });
});
