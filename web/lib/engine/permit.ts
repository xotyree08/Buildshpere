/**
 * Permit readiness (PermitSphere's first slice): one synthesized checklist
 * from what the platform already knows — the drawing set, the site plan's
 * setback verdicts, the design health checks, and the professional-review
 * state. Items that require systems still to come (county rules, stamped
 * structural sheets) are labeled "future" — never pretended ready.
 */

import type { DesignCheckResult } from "../types";
import type { SitePlan } from "./site";

export type ReadinessStatus = "ready" | "action_needed" | "pending_professional" | "future";

export interface ReadinessItem {
  key: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
}

export interface PermitReadiness {
  items: ReadinessItem[];
  ready: number;
  actionNeeded: number;
  pendingProfessional: number;
  future: number;
  /** Every present-day item is ready — what remains is future systems. */
  submittable: boolean;
}

export interface ReadinessInput {
  levels: number;
  sqft: number;
  checkResults: DesignCheckResult[];
  site: SitePlan;
  /** Latest professional-review status for the project, null if none. */
  reviewStatus: "requested" | "claimed" | "approved" | "changes_requested" | null;
  reviewNote?: string | null;
}

export function buildPermitReadiness(input: ReadinessInput): PermitReadiness {
  const items: ReadinessItem[] = [];

  items.push({
    key: "floor_plans",
    label: "Floor plans",
    status: "ready",
    detail: `${input.levels === 2 ? "Two levels" : "Single level"}, ${input.sqft.toLocaleString()} sqft, dimensioned per room.`,
  });

  items.push({
    key: "elevations",
    label: "Exterior elevations",
    status: "ready",
    detail: "Front and side elevations with the style's roof profile.",
  });

  if (input.site.fits) {
    items.push({
      key: "site_plan",
      label: "Site plan & setbacks",
      status: "ready",
      detail: `Fits the lot at ${input.site.coverage.pct}% coverage (generic setbacks — county rules arrive with LandSphere).`,
    });
  } else {
    items.push({
      key: "site_plan",
      label: "Site plan & setbacks",
      status: "action_needed",
      detail: input.site.violations.join(" "),
    });
  }

  const fails = input.checkResults.filter((r) => r.status === "fail");
  const warns = input.checkResults.filter((r) => r.status === "warn");
  if (fails.length > 0) {
    items.push({
      key: "design_health",
      label: "Design health",
      status: "action_needed",
      detail: `Failing: ${[...new Set(fails.map((f) => f.check.replace(/_/g, " ")))].join(", ")}. Revise before submitting.`,
    });
  } else {
    items.push({
      key: "design_health",
      label: "Design health",
      status: "ready",
      detail: warns.length > 0 ? `All checks pass or warn (${warns.length} advisory warning${warns.length === 1 ? "" : "s"}).` : "All checks pass.",
    });
  }

  switch (input.reviewStatus) {
    case "approved":
      items.push({
        key: "professional_review",
        label: "Professional review",
        status: "ready",
        detail: "Approved by the reviewing professional.",
      });
      break;
    case "changes_requested":
      items.push({
        key: "professional_review",
        label: "Professional review",
        status: "action_needed",
        detail: input.reviewNote
          ? `Changes requested: ${input.reviewNote}`
          : "Changes requested — revise and re-request review.",
      });
      break;
    case "requested":
    case "claimed":
      items.push({
        key: "professional_review",
        label: "Professional review",
        status: "pending_professional",
        detail: input.reviewStatus === "claimed" ? "In review now." : "Waiting for a professional to claim it.",
      });
      break;
    default:
      items.push({
        key: "professional_review",
        label: "Professional review",
        status: "action_needed",
        detail: "Not yet requested — request it from this page.",
      });
  }

  items.push({
    key: "structural",
    label: "Stamped structural sheets",
    status: "future",
    detail: "Arrives with full EngineerSphere (licensed engineering + digital signatures).",
  });
  items.push({
    key: "energy",
    label: "Energy compliance forms",
    status: "future",
    detail: "Arrives with PermitSphere (Phase 3).",
  });
  items.push({
    key: "jurisdiction",
    label: "County requirements checklist",
    status: "future",
    detail: "Jurisdiction rules engine arrives with PermitSphere (Phase 3).",
  });

  const count = (status: ReadinessStatus) => items.filter((i) => i.status === status).length;
  const actionNeeded = count("action_needed");
  const pendingProfessional = count("pending_professional");

  return {
    items,
    ready: count("ready"),
    actionNeeded,
    pendingProfessional,
    future: count("future"),
    submittable: actionNeeded === 0 && pendingProfessional === 0,
  };
}
