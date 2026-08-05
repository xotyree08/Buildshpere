import { describe, expect, it } from "vitest";

import { estimateRevision } from "./estimate";
import { generateConcepts } from "./generate";
import { buildSchedule } from "./schedule";
import type { DesignBrief } from "../types";

function brief(style: DesignBrief["style"], bedrooms: number): DesignBrief {
  return {
    id: "b1",
    projectId: "p1",
    version: 1,
    program: {
      familySize: 4,
      bedrooms,
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

function sample(style: DesignBrief["style"] = "craftsman", bedrooms = 3) {
  const model = generateConcepts(brief(style, bedrooms), 90)[0].model;
  const estimate = estimateRevision(model, "r1");
  return { model, estimate, schedule: buildSchedule(model, estimateRevision(model, "r1")) };
}

describe("buildSchedule", () => {
  it("produces a contiguous critical path ending at totalWeeks", () => {
    const { schedule } = sample();
    const critical = schedule.milestones.filter((m) => m.id !== "exterior");
    for (let i = 1; i < critical.length; i++) {
      expect(critical[i].startWeek).toBe(critical[i - 1].startWeek + critical[i - 1].weeks);
    }
    const last = critical[critical.length - 1];
    expect(schedule.totalWeeks).toBe(last.startWeek + last.weeks);
  });

  it("exterior work overlaps drywall instead of extending the timeline", () => {
    const { schedule } = sample();
    const exterior = schedule.milestones.find((m) => m.id === "exterior")!;
    const drywall = schedule.milestones.find((m) => m.id === "drywall")!;
    expect(exterior.startWeek).toBe(drywall.startWeek);
  });

  it("draws sum exactly to the contract amount, to the cent", () => {
    const { schedule } = sample();
    const total = schedule.draws.reduce((s, d) => s + d.amountCents, 0);
    expect(total).toBe(schedule.contractCents);
    expect(schedule.draws.reduce((s, d) => s + d.pct, 0)).toBe(100);
  });

  it("the contract excludes owner-carried soft costs and contingency", () => {
    const { estimate, schedule } = sample();
    expect(schedule.contractCents).toBeLessThan(estimate.totalCents);
    const ownerCents = estimate.lineItems
      .filter((li) => li.category === "Soft Costs" || li.category === "Contingency")
      .reduce((s, li) => s + li.qty * li.unitCostCents, 0);
    expect(schedule.contractCents + Math.round(ownerCents)).toBeCloseTo(estimate.totalCents, -2);
  });

  it("every draw is tied to a real milestone", () => {
    const { schedule } = sample();
    const ids = new Set(schedule.milestones.map((m) => m.id));
    for (const d of schedule.draws) expect(ids.has(d.milestoneId)).toBe(true);
  });

  it("bigger homes take longer to frame and finish", () => {
    const small = sample("craftsman", 2).schedule;
    const large = sample("craftsman", 6).schedule;
    expect(large.totalWeeks).toBeGreaterThan(small.totalWeeks);
  });

  it("trade names match the bid package vocabulary", () => {
    const { schedule } = sample();
    const trades = new Set(schedule.milestones.flatMap((m) => m.trades));
    expect(trades.has("Framing & Structure")).toBe(true);
    expect(trades.has("Plumbing")).toBe(true);
  });

  it("honesty notes: planning tool, not a commitment", () => {
    const { schedule } = sample();
    expect(schedule.notes.join(" ")).toMatch(/not a builder's commitment/);
  });
});
