/**
 * Construction tracker math (BuildSphere's during-construction slice).
 * Deterministic (ADR-007): the working budget is contract + approved
 * change orders — nothing else moves it; draws are checked against the
 * schedule's plan and paying ahead of the work gets called out loudly,
 * because that is the #1 way owner-builds go wrong.
 */

import type { ConstructionSchedule } from "./schedule";

export interface ChangeOrder {
  id: string;
  description: string;
  /** Positive = adds cost, negative = credit. */
  deltaCents: number;
  status: "proposed" | "approved" | "rejected";
  at: number;
}

export interface DrawPayment {
  milestoneId: string;
  paidCents: number;
  at: number;
}

export interface ConstructionLog {
  changeOrders: ChangeOrder[];
  draws: DrawPayment[];
}

export interface DrawStatus {
  milestoneId: string;
  name: string;
  plannedCents: number;
  paidCents: number;
  status: "unpaid" | "partial" | "paid" | "overpaid";
}

export interface BuildSummary {
  contractCents: number;
  approvedChangeCents: number;
  workingBudgetCents: number;
  paidCents: number;
  remainingCents: number;
  pctPaid: number;
  drawStatus: DrawStatus[];
  warnings: string[];
}

export const EMPTY_LOG: ConstructionLog = { changeOrders: [], draws: [] };

export function summarizeBuild(schedule: ConstructionSchedule, log: ConstructionLog): BuildSummary {
  const approvedChangeCents = log.changeOrders
    .filter((c) => c.status === "approved")
    .reduce((s, c) => s + c.deltaCents, 0);
  const workingBudgetCents = schedule.contractCents + approvedChangeCents;

  const paidByMilestone = new Map<string, number>();
  for (const d of log.draws) {
    paidByMilestone.set(d.milestoneId, (paidByMilestone.get(d.milestoneId) ?? 0) + d.paidCents);
  }
  const paidCents = log.draws.reduce((s, d) => s + d.paidCents, 0);

  const drawStatus: DrawStatus[] = schedule.draws.map((planned) => {
    const paid = paidByMilestone.get(planned.milestoneId) ?? 0;
    let status: DrawStatus["status"] = "unpaid";
    if (paid > planned.amountCents + 100) status = "overpaid";
    else if (paid >= planned.amountCents - 100) status = "paid";
    else if (paid > 0) status = "partial";
    return {
      milestoneId: planned.milestoneId,
      name: planned.name,
      plannedCents: planned.amountCents,
      paidCents: paid,
      status,
    };
  });

  const warnings: string[] = [];
  if (paidCents > workingBudgetCents) {
    warnings.push(
      `Payments exceed the working budget by ${usd(paidCents - workingBudgetCents)} — stop and reconcile with your builder before the next draw.`,
    );
  }
  for (const ds of drawStatus) {
    if (ds.status === "overpaid") {
      warnings.push(`"${ds.name}" is overpaid by ${usd(ds.paidCents - ds.plannedCents)}.`);
    }
  }
  // Paying ahead: a later draw has money while an earlier one is unpaid.
  for (let i = 0; i < drawStatus.length; i++) {
    if (drawStatus[i].paidCents > 0) {
      for (let j = 0; j < i; j++) {
        if (drawStatus[j].paidCents === 0) {
          warnings.push(
            `"${drawStatus[i].name}" has payments while "${drawStatus[j].name}" is unpaid — never pay ahead of inspected, in-place work.`,
          );
          j = i; // one warning per skipped-ahead draw is enough
          break;
        }
      }
    }
  }
  const pendingChanges = log.changeOrders.filter((c) => c.status === "proposed");
  if (pendingChanges.length > 0) {
    const exposure = pendingChanges.reduce((s, c) => s + Math.max(0, c.deltaCents), 0);
    if (exposure > 0) {
      warnings.push(`${pendingChanges.length} proposed change order(s) carry ${usd(exposure)} of exposure — approve or reject them in writing.`);
    }
  }

  return {
    contractCents: schedule.contractCents,
    approvedChangeCents,
    workingBudgetCents,
    paidCents,
    remainingCents: workingBudgetCents - paidCents,
    pctPaid: workingBudgetCents > 0 ? Math.round((paidCents / workingBudgetCents) * 100) : 0,
    drawStatus,
    warnings,
  };
}

function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}
