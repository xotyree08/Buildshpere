import { describe, expect, it } from "vitest";

import { generateConcepts } from "../../engine/generate";
import { allWalls } from "../../engine/walls";
import type { DesignBrief, HomeStyle } from "../../types";
import { exportIfc } from "./index";
import { ifcGuid } from "./guid";

/**
 * Round-trip, at the level a hand-written exporter can honestly claim.
 *
 * The handoff (§43) asks for BBG -> IFC -> BBG comparison. A full reader is a
 * separate piece of work, and claiming one exists because a file opens in a
 * viewer would be exactly the overclaim §149 lists. What IS verifiable without
 * one, and what catches the failures that actually break receiving software,
 * is structural: parse the instances back out, resolve every reference, and
 * check the building is still all there and still joined up.
 *
 * A dangling #reference is the single most common way a generated IFC file is
 * broken, and it is invisible until something tries to load it.
 */

const brief = (style: HomeStyle): DesignBrief => ({
  id: "b", projectId: "p", version: 1,
  program: {
    familySize: 4, bedrooms: 3, bathrooms: 2, office: false, gym: false,
    theater: false, outdoorKitchen: false, garageBays: 2,
  },
  style, interiors: {}, lifestyleNotes: "",
});

interface Instance {
  id: number;
  type: string;
  raw: string;
  refs: number[];
  guid: string | null;
}

/** Read the DATA section back into instances. */
function parse(ifc: string): Map<number, Instance> {
  const out = new Map<number, Instance>();
  const start = ifc.indexOf("DATA;");
  const body = ifc.slice(start + 5, ifc.indexOf("ENDSEC;", start));
  for (const line of body.split("\n")) {
    const match = /^#(\d+)=([A-Z0-9]+)\((.*)\);$/.exec(line.trim());
    if (!match) continue;
    const [, id, type, args] = match;
    // The GlobalId is the first attribute of a rooted entity: a 22-char string.
    const guid = /^'([0-9A-Za-z_$]{22})'/.exec(args)?.[1] ?? null;
    out.set(Number(id), {
      id: Number(id),
      type,
      raw: args,
      refs: [...args.matchAll(/#(\d+)/g)].map((m) => Number(m[1])),
      guid,
    });
  }
  return out;
}

const STYLES: HomeStyle[] = ["modern", "craftsman", "colonial"];

describe("IFC round trip", () => {
  it("every reference in the file resolves to an instance in the file", () => {
    for (const style of STYLES) {
      for (const concept of generateConcepts(brief(style), 60)) {
        const parsed = parse(exportIfc(concept.model, { projectName: "T", timestamp: "2026-08-22T00:00:00" }));
        expect(parsed.size, style).toBeGreaterThan(0);
        for (const instance of parsed.values()) {
          for (const ref of instance.refs) {
            expect(parsed.has(ref), `${style}: #${instance.id}=${instance.type} points at missing #${ref}`).toBe(true);
          }
        }
      }
    }
  });

  it("no instance references itself or anything declared after it", () => {
    // SPF permits forward references, but an exporter that emits them is
    // usually one that has lost track of its own ordering — and a self
    // reference is always a bug.
    for (const style of STYLES) {
      const model = generateConcepts(brief(style), 60)[0].model;
      const parsed = parse(exportIfc(model, { projectName: "T", timestamp: "2026-08-22T00:00:00" }));
      for (const instance of parsed.values()) {
        for (const ref of instance.refs) {
          expect(ref, `#${instance.id}=${instance.type} references itself`).not.toBe(instance.id);
          expect(ref, `#${instance.id}=${instance.type} forward-references #${ref}`).toBeLessThan(instance.id);
        }
      }
    }
  });

  it("the building comes back: every room and every wall, by identity", () => {
    for (const style of STYLES) {
      const model = generateConcepts(brief(style), 60)[0].model;
      const parsed = parse(exportIfc(model, { projectName: "T", timestamp: "2026-08-22T00:00:00" }));
      const guidsOf = (type: string) =>
        new Set([...parsed.values()].filter((i) => i.type === type).map((i) => i.guid));

      const spaces = guidsOf("IFCSPACE");
      for (const room of model.rooms) {
        expect(spaces.has(ifcGuid(room.key)), `${style}: ${room.label} did not survive`).toBe(true);
      }
      const walls = guidsOf("IFCWALL");
      for (const wall of allWalls(model)) {
        if (Math.abs(wall.to - wall.from) <= 0) continue;
        expect(walls.has(ifcGuid(wall.key)), `${style}: ${wall.key} did not survive`).toBe(true);
      }
    }
  });

  it("every opening is still joined to a wall on the other side", () => {
    // IfcRelVoidsElement must point at a real wall and a real opening; a file
    // where those come apart shows doors floating beside the house.
    for (const style of STYLES) {
      const model = generateConcepts(brief(style), 60)[0].model;
      const parsed = parse(exportIfc(model, { projectName: "T", timestamp: "2026-08-22T00:00:00" }));
      const voids = [...parsed.values()].filter((i) => i.type === "IFCRELVOIDSELEMENT");
      expect(voids.length, style).toBeGreaterThan(0);
      for (const rel of voids) {
        const targets = rel.refs.map((r) => parsed.get(r)!.type);
        expect(targets, `${style}: ${rel.raw}`).toContain("IFCWALL");
        expect(targets, `${style}: ${rel.raw}`).toContain("IFCOPENINGELEMENT");
      }
      for (const rel of [...parsed.values()].filter((i) => i.type === "IFCRELFILLSELEMENT")) {
        const targets = rel.refs.map((r) => parsed.get(r)!.type);
        expect(targets).toContain("IFCOPENINGELEMENT");
        expect(targets.some((t) => t === "IFCDOOR" || t === "IFCWINDOW")).toBe(true);
      }
    }
  });

  it("dimensions survive the trip: a room's area is the area IFC carries", () => {
    // The one geometric check that does not need a full reader — the swept
    // rectangle profile of each space, read back and compared to the plan.
    const model = generateConcepts(brief("modern"), 60)[0].model;
    const parsed = parse(exportIfc(model, { projectName: "T", timestamp: "2026-08-22T00:00:00" }));
    const FT_MM = 304.8;

    const profiles = [...parsed.values()].filter((i) => i.type === "IFCRECTANGLEPROFILEDEF");
    const areasSqft = profiles.map((p) => {
      const nums = p.raw.split(",").slice(-2).map((n) => parseFloat(n));
      return (nums[0] / FT_MM) * (nums[1] / FT_MM);
    });
    for (const room of model.rooms) {
      const want = room.rect[2] * room.rect[3];
      const matched = areasSqft.some((a) => Math.abs(a - want) < 0.05);
      expect(matched, `${room.label} ${want.toFixed(1)}sqft has no matching profile`).toBe(true);
    }
  });
});
