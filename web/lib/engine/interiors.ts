/**
 * Interior design engine (DesignSphere's interiors slice). Deterministic
 * per ADR-007: a scheme catalog keyed to architectural styles, per-room
 * furniture layouts placed by rule, and a keyword matcher so "how should
 * it feel" works even before the AI seam is configured. The AI stylist
 * route proposes a scheme from this same catalog — it never invents one.
 */

import type { HomeStyle, Opening, ParametricModel, Room } from "../types";

export interface InteriorScheme {
  key: string;
  label: string;
  blurb: string;
  /** Swatches, hex. */
  wall: string;
  accent: string;
  textile: string;
  wood: string;
  metal: string;
  metalLabel: string;
  lighting: string;
  homeStyles: HomeStyle[];
  keywords: string[];
}

export const INTERIOR_SCHEMES: InteriorScheme[] = [
  {
    key: "warm_craftsman",
    label: "Warm Craftsman",
    blurb: "Amber woods, wool textures, and lantern light — built-in warmth.",
    wall: "#efe6d4", accent: "#7a5c3e", textile: "#a8552f", wood: "#8a5a33", metal: "#6b5b3e", metalLabel: "oil-rubbed bronze",
    lighting: "Warm 2700K, mica shades, picture lights over built-ins.",
    homeStyles: ["craftsman", "prairie", "mountain", "a_frame"],
    keywords: ["warm", "cozy", "craftsman", "wood", "cabin", "amber", "rustic"],
  },
  {
    key: "modern_minimal",
    label: "Modern Minimal",
    blurb: "Gallery walls, low profiles, nothing without a purpose.",
    wall: "#f5f4f1", accent: "#2b2b28", textile: "#b9b5ac", wood: "#c9b795", metal: "#3a3a38", metalLabel: "matte black",
    lighting: "Recessed 3000K, cove uplight, one sculptural pendant per room.",
    homeStyles: ["modern", "minimalist", "luxury_contemporary"],
    keywords: ["minimal", "modern", "clean", "simple", "gallery", "sleek", "uncluttered"],
  },
  {
    key: "scandinavian",
    label: "Scandinavian",
    blurb: "Pale woods, white light, softness everywhere it counts.",
    wall: "#f7f5f0", accent: "#9db4a8", textile: "#d8d3c8", wood: "#d9c6a5", metal: "#b7bcbf", metalLabel: "brushed nickel",
    lighting: "Layered 3500K, paper shades, candles welcome.",
    homeStyles: ["scandinavian"],
    keywords: ["scandinavian", "hygge", "light", "airy", "bright", "nordic", "pale"],
  },
  {
    key: "japandi",
    label: "Japandi",
    blurb: "Low furniture, natural fibers, deliberate emptiness.",
    wall: "#f0ebe0", accent: "#4a4a42", textile: "#c4b8a4", wood: "#a98f6f", metal: "#4a4a42", metalLabel: "blackened steel",
    lighting: "Indirect 2700K, washi lanterns, floor-level accents.",
    homeStyles: ["japandi"],
    keywords: ["japandi", "zen", "calm", "quiet", "japanese", "wabi", "serene", "peaceful"],
  },
  {
    key: "traditional",
    label: "Traditional",
    blurb: "Symmetry, millwork, and rooms that know their manners.",
    wall: "#ece4d3", accent: "#37452f", textile: "#7d3b34", wood: "#5e3a24", metal: "#9a7b3f", metalLabel: "antique brass",
    lighting: "Chandeliers and sconces, 2700K, lamps in every corner.",
    homeStyles: ["traditional", "colonial", "georgian", "cape_cod", "victorian", "tudor"],
    keywords: ["traditional", "classic", "formal", "elegant", "timeless", "heritage"],
  },
  {
    key: "transitional",
    label: "Transitional",
    blurb: "Classic bones, current lines — the diplomatic middle.",
    wall: "#f1ede4", accent: "#5b6570", textile: "#b8aa96", wood: "#8f7350", metal: "#8f8f8a", metalLabel: "pewter",
    lighting: "Mixed 3000K, linen drums, statement over the table.",
    homeStyles: ["ranch", "contemporary"],
    keywords: ["transitional", "balanced", "neutral", "versatile", "family"],
  },
  {
    key: "industrial",
    label: "Industrial",
    blurb: "Exposed structure, leather, iron, and unapologetic scale.",
    wall: "#d9d4cc", accent: "#4d4a45", textile: "#6e4f3a", wood: "#7c6248", metal: "#54514c", metalLabel: "raw steel",
    lighting: "Cage pendants, Edison filaments, track over work zones.",
    homeStyles: ["industrial", "barndominium"],
    keywords: ["industrial", "loft", "urban", "exposed", "brick", "steel", "raw"],
  },
  {
    key: "coastal",
    label: "Coastal",
    blurb: "Sea-glass tones, linen slipcovers, light that moves.",
    wall: "#f4f6f2", accent: "#7fa3ad", textile: "#dfe6e2", wood: "#cbbfa4", metal: "#b7bcbf", metalLabel: "polished chrome",
    lighting: "Bright 3500K, rattan pendants, sheer drapery.",
    homeStyles: ["coastal", "tropical"],
    keywords: ["coastal", "beach", "ocean", "breezy", "nautical", "seaside", "vacation"],
  },
  {
    key: "modern_farmhouse",
    label: "Modern Farmhouse",
    blurb: "Shiplap restraint, black accents, gather-round tables.",
    wall: "#f6f3ec", accent: "#3d3d3a", textile: "#cfc6b6", wood: "#9a7d5a", metal: "#3d3d3a", metalLabel: "matte black",
    lighting: "Lantern pendants, 2700K, under-cabinet task light.",
    homeStyles: ["farmhouse", "modern_farmhouse", "cottage"],
    keywords: ["farmhouse", "shiplap", "rustic", "country", "gather", "barn"],
  },
  {
    key: "midcentury",
    label: "Mid-Century",
    blurb: "Teak, tapered legs, and optimism at furniture scale.",
    wall: "#f2ead9", accent: "#c26e37", textile: "#7d9471", wood: "#9c6b43", metal: "#9a7b3f", metalLabel: "brushed brass",
    lighting: "Sputnik over dining, arc floor lamp, 2700K globes.",
    homeStyles: ["mid_century_modern"],
    keywords: ["midcentury", "mid-century", "retro", "teak", "eames", "sixties", "vintage"],
  },
  {
    key: "art_deco",
    label: "Art Deco",
    blurb: "Velvet, fluting, geometry — luxury with a wink.",
    wall: "#ece2d0", accent: "#274040", textile: "#6d3d4e", wood: "#5a4632", metal: "#9a7b3f", metalLabel: "polished brass",
    lighting: "Fluted sconces, opal globes, drama on dimmers.",
    homeStyles: ["mediterranean", "spanish_revival", "french_country"],
    keywords: ["deco", "glamour", "velvet", "luxe", "gatsby", "dramatic", "jewel"],
  },
  {
    key: "organic_modern",
    label: "Organic Modern",
    blurb: "Curves, boucle, stone, and plants that mean it.",
    wall: "#f3efe6", accent: "#8a8668", textile: "#ddd6c8", wood: "#b09872", metal: "#8f8f8a", metalLabel: "brushed bronze",
    lighting: "Diffuse 3000K, paper and plaster fixtures, daylight first.",
    homeStyles: [],
    keywords: ["organic", "natural", "curves", "boucle", "plants", "earthy", "spa"],
  },
];

export function schemeByKey(key: string | undefined): InteriorScheme | undefined {
  return INTERIOR_SCHEMES.find((s) => s.key === key);
}

/** The scheme an architectural style naturally wears; transitional otherwise. */
export function defaultSchemeFor(style?: HomeStyle): InteriorScheme {
  if (style) {
    const match = INTERIOR_SCHEMES.find((s) => s.homeStyles.includes(style));
    if (match) return match;
  }
  return INTERIOR_SCHEMES.find((s) => s.key === "transitional")!;
}

/** Deterministic "how should it feel" matcher — the no-API-key path. */
export function matchScheme(text: string): { scheme: InteriorScheme; matched: string[] } | null {
  const lower = text.toLowerCase();
  let best: { scheme: InteriorScheme; matched: string[] } | null = null;
  for (const scheme of INTERIOR_SCHEMES) {
    const matched = scheme.keywords.filter((k) => lower.includes(k));
    if (matched.length > 0 && (!best || matched.length > best.matched.length)) {
      best = { scheme, matched };
    }
  }
  return best;
}

// ---------- Furniture layout ----------

export interface FurnitureItem {
  key: string;
  label: string;
  /** World-space footprint in feet (same coordinates as the model). */
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** Which swatch colors it in drawings and 3D. */
  tone: "wood" | "textile" | "accent" | "metal";
}

const WALL_INSET = 0.9; // wall thickness + breathing room

/** Keep a clear arc at the room's hallway door (south wall, centered) —
 * a 3-ft door needs its full swing. */
function doorZone(room: Room): { x: number; z: number; r: number } {
  const [x, z, w, d] = room.rect;
  return { x: x + w / 2, z: z + d, r: 3.2 };
}

function clear(item: { x: number; z: number; w: number; d: number }, zone: { x: number; z: number; r: number }): boolean {
  const cx = Math.max(item.x, Math.min(zone.x, item.x + item.w));
  const cz = Math.max(item.z, Math.min(zone.z, item.z + item.d));
  return (cx - zone.x) ** 2 + (cz - zone.z) ** 2 >= zone.r ** 2;
}

/**
 * Rule-based furnishing per room kind. Everything is clamped inside the
 * room, and nothing lands in the door's swing zone — an item that would
 * is simply omitted (an honest empty corner beats a blocked door).
 */
export function furnishRoom(room: Room, _openings: Opening[] = []): FurnitureItem[] {
  const [x, z, w, d] = room.rect;
  const items: FurnitureItem[] = [];
  const zone = doorZone(room);
  const iw = w - 2 * WALL_INSET; // usable interior width
  const inset = 0.45; // wall thickness — nothing may clip through it
  const add = (key: string, label: string, ix: number, iz: number, fw: number, fd: number, h: number, tone: FurnitureItem["tone"]): boolean => {
    if (ix < x + inset || iz < z + inset || ix + fw > x + w - inset || iz + fd > z + d - inset) return false;
    const item = { key: `${room.key}-${key}`, label, x: ix, z: iz, w: fw, d: fd, h, tone };
    if (!clear(item, zone)) return false;
    items.push(item);
    return true;
  };
  const cx = x + w / 2;

  switch (room.kind) {
    case "bedroom": {
      const king = iw >= 12.2;
      const bw = king ? 6.5 : 5.5;
      const label = king ? "King bed" : "Queen bed";
      // Centered on the window wall when the door swing allows it,
      // otherwise tucked into the quiet corner away from the door.
      const centered = add("bed", label, cx - bw / 2, z + WALL_INSET, bw, 7, 2.2, "textile");
      const bedX = centered ? cx - bw / 2 : x + WALL_INSET;
      if (!centered && !add("bed", "Queen bed", bedX, z + WALL_INSET, 5.5, 7, 2.2, "textile")) break;
      const usedBw = centered ? bw : 5.5;
      add("ns1", "Nightstand", bedX - 1.8, z + WALL_INSET, 1.5, 1.5, 2, "wood");
      add("ns2", "Nightstand", bedX + usedBw + 0.3, z + WALL_INSET, 1.5, 1.5, 2, "wood");
      add("dresser", "Dresser", x + w - WALL_INSET - 1.8, z + d - WALL_INSET - 5, 1.8, 5, 2.8, "wood");
      break;
    }
    case "living": {
      add("sofa", "Sofa", x + WALL_INSET, z + d / 2 - 3.5, 3, 7, 2.4, "textile");
      add("coffee", "Coffee table", x + WALL_INSET + 4, z + d / 2 - 2, 2, 4, 1.4, "wood");
      add("media", "Media console", x + w - WALL_INSET - 1.6, z + d / 2 - 2.75, 1.6, 5.5, 1.8, "wood");
      add("chair", "Armchair", x + WALL_INSET + 1, z + WALL_INSET + 0.5, 2.8, 2.8, 2.4, "accent");
      break;
    }
    case "kitchen": {
      add("counter-n", "Counter run", x + WALL_INSET, z + WALL_INSET, iw, 2.1, 3, "wood");
      if (iw >= 11 && d >= 11) add("island", "Island", cx - 3.5, z + d / 2 - 1.75, 7, 3.5, 3, "accent");
      break;
    }
    case "dining": {
      add("table", "Dining table", cx - 3, z + d / 2 - 1.9, 6, 3.8, 2.5, "wood");
      break;
    }
    case "office": {
      add("desk", "Desk", cx - 2.5, z + WALL_INSET, 5, 2.4, 2.5, "wood");
      add("shelf", "Bookshelf", x + w - WALL_INSET - 1.3, z + WALL_INSET, 1.3, 4, 6.5, "wood");
      break;
    }
    case "bathroom": {
      add("vanity", "Vanity", x + WALL_INSET, z + WALL_INSET, Math.min(4.5, iw), 1.9, 3, "wood");
      add("shower", "Shower / tub", x + w - WALL_INSET - 2.6, z + WALL_INSET, 2.6, Math.min(4.5, d - 2 * WALL_INSET), 6.5, "metal");
      break;
    }
    case "theater": {
      add("sectional", "Sectional", cx - 4, z + d - WALL_INSET - 3.2, 8, 3.2, 2.4, "textile");
      add("screen", "Screen wall", cx - 4.5, z + WALL_INSET, 9, 0.6, 5.5, "accent");
      break;
    }
    case "gym": {
      add("rack", "Equipment rack", x + WALL_INSET, z + WALL_INSET, 5.5, 2.2, 6, "metal");
      add("mat", "Training mat", cx - 3, z + d / 2, 6, 4, 0.15, "textile");
      break;
    }
    case "laundry": {
      add("washer", "Washer", x + WALL_INSET, z + WALL_INSET, 2.5, 2.4, 3.1, "metal");
      add("dryer", "Dryer", x + WALL_INSET + 2.7, z + WALL_INSET, 2.5, 2.4, 3.1, "metal");
      break;
    }
    case "mudroom": {
      add("bench", "Bench + cubbies", x + WALL_INSET, z + WALL_INSET, Math.min(5, iw), 1.6, 4.5, "wood");
      break;
    }
    default:
      break; // hallway, closet, garage, outdoor: no staged furniture
  }
  return items;
}

export interface RoomDesign {
  room: Room;
  furniture: FurnitureItem[];
  /** Wall paint for this room from the scheme (accent rooms differ). */
  paint: string;
  paintLabel: string;
  notes: string[];
}

/** Rooms that take the scheme's accent treatment. */
const ACCENT_KINDS = new Set(["dining", "office", "theater"]);

export function designBoard(model: ParametricModel, scheme: InteriorScheme): RoomDesign[] {
  return model.rooms
    .filter((r) => r.kind !== "hallway" && r.kind !== "garage" && r.kind !== "closet" && r.kind !== "outdoor")
    .map((room) => {
      const accent = ACCENT_KINDS.has(room.kind);
      return {
        room,
        furniture: furnishRoom(room),
        paint: accent ? scheme.accent : scheme.wall,
        paintLabel: accent ? "accent" : "field",
        notes: [
          `Metals: ${scheme.metalLabel}.`,
          scheme.lighting,
        ],
      };
    });
}

/** Every piece of staged furniture, world-space — feeds the 3D scene. */
export function furnitureForModel(model: ParametricModel): FurnitureItem[] {
  return model.rooms.flatMap((room) => furnishRoom(room));
}
