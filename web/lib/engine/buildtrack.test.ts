import { describe, expect, it } from "vitest";

import { summarizeBuild, type ConstructionLog } from "./buildtrack";
import { estimateRevision } from "./estimate";
import { generateConcepts } from "./generate";
import { buildSchedule } from "./schedule";
import type { DesignBrief } from "../types";

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

function schedule() {
  const model = generateConcepts(brief, 90)[0].model;
  return buildSchedule(model, estimateRevision(model, "r1"));
}

describe("summarizeBuild", () => {
  it("working budget = contract + approved change orders only", () => {
    const s = schedule();
    const log: ConstructionLog = {
      changeOrders: [
        { id: "c1", description: "Upgrade to tile shower", deltaCents: 400000, status: "approved", at: 1 },
        { id: "c2", description: "Skylights", deltaCents: 900000, status: "proposed", at: 2 },
        { id: "c3", description: "Delete fireplace", deltaCents: -250000, status: "approved", at: 3 },
        { id: "c4", description: "Gold faucets", deltaCents: 700000, status: "rejected", at: 4 },
      ],
      draws: [],
    };
    const sum = summarizeBuild(s, log);
    expect(sum.approvedChangeCents).toBe(150000);
    expect(sum.workingBudgetCents).toBe(s.contractCents + 150000);
    expect(sum.warnings.some((w) => w.includes("proposed change order"))).toBe(true);
  });

  it("draw statuses: paid, partial, unpaid, overpaid", () => {
    const s = schedule();
    const first = s.draws[0];
    const second = s.draws[1];
    const log: ConstructionLog = {
      changeOrders: [],
      draws: [
        { milestoneId: first.milestoneId, paidCents: first.amountCents, at: 1 },
        { milestoneId: second.milestoneId, paidCents: Math.round(second.amountCents / 2), at: 2 },
      ],
    };
    const sum = summarizeBuild(s, log);
    expect(sum.drawStatus[0].status).toBe("paid");
    expect(sum.drawStatus[1].status).toBe("partial");
    expect(sum.drawStatus[2].status).toBe("unpaid");
    expect(sum.remainingCents).toBe(sum.workingBudgetCents - sum.paidCents);
  });

  it("paying a later draw before an earlier one warns loudly", () => {
    const s = schedule();
    const third = s.draws[2];
    const log: ConstructionLog = {
      changeOrders: [],
      draws: [{ milestoneId: third.milestoneId, paidCents: 100000, at: 1 }],
    };
    const sum = summarizeBuild(s, log);
    expect(sum.warnings.some((w) => w.includes("never pay ahead"))).toBe(true);
  });

  it("overpaying a draw and blowing the budget both warn", () => {
    const s = schedule();
    const first = s.draws[0];
    const log: ConstructionLog = {
      changeOrders: [],
      draws: [{ milestoneId: first.milestoneId, paidCents: s.contractCents + 500000, at: 1 }],
    };
    const sum = summarizeBuild(s, log);
    expect(sum.warnings.some((w) => w.includes("overpaid"))).toBe(true);
    expect(sum.warnings.some((w) => w.includes("exceed the working budget"))).toBe(true);
  });

  it("a clean in-order build produces no warnings and reconciles to 100%", () => {
    const s = schedule();
    const log: ConstructionLog = {
      changeOrders: [],
      draws: s.draws.map((d, i) => ({ milestoneId: d.milestoneId, paidCents: d.amountCents, at: i })),
    };
    const sum = summarizeBuild(s, log);
    expect(sum.warnings).toHaveLength(0);
    expect(sum.pctPaid).toBe(100);
    expect(sum.remainingCents).toBe(0);
    expect(sum.drawStatus.every((d) => d.status === "paid")).toBe(true);
  });
});
