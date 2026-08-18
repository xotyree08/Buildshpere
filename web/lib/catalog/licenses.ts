/**
 * Project licensing catalog — the pricing model's single source of truth
 * (client-safe: no server imports). One home = one project license. There
 * is no subscription: each tier is a one-time purchase attached to one
 * project, carrying included usage allowances that add-on packs can top up.
 */

export type LicenseTier = "concept" | "design" | "complete" | "buildplus";

/** Meterable usage kinds a license tracks per project. */
export type CreditKind =
  | "major_revision"
  | "premium_render"
  | "walkthrough"
  | "scene_360"
  | "design_direction"
  | "property_analysis"
  /**
   * Internal only, never sold: spending one `walkthrough` reserves a batch of
   * these, one per rendered stop. A tour is many image renders and cannot
   * finish inside a single request, so the entitlement is charged once up
   * front and each stop draws down the reservation.
   */
  | "walkthrough_shot";

/** Stops rendered per walkthrough — the reservation size. */
export const WALKTHROUGH_SHOTS = 6;

/**
 * Major revisions included on an unlicensed project, per project.
 *
 * Deliberately equal to the cheapest tier's allowance rather than below it.
 * Licensing must never take something away: at this number, buying Concept
 * is neutral on this axis and grants a FRESH allowance on top of whatever
 * was already used, while every other tier is strictly more generous.
 */
export const FREE_MAJOR_REVISIONS = 2;

/** Kinds a customer never sees as a balance; they are plumbing. */
export const INTERNAL_KINDS: CreditKind[] = ["walkthrough_shot"];

export interface TierInfo {
  key: LicenseTier;
  productId: string;
  label: string;
  tagline: string;
  priceCents: number;
  mostPopular?: boolean;
  /** Build+ is an active-construction workspace with a bounded access window. */
  accessMonths?: number;
  /** Usage included with the license. Kinds absent here start at zero. */
  allowances: Partial<Record<CreditKind, number>>;
  features: string[];
}

export const TIERS: TierInfo[] = [
  {
    key: "concept",
    productId: "buildsphere_concept",
    label: "BuildSphere Concept",
    tagline: "Explore your possibilities",
    priceCents: 69500,
    allowances: { major_revision: 2, premium_render: 10, property_analysis: 1 },
    features: [
      "One property with buildability analysis",
      "AI design interview and up to 3 concepts",
      "2-D floor plans and basic 3-D model",
      "10 photorealistic renders",
      "Preliminary construction estimate",
      "Design health analysis",
      "2 major revision rounds",
    ],
  },
  {
    key: "design",
    productId: "buildsphere_design",
    label: "BuildSphere Design",
    tagline: "Bring your home to life",
    priceCents: 149500,
    allowances: {
      major_revision: 5,
      premium_render: 30,
      walkthrough: 1,
      scene_360: 5,
      property_analysis: 1,
    },
    features: [
      "Everything in Concept",
      "Full interior and exterior design",
      "A rendered photoreal walkthrough of your home",
      "30 photorealistic renders and 360° rooms",
      "Material selections and furniture layouts",
      "Preliminary bill of materials",
      "Value engineering",
      "5 major revision rounds",
      "PDF design package",
    ],
  },
  {
    key: "complete",
    productId: "buildsphere_complete",
    label: "BuildSphere Complete",
    tagline: "From idea to build preparation",
    priceCents: 249500,
    mostPopular: true,
    allowances: {
      major_revision: 7,
      premium_render: 60,
      walkthrough: 1,
      scene_360: 8,
      property_analysis: 1,
    },
    features: [
      "Everything in Design",
      "Advanced parcel and setback analysis",
      "Detailed BOM with labor and soft costs",
      "60 premium renders",
      "Architect and engineer matching workspace",
      "Permit checklist and package organization",
      "Contractor bid package and comparison",
      "7 major revision rounds",
      "One final design package",
    ],
  },
  {
    key: "buildplus",
    productId: "buildsphere_buildplus",
    label: "BuildSphere Build+",
    tagline: "Build with confidence",
    priceCents: 349500,
    accessMonths: 24,
    allowances: {
      major_revision: 7,
      premium_render: 60,
      walkthrough: 2,
      scene_360: 8,
      property_analysis: 1,
    },
    features: [
      "Everything in Complete",
      "Construction schedule and budget tracking",
      "Change orders, draws, and inspections",
      "Daily logs and progress photos",
      "Punch list and warranty records",
      "As-built documentation and HomeTwin",
      "24 months of active construction access",
    ],
  },
];

export interface AddonInfo {
  key: string;
  productId: string;
  label: string;
  priceCents: number;
  grants: { kind: CreditKind; amount: number };
}

/** Usage top-ups. Each attaches to an already-licensed project. */
export const ADDONS: AddonInfo[] = [
  { key: "renders10", productId: "buildsphere_addon_renders10", label: "10 additional premium renders", priceCents: 4900, grants: { kind: "premium_render", amount: 10 } },
  { key: "renders25", productId: "buildsphere_addon_renders25", label: "25 additional premium renders", priceCents: 9900, grants: { kind: "premium_render", amount: 25 } },
  { key: "scenes360", productId: "buildsphere_addon_scenes360", label: "Additional 360° scene pack (5 scenes)", priceCents: 7900, grants: { kind: "scene_360", amount: 5 } },
  { key: "walkthrough", productId: "buildsphere_addon_walkthrough", label: "Additional walkthrough", priceCents: 14900, grants: { kind: "walkthrough", amount: 1 } },
  { key: "redesign", productId: "buildsphere_addon_redesign", label: "Major redesign", priceCents: 29900, grants: { kind: "major_revision", amount: 1 } },
  { key: "direction", productId: "buildsphere_addon_direction", label: "New design direction", priceCents: 49900, grants: { kind: "design_direction", amount: 1 } },
  { key: "property", productId: "buildsphere_addon_property", label: "Additional property analysis", priceCents: 14900, grants: { kind: "property_analysis", amount: 1 } },
];

/** Builder project packs are sold by conversation, not checkout. */
export const BUILDER_PACKS = [
  { projects: 5, priceCents: 750000 },
  { projects: 10, priceCents: 1350000 },
  { projects: 25, priceCents: 2950000 },
];

export function tierInfo(key: string | undefined | null): TierInfo | undefined {
  return TIERS.find((t) => t.key === key);
}

export function addonInfo(key: string | undefined | null): AddonInfo | undefined {
  return ADDONS.find((a) => a.key === key);
}

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString("en-US")}`
    : `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}
