import { describe, expect, it } from "vitest";

import type { ParametricModel } from "../types";
import { runChecks } from "./checks";
import { estimateRevision, takeoff } from "./estimate";
import PLANS from "./__fixtures__/plans.json";

/**
 * Design health, frozen.
 *
 * `healthScore` is not a diagnostic — it is persisted on every revision, shown
 * as the headline number on a concept, plotted across a project's history, and
 * used to rank concepts against each other. It is also computed as a weighted
 * average over a table of checks, which means adding ONE check moves the score
 * of every plan that ever existed, whether or not any plan got better.
 *
 * A lot of work is queued behind this file — rule packages, MEP status, a
 * scored plan graph — and each of those wants to add or reword a check. This
 * is the artifact that makes such a change visible instead of silent. If a
 * number below moves, either the change was meant to move it, in which case
 * update it deliberately and say why in the commit, or it was not, in which
 * case something has gone wrong that nobody would otherwise have seen.
 *
 * The plans are literal JSON rather than generator output, so they hold still
 * while the layout engine changes underneath them. See __fixtures__/README.md.
 */

const plans = PLANS as unknown as Record<string, ParametricModel>;

/** Today's scores. Change these deliberately, never to make a test pass. */
const FROZEN: Record<string, number> = {
  "modest-ranch": 92,
  "modern-two-storey": 87,
  "large-craftsman": 82,
  "compact-colonial": 76,
  "wide-farmhouse": 92,
  "cape-cod-office": 95,
  "a-frame-small": 92,
  "coastal-theater": 96,
};

describe("design health is frozen against plans that do not move", () => {
  it("the fixtures are intact and cover both storey counts", () => {
    expect(Object.keys(plans)).toHaveLength(8);
    const levels = new Set(Object.values(plans).map((p) => p.levels));
    expect(levels.has(1)).toBe(true);
    expect(levels.has(2)).toBe(true);
    for (const [name, plan] of Object.entries(plans)) {
      expect(plan.rooms.length, name).toBeGreaterThan(8);
      expect(plan.openings.length, name).toBeGreaterThan(8);
    }
  });

  it("scores exactly what it scored the day this was written", () => {
    const now: Record<string, number> = {};
    for (const [name, plan] of Object.entries(plans)) now[name] = runChecks(plan, "frozen").score;
    expect(now).toEqual(FROZEN);
  });

  it("every check still reports on every plan, so none has silently stopped running", () => {
    // A check that throws or returns nothing would not move the score in a way
    // this file would notice if its weight happened to cancel out.
    for (const [name, plan] of Object.entries(plans)) {
      const report = runChecks(plan, "frozen");
      expect(report.results.length, name).toBeGreaterThan(0);
      for (const result of report.results) {
        expect(["pass", "warn", "fail"], `${name}/${result.check}`).toContain(result.status);
        expect(result.check, name).toBeTruthy();
      }
    }
  });

  it("quantities and price hold too, so a takeoff change cannot pass unnoticed", () => {
    // The same argument as the score: these numbers are shown to customers and
    // are the basis of every downstream document.
    const quantities: Record<string, number> = {};
    const totals: Record<string, number> = {};
    for (const [name, plan] of Object.entries(plans)) {
      quantities[name] = takeoff(plan).grossFloorSqft;
      totals[name] = estimateRevision(plan, "frozen").totalCents;
    }
    expect({ quantities, totals }).toEqual(FROZEN_QUANTITIES);
  });
});

/** Today's gross floor area and total price, per plan. */
const FROZEN_QUANTITIES = {
  quantities: {
    "modest-ranch": 2365,
    "modern-two-storey": 2343,
    "large-craftsman": 3509,
    "compact-colonial": 1863,
    "wide-farmhouse": 2679,
    "cape-cod-office": 2480,
    "a-frame-small": 1641,
    "coastal-theater": 2878,
  },
  totals: {
    "modest-ranch": 40013741,
    "modern-two-storey": 40355766,
    "large-craftsman": 60219958,
    "compact-colonial": 33799075,
    "wide-farmhouse": 47845750,
    "cape-cod-office": 41589742,
    "a-frame-small": 33937952,
    "coastal-theater": 50002920,
  },
};
