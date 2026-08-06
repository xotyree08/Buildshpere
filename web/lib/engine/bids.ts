/**
 * Bid package engine: turns an estimate + model into per-trade scopes of
 * work a homeowner can hand to contractors. Deterministic (ADR-007).
 *
 * Two audiences, deliberately separated: bidLines carry quantities but NO
 * prices (an anchored bid is a worse bid), while internalBudgetCents is
 * the owner-side number from our estimate. Quantities are measured from
 * concept drawings and say so (L8) — bidders must verify against final
 * construction documents.
 */

import type { Estimate, ParametricModel } from "../types";
import { takeoff } from "./estimate";

export interface BidLine {
  description: string;
  qty: number;
  unit: string;
}

export interface TradeBidPackage {
  trade: string;
  /** Scope-of-work bullets, parameterized by real takeoff quantities. */
  scope: string[];
  /** Quantities for the bidder to price — intentionally unpriced. */
  bidLines: BidLine[];
  /** Owner-side budget from our estimate. Never printed on the bid sheet. */
  internalBudgetCents: number;
}

export interface OwnerCost {
  description: string;
  amountCents: number;
}

export interface BidPackageSet {
  trades: TradeBidPackage[];
  /** Soft costs & contingency — owner-carried, not bid to trades. */
  ownerCosts: OwnerCost[];
  /** Sum of all trade budgets (the estimate's hard costs). */
  totalTradeBudgetCents: number;
  /** Standing instructions printed on every sheet. */
  instructions: string[];
  facts: {
    livableSqft: number;
    garageSqft: number;
    levels: number;
    baths: number;
    windows: number;
    doors: number;
  };
}

/** Estimate categories that are owner-carried rather than bid to a trade. */
const OWNER_CATEGORIES = new Set(["Soft Costs", "Contingency"]);

interface TradeDef {
  trade: string;
  categories: string[];
  scope: (f: BidPackageSet["facts"]) => string[];
}

const TRADES: TradeDef[] = [
  {
    trade: "Sitework, Concrete & Foundation",
    categories: ["Foundation"],
    scope: (f) => [
      `Excavate, form, and pour footings and slab for approximately ${Math.round(f.livableSqft / f.levels + f.garageSqft).toLocaleString()} sqft of foundation, per plan.`,
      "Include vapor barrier, perimeter insulation to local code, and anchor bolts.",
      "Rough grading to drain away from the foundation on all sides.",
    ],
  },
  {
    trade: "Framing & Structure",
    categories: ["Framing"],
    scope: (f) => [
      `Frame all walls, floors, and roof structure for a ${f.levels === 2 ? "two-story" : "single-story"} home of approximately ${f.livableSqft.toLocaleString()} livable sqft plus garage.`,
      "Lumber grade and engineered members per the stamped structural drawings (by others).",
      "Include exterior sheathing, house wrap, and all structural hardware.",
    ],
  },
  {
    trade: "Roofing",
    categories: ["Roofing"],
    scope: () => [
      "Install roofing system named in the bid lines over the full roof area, including underlayment, starter, ridge, and all flashing.",
      "Ice & water shield at eaves and valleys where required by local code.",
      "Manufacturer warranty registered to the owner.",
    ],
  },
  {
    trade: "Exterior Cladding",
    categories: ["Exterior"],
    scope: () => [
      "Install the siding system named in the bid lines over the full exterior wall area, including trim, corners, and sealants.",
      "Integrate flashing with the window and door installation for a continuous weather barrier.",
    ],
  },
  {
    trade: "Windows & Exterior Doors",
    categories: ["Windows & Doors"],
    scope: (f) => [
      `Supply and install ${f.windows} windows and ${f.doors} doors as scheduled on the plans, sizes per the window/door schedule in the construction documents.`,
      "Flash and seal all openings; verify rough openings with the framer before ordering.",
    ],
  },
  {
    trade: "Plumbing",
    categories: ["Plumbing"],
    scope: (f) => [
      `Rough-in and finish plumbing for ${f.baths} full bathroom(s) and 1 kitchen, including fixtures at the allowance grade named in the bid lines.`,
      "Water heater, hose bibs, and washer connections included; verify fixture count against final plans.",
    ],
  },
  {
    trade: "Electrical",
    categories: ["Electrical"],
    scope: (f) => [
      `Full electrical system for approximately ${f.livableSqft.toLocaleString()} livable sqft: service panel, branch wiring, devices, and fixtures at the allowance grade in the bid lines.`,
      "Include smoke/CO detection to code and exterior fixtures at all entries.",
    ],
  },
  {
    trade: "HVAC",
    categories: ["HVAC"],
    scope: (f) => [
      `Design and install heating and cooling sized by Manual J calculation for approximately ${f.livableSqft.toLocaleString()} sqft${f.levels === 2 ? " across two stories (zoning proposal welcome)" : ""}.`,
      "Include all ductwork, registers, condensate handling, and thermostat.",
    ],
  },
  {
    trade: "Drywall, Paint & Interior Trim",
    categories: ["Interior"],
    scope: () => [
      "Hang, tape, and finish drywall throughout; prime and paint at the grade named in the bid lines.",
      "Install interior doors, casing, and base trim per the finish schedule.",
    ],
  },
  {
    trade: "Flooring",
    categories: ["Flooring"],
    scope: (f) => [
      `Supply and install the flooring named in the bid lines over approximately ${f.livableSqft.toLocaleString()} sqft, including underlayment and transitions.`,
    ],
  },
  {
    trade: "Kitchen & Millwork",
    categories: ["Kitchen"],
    scope: () => [
      "Supply and install cabinets, countertops, and appliances at the grades named in the bid lines, per the kitchen elevations.",
      "Field-measure after drywall; coordinate cutouts with plumbing and electrical.",
    ],
  },
  {
    trade: "Outdoor Living",
    categories: ["Outdoor"],
    scope: () => [
      "Construct the outdoor living area shown on the plans at the allowance in the bid lines.",
    ],
  },
];

export const BID_INSTRUCTIONS = [
  "Quantities are measured from concept drawings — verify all quantities and dimensions against the final construction documents before contracting.",
  "Provide unit and total pricing for each line, your license number, and proof of insurance with your bid.",
  "Exclusions must be listed explicitly; unlisted work within the scope described is included.",
  "Permits and design fees are carried by the owner and are not part of this bid.",
];

export function buildBidPackages(model: ParametricModel, estimate: Estimate): BidPackageSet {
  const q = takeoff(model);
  const facts: BidPackageSet["facts"] = {
    livableSqft: q.livableSqft,
    garageSqft: q.garageSqft,
    levels: q.levels,
    baths: q.baths,
    windows: q.windows,
    doors: q.doors,
  };

  const trades: TradeBidPackage[] = [];
  const claimed = new Set<string>();

  for (const def of TRADES) {
    const lines = estimate.lineItems.filter((li) => def.categories.includes(li.category));
    if (lines.length === 0) continue;
    lines.forEach((li) => claimed.add(li.id));
    trades.push({
      trade: def.trade,
      scope: def.scope(facts),
      bidLines: lines.map((li) => ({ description: li.description, qty: li.qty, unit: li.unit })),
      internalBudgetCents: Math.round(lines.reduce((s, li) => s + li.qty * li.unitCostCents, 0)),
    });
  }

  const ownerCosts: OwnerCost[] = estimate.lineItems
    .filter((li) => OWNER_CATEGORIES.has(li.category))
    .map((li) => {
      claimed.add(li.id);
      return { description: li.description, amountCents: Math.round(li.qty * li.unitCostCents) };
    });

  // L2: an estimate category this engine doesn't know about must fail
  // loudly, not silently vanish from every contractor's scope.
  const orphans = estimate.lineItems.filter((li) => !claimed.has(li.id));
  if (orphans.length > 0) {
    throw new Error(
      `Bid packages don't cover estimate categories: ${[...new Set(orphans.map((o) => o.category))].join(", ")} — add them to a trade in bids.ts.`,
    );
  }

  return {
    trades,
    ownerCosts,
    totalTradeBudgetCents: trades.reduce((s, t) => s + t.internalBudgetCents, 0),
    instructions: BID_INSTRUCTIONS,
    facts,
  };
}
