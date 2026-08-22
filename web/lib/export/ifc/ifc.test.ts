import { describe, expect, it } from "vitest";

import { generateConcepts } from "../../engine/generate";
import { hostWallKey } from "../../engine/openings";
import { allWalls } from "../../engine/walls";
import type { DesignBrief, HomeStyle } from "../../types";
import { exportIfc, IFC_EXPORT_CLAIM } from "./index";
import { ifcGuid } from "./guid";

const brief = (style: HomeStyle = "modern"): DesignBrief => ({
  id: "b", projectId: "p", version: 1,
  program: {
    familySize: 4, bedrooms: 3, bathrooms: 2, office: false, gym: false,
    theater: false, outdoorKitchen: false, garageBays: 2,
  },
  style, interiors: {}, lifestyleNotes: "",
});

const META = { projectName: "Washington Residence", timestamp: "2026-08-22T00:00:00" };
const modelFor = (style: HomeStyle = "modern") => generateConcepts(brief(style), 60)[0].model;

/** Pull every instance of one entity type out of a STEP file. */
function instances(ifc: string, type: string): string[] {
  return ifc.split("\n").filter((line) => new RegExp(`^#\\d+=${type}\\(`).test(line));
}

describe("IFC GlobalIds", () => {
  it("are 22 characters of IFC's own alphabet", () => {
    for (const key of ["R-L1-KITCHEN-01", "W-L1-A|B", "PROJECT", ""]) {
      const guid = ifcGuid(key);
      expect(guid, key).toHaveLength(22);
      expect(guid, key).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/);
    }
  });

  it("are derived, not drawn — the same key is the same id every time", () => {
    // A random id per export would mean two exports of one building could not
    // be recognised as the same building, and an unmoved wall would arrive as
    // a new wall.
    expect(ifcGuid("W-L1-R-L1-KITCHEN-01-N")).toBe(ifcGuid("W-L1-R-L1-KITCHEN-01-N"));
    expect(ifcGuid("R-L1-KITCHEN-01")).not.toBe(ifcGuid("R-L1-KITCHEN-02"));
  });

  it("do not collide across a whole building's objects", () => {
    const model = modelFor();
    const keys = [
      ...model.rooms.map((r) => r.key),
      ...model.openings.map((o) => o.key),
      ...allWalls(model).map((w) => w.key),
    ];
    const guids = new Set(keys.map(ifcGuid));
    expect(guids.size).toBe(keys.length);
  });
});

describe("IFC export", () => {
  it("is a well-formed ISO-10303-21 file declaring IFC4", () => {
    const ifc = exportIfc(modelFor(), META);
    expect(ifc.startsWith("ISO-10303-21;\n")).toBe(true);
    expect(ifc.trimEnd().endsWith("END-ISO-10303-21;")).toBe(true);
    expect(ifc).toContain("FILE_SCHEMA(('IFC4'));");
    // Every data line is a numbered instance ending in a semicolon.
    const data = ifc.slice(ifc.indexOf("DATA;") + 5, ifc.indexOf("ENDSEC;", ifc.indexOf("DATA;")));
    for (const line of data.split("\n").filter(Boolean)) {
      expect(line, line).toMatch(/^#\d+=[A-Z0-9]+\(.*\);$/);
    }
  });

  it("claims no model view, because none has been certified", () => {
    // Naming a ViewDefinition is a conformance claim. Writing one because
    // other files have one is borrowed credibility.
    const ifc = exportIfc(modelFor(), META);
    expect(ifc).not.toMatch(/ViewDefinition/i);
    expect(ifc).toContain("FILE_DESCRIPTION((''),'2;1');");
  });

  it("invents no author", () => {
    // IFC wants an IfcPerson and IfcOrganization on every OwnerHistory. Making
    // one up puts a name to work nobody did.
    const ifc = exportIfc(modelFor(), META);
    expect(ifc).not.toContain("IFCPERSON");
    expect(ifc).not.toContain("IFCOWNERHISTORY");
  });

  it("carries the whole spatial hierarchy, aggregated the way IFC expects", () => {
    const model = modelFor();
    const ifc = exportIfc(model, META);
    expect(instances(ifc, "IFCPROJECT")).toHaveLength(1);
    expect(instances(ifc, "IFCSITE")).toHaveLength(1);
    expect(instances(ifc, "IFCBUILDING")).toHaveLength(1);
    expect(instances(ifc, "IFCBUILDINGSTOREY")).toHaveLength(model.levels);
    expect(instances(ifc, "IFCSPACE")).toHaveLength(model.rooms.length);
    // Project aggregates site aggregates building aggregates storeys.
    expect(instances(ifc, "IFCRELAGGREGATES").length).toBeGreaterThanOrEqual(3);
    expect(instances(ifc, "IFCRELCONTAINEDINSPATIALSTRUCTURE").length).toBe(model.levels);
  });

  it("writes one IfcWall per wall in the graph, not one per room face", () => {
    const model = modelFor();
    const ifc = exportIfc(model, META);
    const walls = allWalls(model).filter((w) => Math.abs(w.to - w.from) > 0);
    expect(instances(ifc, "IFCWALL")).toHaveLength(walls.length);
  });

  it("every door and window voids its host wall and fills the void", () => {
    // The relationship that makes an IFC opening real rather than decorative.
    const model = modelFor();
    const ifc = exportIfc(model, META);
    const hosted = model.openings.filter((o) => hostWallKey(model, o) !== null);
    const fillers = hosted.filter((o) => o.kind !== "opening");
    expect(instances(ifc, "IFCOPENINGELEMENT")).toHaveLength(hosted.length);
    expect(instances(ifc, "IFCRELVOIDSELEMENT")).toHaveLength(hosted.length);
    expect(instances(ifc, "IFCRELFILLSELEMENT")).toHaveLength(fillers.length);
    expect(instances(ifc, "IFCDOOR").length + instances(ifc, "IFCWINDOW").length).toBe(fillers.length);
  });

  it("declares millimetres and writes millimetre values", () => {
    // The model is in feet internally. Converting at the boundary is what a
    // boundary is for, and it means the file is already right the day the
    // internal units change.
    const model = modelFor();
    const ifc = exportIfc(model, META);
    expect(ifc).toContain("IFCSIUNIT($,.LENGTHUNIT.,.MILLI.,.METRE.);");
    // A house is tens of thousands of millimetres across, not tens.
    const coords = [...ifc.matchAll(/IFCCARTESIANPOINT\(\(([-0-9.,]+)\)\)/g)]
      .flatMap((m) => m[1].split(",").map(Number))
      .filter((n) => Number.isFinite(n) && n !== 0);
    expect(Math.max(...coords.map(Math.abs))).toBeGreaterThan(3000);
  });

  it("is reproducible — the same model and timestamp give the same bytes", () => {
    const model = modelFor();
    expect(exportIfc(model, META)).toBe(exportIfc(model, META));
  });

  it("escapes a name that would otherwise corrupt the file", () => {
    const ifc = exportIfc(modelFor(), { ...META, projectName: "O'Brien — Café" });
    expect(ifc).toContain("O''Brien");
    expect(ifc).toContain("\\X2\\");
    // And the header is still parseable: exactly one FILE_NAME line.
    expect(ifc.split("\n").filter((l) => l.startsWith("FILE_NAME("))).toHaveLength(1);
  });

  it("survives every style the generator makes", () => {
    for (const style of ["modern", "craftsman", "colonial", "farmhouse", "a_frame"] as HomeStyle[]) {
      for (const concept of generateConcepts(brief(style), 60)) {
        const ifc = exportIfc(concept.model, META);
        expect(ifc, style).toContain("END-ISO-10303-21;");
        expect(instances(ifc, "IFCWALL").length, style).toBeGreaterThan(0);
      }
    }
  });

  it("says what it is not", () => {
    expect(IFC_EXPORT_CLAIM).toMatch(/not a coordinated model/i);
    expect(IFC_EXPORT_CLAIM).toMatch(/no model view definition/i);
  });
});
