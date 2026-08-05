import { describe, expect, it } from "vitest";

import { buildBidPackages } from "./bids";
import { estimateRevision } from "./estimate";
import { generateConcepts } from "./generate";
import type { DesignBrief } from "../types";

const brief: DesignBrief = {
  id: "b1",
  projectId: "p1",
  version: 1,
  program: {
    familySize: 4,
    bedrooms: 3,
    bathrooms: 2,
    office: true,
    gym: false,
    theater: false,
    outdoorKitchen: true,
    garageBays: 2,
  },
  style: "craftsman",
  interiors: {},
  lifestyleNotes: "",
};

function sample() {
  const model = generateConcepts(brief, 90)[0].model;
  const estimate = estimateRevision(model, "r1", "US_NATIONAL", { styleKey: "craftsman" });
  return { model, estimate };
}

describe("buildBidPackages", () => {
  it("routes every estimate line into exactly one trade or owner cost", () => {
    const { model, estimate } = sample();
    const set = buildBidPackages(model, estimate);
    const routed = set.trades.reduce((s, t) => s + t.bidLines.length, 0) + set.ownerCosts.length;
    expect(routed).toBe(estimate.lineItems.length);
  });

  it("trade budgets plus owner costs reconcile to the estimate total", () => {
    const { model, estimate } = sample();
    const set = buildBidPackages(model, estimate);
    const ownerTotal = set.ownerCosts.reduce((s, c) => s + c.amountCents, 0);
    expect(set.totalTradeBudgetCents + ownerTotal).toBeCloseTo(estimate.totalCents, -2);
  });

  it("bid lines carry quantities but no prices", () => {
    const { model, estimate } = sample();
    const set = buildBidPackages(model, estimate);
    for (const trade of set.trades) {
      expect(trade.bidLines.length).toBeGreaterThan(0);
      for (const line of trade.bidLines) {
        expect(line.qty).toBeGreaterThan(0);
        expect(Object.keys(line).sort()).toEqual(["description", "qty", "unit"]);
      }
    }
  });

  it("scopes are parameterized with the real takeoff numbers", () => {
    const { model, estimate } = sample();
    const set = buildBidPackages(model, estimate);
    const framing = set.trades.find((t) => t.trade.startsWith("Framing"))!;
    expect(framing.scope.join(" ")).toContain(set.facts.livableSqft.toLocaleString());
    const windows = set.trades.find((t) => t.trade.startsWith("Windows"))!;
    expect(windows.scope.join(" ")).toContain(`${set.facts.windows} windows`);
  });

  it("soft costs and contingency are owner-carried, never bid", () => {
    const { model, estimate } = sample();
    const set = buildBidPackages(model, estimate);
    expect(set.ownerCosts.length).toBe(2);
    const allBidText = set.trades.flatMap((t) => t.bidLines.map((l) => l.description)).join(" ");
    expect(allBidText).not.toContain("Contingency");
    expect(allBidText).not.toContain("permits");
  });

  it("an unknown estimate category fails loudly instead of vanishing", () => {
    const { model, estimate } = sample();
    estimate.lineItems.push({
      id: "li-x",
      estimateId: estimate.id,
      category: "Pool",
      description: "Plunge pool",
      qty: 1,
      unit: "ls",
      unitCostCents: 100,
      source: "allowance",
      confidence: "low",
      sourceDetail: "test",
    });
    expect(() => buildBidPackages(model, estimate)).toThrow(/Pool/);
  });

  it("quantity-verification honesty appears in the standing instructions", () => {
    const { model, estimate } = sample();
    const set = buildBidPackages(model, estimate);
    expect(set.instructions.join(" ")).toMatch(/concept drawings/);
  });
});
