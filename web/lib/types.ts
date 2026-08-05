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
  | "modern"
  | "traditional"
  | "farmhouse"
  | "mediterranean"
  | "luxury_contemporary"
  | "scandinavian"
  | "coastal"
  | "mountain";

export interface ProgramRequirements {
  familySize: number;
  bedrooms: number;
  bathrooms: number;
  office: boolean;
  gym: boolean;
  theater: boolean;
  outdoorKitchen: boolean;
  garageBays: number;
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
}

export interface Estimate {
  id: string;
  revisionId: string;
  totalCents: number;
  lowCents: number;
  highCents: number;
  regionCode: string;
  lineItems: EstimateLineItem[];
}

export interface ValueEngineeringSuggestion {
  id: string;
  estimateId: string;
  description: string;
  savingsCents: number;
  designImpact: "low" | "med" | "high";
  status: "proposed" | "accepted" | "dismissed";
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
