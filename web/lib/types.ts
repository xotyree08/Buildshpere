/**
 * BuildSphere MVP domain model.
 * Mirrors docs/MVP_PHASE1.md — that document is the contract; change it first.
 */

export type SubscriptionTier = "free" | "homeowner" | "professional" | "business" | "enterprise";

export type UserRole = "homeowner"; // grows in Phase 2: architect, engineer, contractor, ...

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  subscriptionTier: SubscriptionTier;
}

export type ProjectStatus = "designing" | "review_requested" | "archived";

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  addressText: string | null;
  lotWidthFt: number | null;
  lotDepthFt: number | null;
  budgetCents: number | null;
  status: ProjectStatus;
}

// ---------- Design brief (interview) ----------

export type HomeStyle =
  // Modern & Contemporary
  | "modern"
  | "contemporary"
  | "mid_century_modern"
  | "minimalist"
  | "industrial"
  | "scandinavian"
  | "japandi"
  // Classic American
  | "traditional"
  | "colonial"
  | "georgian"
  | "cape_cod"
  | "craftsman"
  | "victorian"
  | "prairie"
  | "ranch"
  // European
  | "tudor"
  | "french_country"
  | "mediterranean"
  | "spanish_revival"
  // Rustic & Country
  | "farmhouse"
  | "modern_farmhouse"
  | "cottage"
  | "mountain"
  | "barndominium"
  | "a_frame"
  // Coastal & Resort
  | "coastal"
  | "tropical"
  | "luxury_contemporary";

export interface ProgramRequirements {
  familySize: number;
  bedrooms: number;
  bathrooms: number;
  office: boolean;
  gym: boolean;
  theater: boolean;
  outdoorKitchen: boolean;
  garageBays: number;
  /** Desired livable square footage; absent = sized from the program. */
  targetSqft?: number;
}

export interface InteriorPreferences {
  flooring?: string;
  paint?: string;
  cabinets?: string;
  countertops?: string;
  lighting?: string;
  appliances?: string;
  furniture?: string;
}

export interface DesignBrief {
  id: string;
  projectId: string;
  version: number;
  program: ProgramRequirements;
  style: HomeStyle;
  interiors: InteriorPreferences;
  lifestyleNotes: string;
}

// ---------- Parametric design model (ADR-006) ----------

export type RoomKind =
  | "bedroom"
  | "bathroom"
  | "kitchen"
  | "living"
  | "dining"
  | "office"
  | "gym"
  | "theater"
  | "garage"
  | "mudroom"
  | "laundry"
  | "hallway"
  | "closet"
  | "outdoor";

export interface Room {
  key: string;
  kind: RoomKind;
  label: string;
  level: number;
  /** Simple rectilinear footprint for MVP: [x, y, width, depth] in feet. */
  rect: [number, number, number, number];
}

export interface Opening {
  key: string;
  kind: "door" | "window" | "opening";
  roomKey: string;
  wall: "n" | "s" | "e" | "w";
  offsetFt: number;
  widthFt: number;
}

export interface ParametricModel {
  schemaVersion: 1;
  levels: number;
  rooms: Room[];
  openings: Opening[];
}

export interface DesignConcept {
  id: string;
  briefId: string;
  label: string;
  style: HomeStyle;
  sqft: number;
  beds: number;
  baths: number;
  model: ParametricModel;
}

export interface DesignRevision {
  id: string;
  conceptId: string;
  parentRevisionId: string | null;
  changeSummary: string;
  model: ParametricModel;
  healthScore: number; // 0–100 composite of check results
}

// ---------- Design health checks ----------

export type CheckKey =
  | "door_swings"
  | "hallway_widths"
  | "accessibility"
  | "furniture_clearance"
  | "kitchen_triangle"
  | "storage"
  | "natural_lighting"
  | "privacy"
  | "hvac_space"
  | "structural_spans";

export type CheckStatus = "pass" | "warn" | "fail";

export interface DesignCheckResult {
  revisionId: string;
  check: CheckKey;
  status: CheckStatus;
  detail: string;
  /** Optional anchor into the plan (room/opening keys). */
  location?: { roomKey?: string; openingKey?: string };
}

// ---------- Cost ----------

export type LineItemSource = "takeoff" | "allowance";

export interface EstimateLineItem {
  id: string;
  estimateId: string;
  category: string;
  description: string;
  qty: number;
  unit: string;
  unitCostCents: number;
  source: LineItemSource;
  /**
   * Pricing confidence (spec §22.3 launch gate). "high" is reserved for
   * vendor quotes, which don't exist yet — model-measured quantities price
   * at "medium", allowances at "low". Never overstated.
   */
  confidence: "high" | "medium" | "low";
  /** Human-readable provenance: price book version, factors applied, selection. */
  sourceDetail: string;
}

export interface Estimate {
  id: string;
  revisionId: string;
  totalCents: number;
  lowCents: number;
  highCents: number;
  regionCode: string;
  lineItems: EstimateLineItem[];
  /** Which price book priced this estimate. */
  priceBookVersion: string;
  /** ISO timestamp when priced (spec BS-COST-003: pricing date shown). */
  pricedAt: string;
}

/** Machine-readable action behind a VE suggestion; absent = advisory only. */
export type VeAction =
  | { kind: "set_finish"; field: string; option: string }
  | { kind: "remove_room"; target: string };

export interface ValueEngineeringSuggestion {
  id: string;
  estimateId: string;
  description: string;
  savingsCents: number;
  designImpact: "low" | "med" | "high";
  status: "proposed" | "accepted" | "dismissed";
  action?: VeAction;
}

// ---------- Rendering ----------

export type RenderKind = "preview" | "still" | "pano360" | "walkthrough";
export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface RenderJob {
  id: string;
  revisionId: string;
  kind: RenderKind;
  status: JobStatus;
  credits: number;
  error: string | null;
}

export interface RenderAsset {
  id: string;
  jobId: string;
  url: string;
  kind: RenderKind;
  width: number;
  height: number;
}

// ---------- Site constraints (BS-LAND-004) ----------

export type ConstraintKind =
  | "zoning"
  | "easement"
  | "flood"
  | "hoa"
  | "tree"
  | "soil"
  | "utility"
  | "access"
  | "other";

export type ConstraintSeverity = "info" | "caution" | "blocking";

/** User-entered site constraint — the register keeps history via status,
 * and everything is labeled by its source (no pretended parcel data). */
export interface SiteConstraint {
  id: string;
  kind: ConstraintKind;
  severity: ConstraintSeverity;
  note: string;
  status: "open" | "resolved";
  /** Only 'user-entered' exists today; parcel-data sources arrive with LandSphere. */
  source: "user-entered";
}
