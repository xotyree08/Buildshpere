/**
 * Two things this feature must never do, and one it must always do.
 *
 * Never: report a professional requirement as satisfied because a drawing
 * exists. A generated structural drawing is not a sealed one, and the gap
 * between those two is the entire reason a permit gets rejected.
 *
 * Never: present a generic checklist as a particular building department's
 * requirements.
 *
 * Always: degrade rather than throw on user input, because the alternative is
 * a permit page that white-screens on a typo.
 */

import { describe, expect, it } from "vitest";

import {
  assemblePermitPackage,
  GENERIC_JURISDICTION,
  GENERIC_REQUIREMENTS,
  JURISDICTION_DISCLAIMER,
  sanitizeJurisdiction,
} from "./jurisdiction";
import { GENERIC_SETBACKS } from "./site";

const ALL_GENERATED = GENERIC_REQUIREMENTS.filter((r) => r.source === "generated").map((r) => r.key);
const ALL_OWNER = GENERIC_REQUIREMENTS.filter((r) => r.source === "owner").map((r) => r.key);

describe("the generic template", () => {
  it("says it is not anybody's official list", () => {
    expect(GENERIC_JURISDICTION.origin).toBe("generic");
    expect(JURISDICTION_DISCLAIMER).toContain("not your jurisdiction's official requirements");
    expect(JURISDICTION_DISCLAIMER).toContain("has not obtained");
  });

  it("carries the disclaimer into every assembled package", () => {
    // A document checklist that looks official is worse than no checklist —
    // it invites someone to stop checking.
    const pkg = assemblePermitPackage(GENERIC_JURISDICTION, {
      generated: ALL_GENERATED,
      reviewApproved: true,
      ownerHas: ALL_OWNER,
    });
    expect(pkg.disclaimer).toBe(JURISDICTION_DISCLAIMER);
  });

  it("names a source for every requirement", () => {
    for (const req of GENERIC_REQUIREMENTS) {
      expect(["generated", "professional", "owner"]).toContain(req.source);
      expect(req.detail.length).toBeGreaterThan(0);
    }
  });
});

describe("a drawing is not a sealed drawing", () => {
  it("professional requirements stay outstanding however many drawings exist", () => {
    const pkg = assemblePermitPackage(GENERIC_JURISDICTION, {
      generated: [...ALL_GENERATED, "structural", "sealed_drawings"],
      reviewApproved: false,
      ownerHas: ALL_OWNER,
    });
    const structural = pkg.items.find((i) => i.key === "structural");
    expect(structural?.state).toBe("needs_professional");
    expect(structural?.because).toContain("not a sealed drawing");
    expect(pkg.complete).toBe(false);
  });

  it("clears only once a professional has actually approved the set", () => {
    const pkg = assemblePermitPackage(GENERIC_JURISDICTION, {
      generated: ALL_GENERATED,
      reviewApproved: true,
      ownerHas: ALL_OWNER,
    });
    expect(pkg.needsProfessional).toBe(0);
    expect(pkg.complete).toBe(true);
  });
});

describe("assembling a package", () => {
  it("counts what is ready, what needs a professional, and what needs the owner", () => {
    const pkg = assemblePermitPackage(GENERIC_JURISDICTION, {
      generated: ALL_GENERATED,
      reviewApproved: false,
      ownerHas: [],
    });
    expect(pkg.available).toBe(ALL_GENERATED.length);
    expect(pkg.needsProfessional).toBe(2);
    expect(pkg.needsOwner).toBe(ALL_OWNER.length);
    expect(pkg.available + pkg.needsProfessional + pkg.needsOwner).toBe(GENERIC_REQUIREMENTS.length);
  });

  it("a drawing the project has not produced is outstanding, not assumed", () => {
    const pkg = assemblePermitPackage(GENERIC_JURISDICTION, {
      generated: ["site_plan"],
      reviewApproved: true,
      ownerHas: ALL_OWNER,
    });
    const plans = pkg.items.find((i) => i.key === "floor_plans");
    expect(plans?.state).toBe("needs_owner");
    expect(pkg.complete).toBe(false);
  });

  it("is never complete while the owner's paperwork is outstanding", () => {
    // The survey and the deed are the two things people forget, so they count.
    const pkg = assemblePermitPackage(GENERIC_JURISDICTION, {
      generated: ALL_GENERATED,
      reviewApproved: true,
      ownerHas: ["fees"],
    });
    expect(pkg.complete).toBe(false);
    expect(pkg.needsOwner).toBe(ALL_OWNER.length - 1);
  });

  it("every item explains itself in words worth acting on", () => {
    const pkg = assemblePermitPackage(GENERIC_JURISDICTION, {
      generated: [],
      reviewApproved: false,
    });
    for (const item of pkg.items) expect(item.because.length).toBeGreaterThan(10);
  });
});

describe("a profile somebody typed in", () => {
  it("degrades field by field rather than throwing", () => {
    const messy = sanitizeJurisdiction({
      name: "   ",
      region: "california",
      codeEdition: "",
      setbacks: { frontFt: Number.NaN, rearFt: -5 } as never,
      requirements: [],
    });
    expect(messy.name).toBe(GENERIC_JURISDICTION.name);
    expect(messy.region).toBe("CA");
    expect(messy.codeEdition).toBe(GENERIC_JURISDICTION.codeEdition);
    expect(messy.setbacks.frontFt).toBe(GENERIC_SETBACKS.frontFt);
    expect(messy.requirements).toEqual(GENERIC_REQUIREMENTS);
  });

  it("survives null, undefined and nonsense", () => {
    expect(sanitizeJurisdiction(null)).toBe(GENERIC_JURISDICTION);
    expect(sanitizeJurisdiction(undefined)).toBe(GENERIC_JURISDICTION);
    expect(sanitizeJurisdiction("nope" as never)).toBe(GENERIC_JURISDICTION);
  });

  it("stops being the generic template the moment a person touches it", () => {
    // Even when every field happens to match: the provenance is different, and
    // provenance is what the disclaimer is about.
    const edited = sanitizeJurisdiction({ name: GENERIC_JURISDICTION.name });
    expect(edited.origin).toBe("user_entered");
  });

  it("keeps custom requirements and gives them a safe source", () => {
    const custom = sanitizeJurisdiction({
      name: "City of Somewhere",
      requirements: [
        { key: "soils", label: "Soils report", source: "owner", detail: "Geotechnical." },
        { label: "Mystery", source: "invented" } as never,
      ],
    });
    expect(custom.requirements).toHaveLength(2);
    expect(custom.requirements[0].key).toBe("soils");
    // An unrecognised source falls to `owner`, which is the honest default:
    // it means "this is on you", not "we have it".
    expect(custom.requirements[1].source).toBe("owner");
  });

  it("assembles a custom profile the same way as the generic one", () => {
    const custom = sanitizeJurisdiction({
      name: "City of Somewhere",
      requirements: [{ key: "soils", label: "Soils report", source: "owner", detail: "Geo." }],
    });
    const pkg = assemblePermitPackage(custom, { generated: [], reviewApproved: false });
    expect(pkg.items).toHaveLength(1);
    expect(pkg.needsOwner).toBe(1);
    expect(pkg.disclaimer).toBe(JURISDICTION_DISCLAIMER);
  });
});
