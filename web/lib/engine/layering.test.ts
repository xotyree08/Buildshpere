import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The layer order, as an import constraint.
 *
 * The handoff states a hierarchy and says not to reverse it: building data,
 * then geometry, then constraints, then quantities, then cost, then documents,
 * then visualization, then the AI presentation on top. It was invoked as a
 * tiebreaker in design discussions and enforced by nothing, so it drifted —
 * `estimate.ts` imported the revision engine and called it to price a house
 * without its theatre, which made costing re-pack geometry and made the two
 * modules mutually reachable.
 *
 * A rule nothing checks is a rule that is already broken somewhere you have
 * not looked. This checks it.
 */

const ENGINE = join(__dirname);
const RENDER = join(__dirname, "..", "render");

/** Lower index = closer to the building itself. A module may import its own tier and below. */
const TIERS: { tier: number; name: string; modules: string[] }[] = [
  { tier: 0, name: "building data", modules: ["ids", "adjacency", "assemblies", "units"] },
  { tier: 1, name: "geometry", modules: ["tile", "generate", "walls", "openings", "roofgeom", "iso", "elevation", "edit", "revise", "site", "sitefit", "interiors", "roof"] },
  { tier: 2, name: "constraints", modules: ["checks", "permit", "jurisdiction", "revisionscope"] },
  { tier: 3, name: "quantities", modules: ["plumbing", "electrical", "walkthrough", "maintenance"] },
  // `energy` sits here rather than with the quantities because half of what it
  // does is a payback period — cost delta over annual saving — and that is a
  // cost calculation whatever the file is called.
  { tier: 4, name: "cost", modules: ["estimate", "energy", "bids", "schedule", "buildtrack", "compare", "ve"] },
  { tier: 5, name: "documents", modules: ["repack", "loop", "interpret", "inspiration"] },
];

const TIER_OF = new Map<string, { tier: number; name: string }>();
for (const t of TIERS) for (const m of t.modules) TIER_OF.set(m, { tier: t.tier, name: t.name });

/**
 * Runtime imports only.
 *
 * `import type` is erased before anything runs, so a type name crossing a tier
 * does not make one layer drive another — which is what the hierarchy is
 * about. Borrowing a vocabulary word upward is a smell worth watching; pricing
 * that re-packs a house is the fault.
 */
function localImports(source: string): string[] {
  return [...source.matchAll(/(?<!\btype\s)from\s+"\.\/([a-zA-Z0-9_-]+)"/g)]
    .filter((m) => !/import\s+type\s/.test(source.slice(Math.max(0, m.index! - 60), m.index!)))
    .map((m) => m[1]);
}

describe("the layer order holds", () => {
  it("no module imports one from a tier above it", () => {
    const offences: string[] = [];
    for (const file of readdirSync(ENGINE)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const name = file.replace(/\.ts$/, "");
      const here = TIER_OF.get(name);
      // A module nobody has placed is not yet governed; placing it is the
      // point at which someone has to decide what it is.
      if (!here) continue;
      for (const dep of localImports(readFileSync(join(ENGINE, file), "utf8"))) {
        const there = TIER_OF.get(dep);
        if (!there) continue;
        if (there.tier > here.tier) {
          offences.push(`${name} (${here.name}) imports ${dep} (${there.name})`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("the 3-D scene is downstream of everything and nothing imports it back", () => {
    // Visualization is the bottom of the hierarchy: it reads the building and
    // is read by nobody. A renderer that something else depends on has become
    // a source of truth, which is the failure the handoff opens with.
    const engineFiles = readdirSync(ENGINE).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    for (const file of engineFiles) {
      const source = readFileSync(join(ENGINE, file), "utf8");
      expect(source, `${file} imports the 3-D scene`).not.toMatch(/from\s+"\.\.\/render\/scene3d"/);
    }
    // And the scene reads the engine, which is the direction that is allowed.
    const scene = readFileSync(join(RENDER, "scene3d.ts"), "utf8");
    expect(scene).toMatch(/from\s+"\.\.\/engine\//);
  });

  it("costing does not re-pack the building", () => {
    // The specific inversion this test was written for: pricing reached down
    // into the revision engine to find out what a house costs without a room.
    const estimate = readFileSync(join(ENGINE, "estimate.ts"), "utf8");
    expect(estimate).not.toMatch(/from\s+"\.\/revise"/);
    expect(estimate).not.toMatch(/from\s+"\.\/loop"/);
  });
});
