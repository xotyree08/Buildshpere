/**
 * Canonical customer-facing claims (LESSONS_LEARNED.md L8: never sell or
 * list what isn't built). Pages import these strings rather than inlining
 * copy, and claims.test.ts fails the build if the pages stop using them or
 * the numbers drift from the engines.
 */

/** Shown wherever concepts are presented. */
export const CONCEPT_DISCLAIMER =
  "Concepts are AI-assisted screening designs — not construction documents; professional review comes in Phase 2.";

/** Must match CONCEPT_RANGE_PCT in lib/engine/estimate.ts. */
export const ESTIMATE_RANGE_CLAIM = "concept-stage estimates ±15%";
