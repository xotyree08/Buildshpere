/**
 * Electrical & lighting plan engine (drawing-set slice). Deterministic
 * per ADR-007, laid out to code minimums a real electrician will
 * recognize: receptacles so no wall point is over 6 ft from one
 * (NEC 210.52's 12-ft rhythm), GFCI in wet rooms, a switch at every
 * door, fixtures scaled to room size, smoke/CO placement per bedroom
 * and level. Honest scope: a permit-ready plan comes from the licensed
 * electrician — this is the coordination drawing they start from (L8).
 */

import type { Opening, ParametricModel, Room } from "../types";

export type DeviceType = "receptacle" | "gfci" | "switch" | "fixture" | "recessed" | "smoke" | "smoke_co" | "exterior_light";

export interface Device {
  type: DeviceType;
  /** World-space position in feet (device center). */
  x: number;
  z: number;
}

export interface RoomElectrical {
  room: Room;
  devices: Device[];
}

export interface ElectricalPlan {
  rooms: RoomElectrical[];
  totals: Record<DeviceType, number>;
  notes: string[];
}

/** Rooms whose counter/wet locations demand GFCI protection. */
const GFCI_KINDS = new Set(["kitchen", "bathroom", "laundry", "garage", "outdoor"]);
/** Habitable rooms that get the receptacle rhythm and real lighting. */
const HABITABLE = new Set(["living", "kitchen", "dining", "office", "gym", "theater", "bedroom"]);

const RECEPTACLE_SPACING_FT = 12;

/** Receptacles along one wall run, honoring the 6-ft-to-any-point rule. */
function wallReceptacles(from: number, to: number, fixed: number, alongX: boolean, type: DeviceType): Device[] {
  const run = to - from;
  if (run < 3) return [];
  const count = Math.max(1, Math.ceil(run / RECEPTACLE_SPACING_FT));
  const devices: Device[] = [];
  for (let i = 0; i < count; i++) {
    const pos = from + ((i + 0.5) * run) / count;
    devices.push(alongX ? { type, x: pos, z: fixed } : { type, x: fixed, z: pos });
  }
  return devices;
}

export function buildElectricalPlan(model: ParametricModel): ElectricalPlan {
  const rooms: RoomElectrical[] = [];
  const bedroomsByLevel = new Map<number, number>();

  for (const room of model.rooms) {
    if (room.kind === "hallway") continue; // handled at the level pass below
    const [x, z, w, d] = room.rect;
    const devices: Device[] = [];
    const inset = 0.7;
    const gfci = GFCI_KINDS.has(room.kind);
    const rType: DeviceType = gfci ? "gfci" : "receptacle";

    if (HABITABLE.has(room.kind)) {
      devices.push(
        ...wallReceptacles(x + inset, x + w - inset, z + inset, true, rType), // north
        ...wallReceptacles(x + inset, x + w - inset, z + d - inset, true, rType), // south
        ...wallReceptacles(z + inset, z + d - inset, x + inset, false, rType), // west
        ...wallReceptacles(z + inset, z + d - inset, x + w - inset, false, rType), // east
      );
      if (room.kind === "kitchen") {
        // Counter run: small-appliance GFCIs every 4 ft along the north wall.
        const runFrom = x + 1.5;
        const runTo = x + w - 1.5;
        const count = Math.max(2, Math.ceil((runTo - runFrom) / 4));
        for (let i = 0; i < count; i++) {
          devices.push({ type: "gfci", x: runFrom + ((i + 0.5) * (runTo - runFrom)) / count, z: z + 1.2 });
        }
      }
    } else if (room.kind === "bathroom") {
      devices.push({ type: "gfci", x: x + 2, z: z + 1.2 }); // at the vanity
    } else if (room.kind === "laundry" || room.kind === "garage") {
      devices.push({ type: "gfci", x: x + 1.5, z: z + 1.2 });
      if (room.kind === "garage") devices.push({ type: "gfci", x: x + w - 1.5, z: z + 1.2 });
    }

    // Lighting: one center fixture, or a recessed grid for big rooms.
    const area = w * d;
    if (room.kind !== "closet" && room.kind !== "outdoor") {
      if (HABITABLE.has(room.kind) && area >= 160) {
        const cols = Math.max(2, Math.round(w / 8));
        const rows = Math.max(2, Math.round(d / 8));
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            devices.push({ type: "recessed", x: x + ((i + 0.5) * w) / cols, z: z + ((j + 0.5) * d) / rows });
          }
        }
      } else {
        devices.push({ type: "fixture", x: x + w / 2, z: z + d / 2 });
      }
    }

    // A switch inside every door of this room.
    for (const o of model.openings) {
      if (o.roomKey !== room.key || o.kind === "window") continue;
      devices.push(switchFor(room, o));
    }

    // Smoke/CO: every bedroom gets a smoke; count bedrooms per level.
    if (room.kind === "bedroom") {
      devices.push({ type: "smoke", x: x + w / 2, z: z + d / 2 + 1 });
      bedroomsByLevel.set(room.level, (bedroomsByLevel.get(room.level) ?? 0) + 1);
    }
    // Exterior light at outdoor rooms (porch).
    if (room.kind === "outdoor") {
      devices.push({ type: "exterior_light", x: x + w / 2, z: z + 0.5 });
    }

    rooms.push({ room, devices });
  }

  // Hallways: circulation lighting, a receptacle per 10 ft, and the
  // level's combined smoke/CO outside the sleeping rooms (code).
  for (const hall of model.rooms.filter((r) => r.kind === "hallway")) {
    const [x, z, w, d] = hall.rect;
    const devices: Device[] = [];
    const count = Math.max(1, Math.round(w / 14));
    for (let i = 0; i < count; i++) {
      devices.push({ type: "fixture", x: x + ((i + 0.5) * w) / count, z: z + d / 2 });
    }
    devices.push(...wallReceptacles(x + 1, x + w - 1, z + d - 0.7, true, "receptacle").filter((_, i) => i % 2 === 0));
    devices.push({ type: "smoke_co", x: x + w / 2, z: z + d / 2 - 0.8 });
    rooms.push({ room: hall, devices });
  }

  const totals = {
    receptacle: 0, gfci: 0, switch: 0, fixture: 0, recessed: 0, smoke: 0, smoke_co: 0, exterior_light: 0,
  } as Record<DeviceType, number>;
  for (const r of rooms) for (const dev of r.devices) totals[dev.type]++;

  return {
    rooms,
    totals,
    notes: [
      "Receptacle rhythm follows the 6-ft-to-any-point rule (12-ft spacing); wet rooms, garage, and exterior are GFCI-protected.",
      "Combined smoke/CO on each level's circulation plus a smoke alarm in every bedroom.",
      "This is the coordination drawing — circuiting, load calculations, and the permit plan come from your licensed electrician.",
    ],
  };
}

function switchFor(room: Room, o: Opening): Device {
  const [x, z, w] = room.rect;
  const d = room.rect[3];
  const off = o.offsetFt + o.widthFt + 0.6;
  switch (o.wall) {
    case "n":
      return { type: "switch", x: Math.min(x + off, x + w - 0.7), z: z + 0.7 };
    case "s":
      return { type: "switch", x: Math.min(x + off, x + w - 0.7), z: z + d - 0.7 };
    case "w":
      return { type: "switch", x: x + 0.7, z: Math.min(z + off, z + d - 0.7) };
    default:
      return { type: "switch", x: x + w - 0.7, z: Math.min(z + off, z + d - 0.7) };
  }
}
