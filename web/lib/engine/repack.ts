/**
 * The composition point where costing is handed its way back to geometry.
 *
 * Value engineering needs to know what a house costs without its theatre, and
 * the only honest way to know is to re-pack the house without it and price
 * that. But costing must not reach down and do the re-packing itself: geometry
 * sits above cost in this codebase's layer order, and an import the other way
 * makes the two mutually reachable and the dependency graph cyclic.
 *
 * So costing declares the shape of what it needs — `Repack` — and this module,
 * which sits above both, supplies it.
 */

import type { ParametricModel } from "../types";
import type { Repack } from "./estimate";
import { applyRevision } from "./revise";

/** Re-pack a plan with one room removed, or null if it could not be removed. */
export const repackWithout: Repack = (model: ParametricModel, label: string) => {
  const removed = applyRevision(model, [{ kind: "remove", target: label }]);
  return removed.applied.length === 0 ? null : removed.model;
};
