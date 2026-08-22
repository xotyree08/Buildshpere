/**
 * Jurisdiction profiles (BS-PERM-001): what a particular authority wants in a
 * permit package, and which of those things this platform can actually produce.
 *
 * This is the step from permit *readiness* to permit *assembly*. Readiness
 * answers "is the design in a state worth submitting"; assembly answers "here
 * is the list of documents this office asks for, and here is where each one
 * comes from".
 *
 * The honesty constraint is the same one that governs the professional
 * directory and the estimate: **nothing here is authoritative jurisdiction
 * data.** No county has been scraped, no code official consulted. A profile is
 * either the generic residential template or something the owner typed in
 * after reading their own building department's page. `JURISDICTION_DISCLAIMER`
 * says so and travels with every assembled package, because a document
 * checklist that looks official is worse than no checklist — it invites
 * someone to stop checking.
 *
 * Data-driven on purpose (§30/§31). A requirement is a row, not a branch, so a
 * real jurisdiction dataset can replace the template without touching this
 * logic.
 */

import { GENERIC_SETBACKS, sanitizeSetbacks, type SetbackRules } from "./site";

export const JURISDICTION_DISCLAIMER =
  "This is a generic residential checklist, not your jurisdiction's official requirements. BuildSphere has not obtained requirements from any building department — confirm the list with yours before you submit.";

/**
 * Where a required document comes from.
 *
 * The distinction that matters is `generated` versus everything else: those
 * are the ones this platform hands over, and the rest is work somebody still
 * has to do. Reporting them all as one list, with sources, is what stops the
 * package from looking finished when it is not.
 */
export type DocumentSource =
  /** BuildSphere produces it from the model. */
  | "generated"
  /** Needs a licensed professional's seal or calculation. */
  | "professional"
  /** The owner obtains it — a survey, a deed, a fee receipt. */
  | "owner";

export interface DocumentRequirement {
  key: string;
  label: string;
  source: DocumentSource;
  detail: string;
}

export interface JurisdictionProfile {
  id: string;
  name: string;
  /** Two-letter state or province code, uppercased; empty when unstated. */
  region: string;
  /** e.g. "2021 IRC". Free text — editions vary and are amended locally. */
  codeEdition: string;
  setbacks: SetbackRules;
  requirements: DocumentRequirement[];
  /** `generic` until somebody edits it; `user_entered` afterwards. */
  origin: "generic" | "user_entered";
}

/**
 * The generic residential template.
 *
 * Assembled from what a typical single-family permit asks for, and marked
 * generic so nothing downstream can mistake it for a particular office's list.
 */
export const GENERIC_REQUIREMENTS: DocumentRequirement[] = [
  {
    key: "site_plan",
    label: "Site plan with setbacks",
    source: "generated",
    detail: "Footprint on the lot with front, rear and side yards dimensioned, and lot coverage.",
  },
  {
    key: "floor_plans",
    label: "Floor plans, all levels",
    source: "generated",
    detail: "Rooms, dimensions, door and window locations, drawn to scale.",
  },
  {
    key: "elevations",
    label: "Exterior elevations",
    source: "generated",
    detail: "Front and side elevations with roof form and finish materials.",
  },
  {
    key: "electrical_plan",
    label: "Electrical plan",
    source: "generated",
    detail: "Receptacles, switches, fixtures and smoke/CO devices to code minimums.",
  },
  {
    key: "plumbing_plan",
    label: "Plumbing plan",
    source: "generated",
    detail: "Fixtures, wet walls and water-heater location.",
  },
  {
    key: "energy_compliance",
    label: "Energy compliance",
    source: "generated",
    detail: "Envelope and materials report; some offices require a signed form instead.",
  },
  {
    key: "structural",
    label: "Structural drawings and calculations",
    source: "professional",
    detail: "Framing, foundation and lateral design, sealed by a licensed engineer.",
  },
  {
    key: "sealed_drawings",
    label: "Sealed architectural drawings",
    source: "professional",
    detail: "Many jurisdictions require an architect's or engineer's seal on the submitted set.",
  },
  {
    key: "survey",
    label: "Property survey",
    source: "owner",
    detail: "A recorded survey establishing lot lines and easements.",
  },
  {
    key: "title_deed",
    label: "Proof of ownership",
    source: "owner",
    detail: "Deed or title showing you may build on the parcel.",
  },
  {
    key: "fees",
    label: "Permit fees",
    source: "owner",
    detail: "Paid to the building department at submission; the amount is theirs to set.",
  },
];

export const GENERIC_JURISDICTION: JurisdictionProfile = {
  id: "generic",
  name: "Generic residential",
  region: "",
  codeEdition: "2021 IRC (assumed)",
  setbacks: GENERIC_SETBACKS,
  requirements: GENERIC_REQUIREMENTS,
  origin: "generic",
};

function isSource(value: unknown): value is DocumentSource {
  return value === "generated" || value === "professional" || value === "owner";
}

const MAX_TEXT = 200;

function text(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed === "" ? fallback : trimmed.slice(0, MAX_TEXT);
}

/**
 * Clamp a user-entered profile to something usable, never throwing.
 *
 * Same discipline as `sanitizeSetbacks`: bad input degrades to the generic
 * template field by field rather than failing, because the alternative is a
 * permit page that white-screens on a typo.
 */
export function sanitizeJurisdiction(input?: Partial<JurisdictionProfile> | null): JurisdictionProfile {
  if (!input || typeof input !== "object") return GENERIC_JURISDICTION;

  const requirements = Array.isArray(input.requirements)
    ? input.requirements
        .filter((r): r is DocumentRequirement => Boolean(r) && typeof r === "object")
        .map((r, i) => ({
          key: text(r.key, `custom_${i}`),
          label: text(r.label, "Unnamed requirement"),
          source: isSource(r.source) ? r.source : "owner",
          detail: text(r.detail, ""),
        }))
        .filter((r) => r.label !== "Unnamed requirement" || r.key.startsWith("custom_"))
    : GENERIC_REQUIREMENTS;

  return {
    id: text(input.id, "custom"),
    name: text(input.name, GENERIC_JURISDICTION.name),
    region: text(input.region, "").toUpperCase().slice(0, 2),
    codeEdition: text(input.codeEdition, GENERIC_JURISDICTION.codeEdition),
    setbacks: sanitizeSetbacks(input.setbacks),
    requirements: requirements.length > 0 ? requirements : GENERIC_REQUIREMENTS,
    // Anything that reached this function came from a person, so it stops
    // being the generic template even if every field matched.
    origin: "user_entered",
  };
}

export type ItemState = "available" | "needs_professional" | "needs_owner";

export interface PackageItem extends DocumentRequirement {
  state: ItemState;
  /** Why it is in that state, in words a homeowner can act on. */
  because: string;
}

export interface PermitPackage {
  profile: JurisdictionProfile;
  items: PackageItem[];
  /** Counts, so a caller does not have to re-derive them to draw a summary. */
  available: number;
  needsProfessional: number;
  needsOwner: number;
  /** True only when nothing is outstanding — including the owner's paperwork. */
  complete: boolean;
  disclaimer: string;
}

export interface AssemblyInput {
  /** Which generated drawings this project actually has. */
  generated: Set<string> | string[];
  /** Whether a licensed professional has approved the set. */
  reviewApproved: boolean;
  /** Requirement keys the owner has said they hold (survey, deed, fees). */
  ownerHas?: string[];
}

/**
 * Turn a profile into a package, marking each requirement with where it stands.
 *
 * Note what this does NOT do: it never reports a professional requirement as
 * satisfied because a drawing exists. A generated structural drawing is still
 * not a sealed one, and the gap between those two is the entire reason a
 * permit gets rejected.
 */
export function assemblePermitPackage(
  profile: JurisdictionProfile,
  input: AssemblyInput,
): PermitPackage {
  const generated = new Set(input.generated);
  const ownerHas = new Set(input.ownerHas ?? []);

  const items: PackageItem[] = profile.requirements.map((req) => {
    if (req.source === "generated") {
      return generated.has(req.key)
        ? { ...req, state: "available", because: "Produced from your design." }
        : {
            ...req,
            state: "needs_owner",
            because: "Not produced yet — finish the design step that creates it.",
          };
    }
    if (req.source === "professional") {
      return input.reviewApproved
        ? { ...req, state: "available", because: "A licensed professional has approved this set." }
        : {
            ...req,
            state: "needs_professional",
            because: "Needs a licensed professional's seal. A drawing is not a sealed drawing.",
          };
    }
    return ownerHas.has(req.key)
      ? { ...req, state: "available", because: "You have said you hold this." }
      : { ...req, state: "needs_owner", because: "You obtain this outside BuildSphere." };
  });

  const available = items.filter((i) => i.state === "available").length;
  const needsProfessional = items.filter((i) => i.state === "needs_professional").length;
  const needsOwner = items.filter((i) => i.state === "needs_owner").length;

  return {
    profile,
    items,
    available,
    needsProfessional,
    needsOwner,
    complete: needsProfessional === 0 && needsOwner === 0,
    disclaimer: JURISDICTION_DISCLAIMER,
  };
}
