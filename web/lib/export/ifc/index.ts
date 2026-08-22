/**
 * IFC4 export: the building graph written out as an exchange file.
 *
 * The handoff is explicit that this direction is one-way and that IFC is not
 * the master (§42) — the building graph is, and this is a generated artifact
 * like the PDF and the 3-D scene. So this module reads and writes nothing back.
 *
 * What it honestly is: the spatial hierarchy (project, site, building, storeys,
 * spaces), the wall graph with real extruded geometry, and doors and windows
 * as openings that actually void their host wall. What it is NOT: a certified
 * model view, a structural or MEP model, or anything that has round-tripped
 * through commercial software. See IFC_EXPORT_CLAIM below for the wording that
 * has to travel with it.
 */

import { WALL_HEIGHT_FT } from "../../engine/iso";
import { hostWallKey, openingHeights } from "../../engine/openings";
import { allWalls, type Wall } from "../../engine/walls";
import type { Opening, ParametricModel, Room } from "../../types";
import { ifcGuid } from "./guid";
import { Enum, Ref, SpfFile, type Value } from "./spf";

/**
 * What may be said about this file, and what may not.
 *
 * Every honest export needs one of these. A file that opens in a viewer is not
 * a coordinated model, and the gap between those two is where people get hurt.
 */
export const IFC_EXPORT_CLAIM =
  "IFC4 export of the architectural concept: spatial structure, walls, doors and windows. " +
  "Not a coordinated model — it carries no structural, plumbing, electrical or mechanical " +
  "systems, and no model view definition is asserted. Verify in your own software before use.";

const FT_MM = 304.8;
const mm = (feet: number) => feet * FT_MM;

export interface IfcExportMeta {
  projectName: string;
  /** ISO-8601. Passed in rather than read from the clock, so exports are reproducible. */
  timestamp: string;
  application?: string;
  version?: string;
}

/** Room kinds that are circulation or outdoor rather than enclosed space. */
function spaceKindName(room: Room): string {
  return room.kind.toUpperCase();
}

export function exportIfc(model: ParametricModel, meta: IfcExportMeta): string {
  const f = new SpfFile();
  const id = (key: string) => ifcGuid(key);

  // --- units and geometric context -----------------------------------------
  // Millimetres, declared. The model is in feet internally; converting at the
  // boundary is the whole job of a boundary, and it means the file is already
  // right on the day the internal units change.
  const mmUnit = f.add("IFCSIUNIT", [null, new Enum("LENGTHUNIT"), new Enum("MILLI"), new Enum("METRE")]);
  const areaUnit = f.add("IFCSIUNIT", [null, new Enum("AREAUNIT"), null, new Enum("SQUARE_METRE")]);
  const volumeUnit = f.add("IFCSIUNIT", [null, new Enum("VOLUMEUNIT"), null, new Enum("CUBIC_METRE")]);
  const angleUnit = f.add("IFCSIUNIT", [null, new Enum("PLANEANGLEUNIT"), null, new Enum("RADIAN")]);
  const units = f.add("IFCUNITASSIGNMENT", [[mmUnit, areaUnit, volumeUnit, angleUnit]]);

  const origin = f.add("IFCCARTESIANPOINT", [[0, 0, 0]]);
  const zAxis = f.add("IFCDIRECTION", [[0, 0, 1]]);
  const xAxis = f.add("IFCDIRECTION", [[1, 0, 0]]);
  const worldPlacement = f.add("IFCAXIS2PLACEMENT3D", [origin, zAxis, xAxis]);
  const context = f.add("IFCGEOMETRICREPRESENTATIONCONTEXT", [
    null,
    "Model",
    3,
    1e-5,
    worldPlacement,
    null,
  ]);
  const bodyContext = f.add("IFCGEOMETRICREPRESENTATIONSUBCONTEXT", [
    "Body",
    "Model",
    null,
    null,
    null,
    null,
    context,
    null,
    new Enum("MODEL_VIEW"),
    null,
  ]);

  // OwnerHistory is deliberately absent everywhere. IFC wants an IfcPerson and
  // an IfcOrganization; inventing a person who did not author this file would
  // be putting a name to work nobody did.
  const OWNER: Value = null;

  const placementAt = (x: number, y: number, z: number, relTo: Ref | null): Ref => {
    const point = f.add("IFCCARTESIANPOINT", [[x, y, z]]);
    const axes = f.add("IFCAXIS2PLACEMENT3D", [point, null, null]);
    return f.add("IFCLOCALPLACEMENT", [relTo, axes]);
  };

  /** A box, as IFC draws one: a rectangle profile swept upward. */
  const boxSolid = (widthMm: number, depthMm: number, heightMm: number, cx: number, cy: number, cz: number): Ref => {
    const centre = f.add("IFCCARTESIANPOINT", [[cx, cy]]);
    const position = f.add("IFCAXIS2PLACEMENT2D", [centre, null]);
    const profile = f.add("IFCRECTANGLEPROFILEDEF", [new Enum("AREA"), null, position, widthMm, depthMm]);
    const base = f.add("IFCCARTESIANPOINT", [[0, 0, cz]]);
    const axes = f.add("IFCAXIS2PLACEMENT3D", [base, null, null]);
    const solid = f.add("IFCEXTRUDEDAREASOLID", [profile, axes, zAxis, heightMm]);
    const shape = f.add("IFCSHAPEREPRESENTATION", [bodyContext, "Body", "SweptSolid", [solid]]);
    return f.add("IFCPRODUCTDEFINITIONSHAPE", [null, null, [shape]]);
  };

  // --- spatial hierarchy ----------------------------------------------------
  const project = f.add("IFCPROJECT", [
    id("PROJECT"),
    OWNER,
    meta.projectName,
    null,
    null,
    null,
    null,
    [context],
    units,
  ]);
  const sitePlacement = placementAt(0, 0, 0, null);
  const site = f.add("IFCSITE", [
    id("SITE"),
    OWNER,
    "Site",
    null, null,
    sitePlacement,
    null, null,
    new Enum("ELEMENT"),
    null, null, null, null, null,
  ]);
  const buildingPlacement = placementAt(0, 0, 0, sitePlacement);
  const building = f.add("IFCBUILDING", [
    id("BUILDING"),
    OWNER,
    meta.projectName,
    null, null,
    buildingPlacement,
    null, null,
    new Enum("ELEMENT"),
    null, null, null,
  ]);

  f.add("IFCRELAGGREGATES", [id("REL-PROJECT-SITE"), OWNER, null, null, project, [site]]);
  f.add("IFCRELAGGREGATES", [id("REL-SITE-BUILDING"), OWNER, null, null, site, [building]]);

  const storeys: Ref[] = [];
  const storeyPlacements: Ref[] = [];
  for (let level = 0; level < model.levels; level++) {
    const elevation = mm(level * WALL_HEIGHT_FT);
    const placement = placementAt(0, 0, elevation, buildingPlacement);
    storeyPlacements.push(placement);
    storeys.push(
      f.add("IFCBUILDINGSTOREY", [
        id(`STOREY-L${level + 1}`),
        OWNER,
        level === 0 ? "Ground Floor" : `Level ${level + 1}`,
        null, null,
        placement,
        null, null,
        new Enum("ELEMENT"),
        elevation,
      ]),
    );
  }
  if (storeys.length > 0) {
    f.add("IFCRELAGGREGATES", [id("REL-BUILDING-STOREYS"), OWNER, null, null, building, storeys]);
  }

  // --- spaces ---------------------------------------------------------------
  const spacesByLevel = new Map<number, Ref[]>();
  for (const room of model.rooms) {
    const [x, z, w, d] = room.rect;
    const placement = placementAt(0, 0, 0, storeyPlacements[room.level]);
    const shape = boxSolid(mm(w), mm(d), mm(WALL_HEIGHT_FT), mm(x + w / 2), mm(z + d / 2), 0);
    const space = f.add("IFCSPACE", [
      id(room.key),
      OWNER,
      room.label,
      spaceKindName(room),
      null,
      placement,
      shape,
      room.label,
      new Enum("ELEMENT"),
      new Enum("INTERNAL"),
      null,
    ]);
    const list = spacesByLevel.get(room.level) ?? [];
    list.push(space);
    spacesByLevel.set(room.level, list);
  }
  for (const [level, spaces] of spacesByLevel) {
    f.add("IFCRELAGGREGATES", [id(`REL-STOREY-SPACES-L${level + 1}`), OWNER, null, null, storeys[level], spaces]);
  }

  // --- walls, and the openings that void them -------------------------------
  const roomsByKey = new Map(model.rooms.map((r) => [r.key, r]));
  const openingsByWall = new Map<string, Opening[]>();
  for (const opening of model.openings) {
    const key = hostWallKey(model, opening);
    if (!key) continue;
    const list = openingsByWall.get(key) ?? [];
    list.push(opening);
    openingsByWall.set(key, list);
  }

  const wallsByLevel = new Map<number, Ref[]>();
  for (const wall of allWalls(model)) {
    const lengthFt = Math.abs(wall.to - wall.from);
    if (lengthFt <= 0) continue;
    const alongX = wall.axis === "x";
    const cx = alongX ? (wall.from + wall.to) / 2 : wall.at;
    const cz = alongX ? wall.at : (wall.from + wall.to) / 2;
    const widthMm = mm(alongX ? lengthFt : wall.thicknessFt);
    const depthMm = mm(alongX ? wall.thicknessFt : lengthFt);

    const placement = placementAt(0, 0, 0, storeyPlacements[wall.level]);
    const shape = boxSolid(widthMm, depthMm, mm(wall.heightFt), mm(cx), mm(cz), 0);
    const ifcWall = f.add("IFCWALL", [
      id(wall.key),
      OWNER,
      wallLabel(wall),
      null, null,
      placement,
      shape,
      null,
      new Enum(wall.wallClass === "exterior" ? "SOLIDWALL" : "PARTITIONING"),
    ]);
    const list = wallsByLevel.get(wall.level) ?? [];
    list.push(ifcWall);
    wallsByLevel.set(wall.level, list);

    for (const opening of openingsByWall.get(wall.key) ?? []) {
      const room = roomsByKey.get(opening.roomKey);
      if (!room) continue;
      const { sillFt, headFt } = openingHeights(opening, room);
      // Where the opening sits along the wall, in world coordinates.
      const [rx, rz] = room.rect;
      const along = (alongX ? rx : rz) + opening.offsetFt + opening.widthFt / 2;
      const ox = alongX ? along : wall.at;
      const oz = alongX ? wall.at : along;
      const oWidthMm = mm(alongX ? opening.widthFt : wall.thicknessFt + 0.1);
      const oDepthMm = mm(alongX ? wall.thicknessFt + 0.1 : opening.widthFt);
      const voidShape = boxSolid(oWidthMm, oDepthMm, mm(headFt - sillFt), mm(ox), mm(oz), mm(sillFt));
      const voidPlacement = placementAt(0, 0, 0, storeyPlacements[wall.level]);
      const ifcOpening = f.add("IFCOPENINGELEMENT", [
        id(`${opening.key}-VOID`),
        OWNER,
        `${opening.kind} void`,
        null, null,
        voidPlacement,
        voidShape,
        null,
        new Enum("OPENING"),
      ]);
      f.add("IFCRELVOIDSELEMENT", [id(`${opening.key}-VOIDS`), OWNER, null, null, ifcWall, ifcOpening]);

      if (opening.kind === "opening") continue;
      const fillPlacement = placementAt(0, 0, 0, storeyPlacements[wall.level]);
      const fillShape = boxSolid(oWidthMm, oDepthMm, mm(headFt - sillFt), mm(ox), mm(oz), mm(sillFt));
      const isDoor = opening.kind === "door";
      const filler = f.add(isDoor ? "IFCDOOR" : "IFCWINDOW", [
        id(opening.key),
        OWNER,
        isDoor ? doorLabel(opening, room) : "Window",
        null, null,
        fillPlacement,
        fillShape,
        null,
        mm(headFt - sillFt),
        mm(opening.widthFt),
        null, null, null,
      ]);
      f.add("IFCRELFILLSELEMENT", [id(`${opening.key}-FILLS`), OWNER, null, null, ifcOpening, filler]);
    }
  }

  for (const [level, walls] of wallsByLevel) {
    f.add("IFCRELCONTAINEDINSPATIALSTRUCTURE", [
      id(`REL-STOREY-WALLS-L${level + 1}`),
      OWNER,
      null,
      null,
      walls,
      storeys[level],
    ]);
  }

  return f.toString({
    name: meta.projectName,
    timestamp: meta.timestamp,
    application: meta.application ?? "BuildSphere",
    version: meta.version ?? "concept",
  });
}

function wallLabel(wall: Wall): string {
  return wall.wallClass === "exterior" ? "Exterior wall" : wall.wallClass === "railing" ? "Railing" : "Partition";
}

function doorLabel(opening: Opening, room: Room): string {
  return room.kind === "garage" && opening.widthFt >= 8 ? "Garage door" : "Door";
}
