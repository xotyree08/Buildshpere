/**
 * The artifact status ladder (spec Appendix A): every design artifact
 * carries an explicit authority level, and the system never represents
 * preliminary AI content as professionally approved (spec §2.3, our L8).
 * Only the rungs that exist today are derivable — later rungs (permit
 * submission, issued for construction, as-built) arrive with their systems
 * and are listed here so the ladder is complete and honest about it.
 */

export type DesignStatus =
  | "draft"
  | "preliminary"
  | "under_review"
  | "approved_for_coordination";

export interface StatusInfo {
  key: DesignStatus;
  label: string;
  /** One-sentence meaning, shown as tooltip/subtitle. */
  meaning: string;
  /** CSS class hue used by badges. */
  tone: "muted" | "warn" | "pass";
}

export const STATUS_INFO: Record<DesignStatus, StatusInfo> = {
  draft: {
    key: "draft",
    label: "Draft",
    meaning: "Working content — being edited right now.",
    tone: "muted",
  },
  preliminary: {
    key: "preliminary",
    label: "Preliminary",
    meaning: "AI-generated concept, suitable for evaluation — not for construction or permitting.",
    tone: "muted",
  },
  under_review: {
    key: "under_review",
    label: "Under professional review",
    meaning: "Assigned to a licensed professional for review.",
    tone: "warn",
  },
  approved_for_coordination: {
    key: "approved_for_coordination",
    label: "Approved for coordination",
    meaning: "Reviewed and accepted for downstream coordination — still not a permit or construction set.",
    tone: "pass",
  },
};

/** Future rungs, present so UI can show the full ladder without claiming them. */
export const FUTURE_STATUSES = [
  "Permit Submission",
  "Permit Approved",
  "Issued for Construction",
  "Field Revision",
  "As-Built",
] as const;

export interface StatusInputs {
  /** Latest professional-review status for the project, null when none. */
  reviewStatus: "requested" | "claimed" | "approved" | "changes_requested" | null;
  /** Revisions made after the review concluded invalidate its approval. */
  revisedSinceReview: boolean;
}

/**
 * Derive a concept's status from real system state — never stored, so it
 * can't drift from the facts that justify it.
 */
export function deriveDesignStatus(inputs: StatusInputs): StatusInfo {
  const { reviewStatus, revisedSinceReview } = inputs;
  if (reviewStatus === "approved" && !revisedSinceReview) {
    return STATUS_INFO.approved_for_coordination;
  }
  if (reviewStatus === "requested" || reviewStatus === "claimed") {
    return STATUS_INFO.under_review;
  }
  // changes_requested, approval invalidated by later edits, or no review yet
  // → back to preliminary; "draft" is reserved for unsaved in-progress edits.
  return STATUS_INFO.preliminary;
}
