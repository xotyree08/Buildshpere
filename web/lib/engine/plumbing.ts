/**
 * Plumbing plan engine: fixture placement, wet-wall detection, and
 * water-service sizing from standard fixture units. Deterministic
 * (ADR-007); honest scope — pipe routing, venting, and the permit
 * isometric come from the licensed plumber (L8). This is the
 * coordination drawing and the sizing conversation-starter.
 */

import type { ParametricModel, Room } from "../types";
import { sharedWall } from "./adjacency";

export type FixtureType =
  | "kitchen_sink"
  | "dishwasher"
  | "lavatory"
  | "toilet"
  | "shower_tub"
  | "washer"
  | "laundry_sink"
  | "water_heater"
  | "hose_bib";

export interface Fixture {
  type: FixtureType;
  label: string;
  x: number;
  z: number;
  /** Water supply fixture units (WSFU, combined hot+cold, per IPC-style tables). */
  wsfu: number;
}

export interface WetWall {
  /** Wall segment shared by 2+ fixtures — stack them here to save real money. */
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  fixtures: number;
}

export interface PlumbingPlan {
  rooms: { room: Room; fixtures: Fixture[] }[];
  hoseBibs: Fixture[];
  totalWsfu: number;
  /** Recommended water service size from the WSFU total. */
  serviceSize: '3/4"' | '1"' | '1-1/4"';
  wetWalls: WetWall[];
  notes: string[];
}

const WSFU: Record<FixtureType, number> = {
  kitchen_sink: 1.4,
  dishwasher: 1.4,
  lavatory: 0.7,
  toilet: 2.2,
  shower_tub: 1.4,
  washer: 1.4,
  laundry_sink: 1.4,
  water_heater: 0,
  hose_bib: 2.5,
};

const LABELS: Record<FixtureType, string> = {
  kitchen_sink: "Kitchen sink",
  dishwasher: "Dishwasher",
  lavatory: "Lavatory",
  toilet: "Water closet",
  shower_tub: "Shower / tub",
  washer: "Washer box",
  laundry_sink: "Laundry sink",
  water_heater: "Water heater",
  hose_bib: "Hose bib",
};

function fixture(type: FixtureType, x: number, z: number): Fixture {
  return { type, label: LABELS[type], x, z, wsfu: WSFU[type] };
}

export function buildPlumbingPlan(model: ParametricModel): PlumbingPlan {
  const rooms: { room: Room; fixtures: Fixture[] }[] = [];

  for (const room of model.rooms) {
    const [x, z, w, d] = room.rect;
    const fixtures: Fixture[] = [];
    switch (room.kind) {
      case "kitchen":
        // Sink on the counter run (north wall), dishwasher beside it.
        fixtures.push(fixture("kitchen_sink", x + w / 2, z + 1.2));
        fixtures.push(fixture("dishwasher", x + w / 2 + 2.5, z + 1.2));
        break;
      case "bathroom":
        fixtures.push(fixture("lavatory", x + 2, z + 1.2)); // at the vanity
        fixtures.push(fixture("toilet", x + Math.min(5, w - 1.5), z + 1.2));
        // Powder rooms are lavatory + water closet only — no shower.
        if (!/powder/i.test(room.label)) {
          fixtures.push(fixture("shower_tub", x + w - 1.8, z + Math.min(3, d - 1.5)));
        }
        break;
      case "laundry":
        fixtures.push(fixture("washer", x + 1.8, z + 1.2));
        fixtures.push(fixture("laundry_sink", x + 4.5, z + 1.2));
        break;
      case "garage":
        // Water heater in the garage corner (or mechanical room if present).
        if (!model.rooms.some((r) => r.kind === "closet")) {
          fixtures.push(fixture("water_heater", x + 1.6, z + d - 1.6));
        }
        break;
      case "closet":
        // "Mechanical / Storage" closets host the water heater.
        fixtures.push(fixture("water_heater", x + w / 2, z + d / 2));
        break;
      default:
        break;
    }
    if (fixtures.length > 0) rooms.push({ room, fixtures });
  }

  // Hose bibs: front and rear of the footprint.
  const ground = model.rooms.filter((r) => r.level === 0);
  const minX = Math.min(...ground.map((r) => r.rect[0]));
  const frontZ = Math.min(...ground.map((r) => r.rect[1]));
  const rearZ = Math.max(...ground.map((r) => r.rect[1] + r.rect[3]));
  const hoseBibs = [fixture("hose_bib", minX + 2, frontZ), fixture("hose_bib", minX + 2, rearZ)];

  const all = [...rooms.flatMap((r) => r.fixtures), ...hoseBibs];
  const totalWsfu = Math.round(all.reduce((s, f) => s + f.wsfu, 0) * 10) / 10;
  const serviceSize = totalWsfu <= 15 ? '3/4"' : totalWsfu <= 30 ? '1"' : '1-1/4"';

  // Wet walls: back-to-back / stacked plumbing rooms sharing a wall run.
  const wetWalls: WetWall[] = [];
  const plumbed = rooms.map((r) => r.room);
  for (let i = 0; i < plumbed.length; i++) {
    for (let j = i + 1; j < plumbed.length; j++) {
      if (plumbed[i].level !== plumbed[j].level) continue;
      // Back-to-back or stacked plumbing rooms share the wall between them —
      // that wall IS the wet wall, so the run is measured along it and drawn
      // on its centreline, not on one room's inside face.
      const wall = sharedWall(plumbed[i].rect, plumbed[j].rect);
      if (!wall || wall.to - wall.from <= 3) continue;
      const fixtures = rooms[i].fixtures.length + rooms[j].fixtures.length;
      wetWalls.push(
        wall.axis === "x"
          ? { x1: wall.at, z1: wall.from, x2: wall.at, z2: wall.to, fixtures }
          : { x1: wall.from, z1: wall.at, x2: wall.to, z2: wall.at, fixtures },
      );
    }
  }

  return {
    rooms,
    hoseBibs,
    totalWsfu,
    serviceSize,
    wetWalls,
    notes: [
      `${totalWsfu} water supply fixture units → a ${serviceSize} service is the usual starting point; your plumber confirms against local pressure and run length.`,
      "Highlighted wet walls carry two or more plumbing groups — stacking supply and drains there is the cheapest plumbing decision you can make.",
      "Pipe routing, venting, and the permit isometric come from your licensed plumber — this drawing coordinates fixtures, not pipe.",
    ],
  };
}
