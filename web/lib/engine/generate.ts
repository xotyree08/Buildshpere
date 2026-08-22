/**
 * Deterministic concept generator: DesignBrief → parametric floor-plan concepts.
 *
 * ADR-007: this engine is deterministic code. The conversational AI collects the
 * brief and narrates results; it never invents geometry. Same brief → same plans.
 *
 * Layout strategy (MVP, rectilinear): rooms are packed into rows ("shelves")
 * against a central hallway spine, level by level. Three variants differ in
 * footprint shape and how public space is grouped.
 */

import type {
  DesignBrief,
  DesignConcept,
  HomeStyle,
  Opening,
  ParametricModel,
  ProgramRequirements,
  Room,
  RoomKind,
} from "../types";
import { conceptName, styleInfo, type MassingKey } from "../catalog/styles";
import { massingBias, PORCH_STYLES } from "./roof";
import { exteriorRuns, MIN_OPENING_RUN_FT, sharedWall, WALL_FT, WALL_SIDES, type WallSide } from "./adjacency";
import { ordinals, roomKey } from "./ids";
import { distortion, itemArea, tile, type TileItem } from "./tile";

export interface RoomSpec {
  kind: RoomKind;
  label: string;
  areaSqft: number;
  /** Preferred width:depth aspect. */
  aspect: number;
  public: boolean;
  /**
   * Rooms that belong to one another — a primary suite, where the bath and
   * the walk-in open off the bedroom rather than sitting somewhere else in
   * the house. A suite is one cell to the tiler and tiles its own interior,
   * so nothing can be placed between its rooms.
   */
  suite?: string;
  /**
   * Identity, carried from wherever this room came from. A revision re-packs
   * the storey, so a key minted during packing changes every time the geometry
   * is recomputed and nothing downstream can say this is the same kitchen as
   * before. Specs that already have one keep it; the rest are named here once.
   */
  key?: string;
  /**
   * Narrowest this room can be, when what has to fit in it is not implied by
   * its kind. Two cars park side by side or they do not park: the width
   * search shrank a two-car garage to 17.9ft across, and the plan read fine
   * on every other measure while being a garage you cannot use.
   */
  minFt?: number;
}

const HALL_WIDTH_FT = 4;

/** Below this a room stops being a room. */
const MIN_ROOM_FT = 4;

function programRooms(p: ProgramRequirements, style?: HomeStyle): RoomSpec[] {
  const specs: RoomSpec[] = [
    { kind: "living", label: "Living Room", areaSqft: 320, aspect: 1.3, public: true },
    { kind: "kitchen", label: "Kitchen", areaSqft: 200, aspect: 1.4, public: true },
    { kind: "dining", label: "Dining Room", areaSqft: 168, aspect: 1.2, public: true },
    // The service rooms are one cell. A powder room is thirty square feet —
    // too little to be placed on its own without coming out a slot — and a
    // laundry, a mechanical closet and a powder room share their plumbing
    // wall anyway, so grouping them is both the fix and the right plan.
    { kind: "laundry", label: "Laundry", areaSqft: 64, aspect: 1.0, public: false, suite: "service" },
    { kind: "closet", label: "Mechanical / Storage", areaSqft: 48, aspect: 1.0, public: false, suite: "service" },
  ];
  for (let i = 1; i <= p.bedrooms; i++) {
    const primary = i === 1;
    specs.push({
      kind: "bedroom",
      label: primary ? "Primary Bedroom" : `Bedroom ${i}`,
      areaSqft: primary ? 240 : 156,
      aspect: 1.2,
      public: false,
      suite: primary ? "primary" : undefined,
    });
  }
  // Every primary suite has a walk-in. Leaving it out of the programme is part
  // of why the primary bath had nothing to pair with and ended up loose in the
  // plan, on the far side of the house from the bedroom it serves.
  specs.push({
    kind: "closet",
    label: "Walk-in Closet",
    areaSqft: 60,
    aspect: 1.2,
    public: false,
    suite: "primary",
  });
  // "2.5 baths" is a real program: full baths plus a powder room. The
  // half bath is its own smaller room — engines downstream recognize it
  // by the "Powder Room" label (lavatory + water closet, no shower).
  const fullBaths = Math.max(1, Math.floor(p.bathrooms));
  const hasHalfBath = p.bathrooms - fullBaths >= 0.25;
  for (let i = 1; i <= fullBaths; i++) {
    specs.push({
      kind: "bathroom",
      label: i === 1 ? "Primary Bath" : `Bath ${i}`,
      areaSqft: i === 1 ? 90 : 60,
      aspect: 1.4,
      public: false,
      suite: i === 1 ? "primary" : undefined,
    });
  }
  if (hasHalfBath) {
    specs.push({
      kind: "bathroom",
      label: "Powder Room",
      areaSqft: 30,
      // Powder rooms are narrow and deep — a lavatory and a water closet in
      // line. Asking for 1.5 asked for a shape nobody builds.
      aspect: 0.5,
      public: false,
      suite: "service",
    });
  }
  if (p.office) specs.push({ kind: "office", label: "Office", areaSqft: 132, aspect: 1.1, public: false });
  if (p.gym) specs.push({ kind: "gym", label: "Gym", areaSqft: 180, aspect: 1.3, public: false });
  if (p.theater) specs.push({ kind: "theater", label: "Theater", areaSqft: 220, aspect: 1.4, public: false });
  if (p.outdoorKitchen)
    specs.push({ kind: "outdoor", label: "Outdoor Kitchen", areaSqft: 140, aspect: 1.5, public: true });
  if (p.garageBays > 0)
    specs.push({
      kind: "garage",
      label: `${p.garageBays}-Car Garage`,
      areaSqft: 264 * p.garageBays,
      aspect: p.garageBays >= 2 ? 1.6 : 0.8,
      // Nine and a half feet per bay, plus a couple for the walls between the
      // cars and the studs: a two-car garage is twenty-one feet across.
      minFt: 9.5 * p.garageBays + 2,
      public: false,
    });
  // Porch styles carry their identity in the plan, not just the price.
  if (style && PORCH_STYLES.has(style))
    specs.push({ kind: "outdoor", label: "Front Porch", areaSqft: 120, aspect: 2.5, public: true });

  // A target square footage scales every livable room proportionally —
  // clamped so rooms never shrink below usable or balloon past sense.
  if (p.targetSqft && p.targetSqft > 0) {
    const livable = specs.filter((s) => s.kind !== "garage" && s.kind !== "outdoor");
    const base = livable.reduce((sum, s) => sum + s.areaSqft, 0);
    const scale = Math.min(1.8, Math.max(0.65, p.targetSqft / base));
    for (const s of livable) s.areaSqft = Math.round(s.areaSqft * scale);
  }
  return specs;
}

/**
 * Interior partitions come from ./adjacency, which is also where every engine
 * asking "do these rooms share a wall?" gets its answer. Modelling the wall is
 * what keeps gross floor area honestly above the sum of the rooms, and it is
 * what leaves the layout editor somewhere to put a room: pack a storey with no
 * wall thickness at all and every interior room is wedged solid, unable to
 * move a single grid step in any direction.
 */

/**
 * Shallowest a zone may be and still hold rooms rather than strips.
 *
 * Halving a storey guarantees it a corridor, but half of a shallow storey is
 * a seven-foot band, and a primary bedroom in one came out 33.9ft x 6.9ft.
 * A storey too shallow to halve is left whole, with its landing across the end.
 */
const MIN_ZONE_DEPTH_FT = 12;

/** Circulation as a share of the storey — real homes run 10-15%. */
const HALL_FRACTION = 0.11;

/**
 * Where a room sits in the sequence you walk through a house.
 *
 * The day side of a house faces the street and the night side does not, and a
 * plan that ignores that is a list of rectangles rather than a home. Two
 * zones, a corridor between them: everything you arrive into and entertain in
 * at the front, everything you sleep and wash and launder in behind.
 */
const ZONE_FRONT = 0;
const ZONE_BACK = 1;

function zoneOf(spec: RoomSpec): number {
  if (spec.kind === "living" || spec.kind === "kitchen" || spec.kind === "dining") return ZONE_FRONT;
  if (spec.kind === "office" || spec.kind === "theater" || spec.kind === "gym") return ZONE_FRONT;
  return ZONE_BACK;
}

/**
 * Narrowest each kind of room can usefully be — what has to fit in it, not
 * what the code allows. A bedroom takes a queen bed and a way past it; a
 * living room takes a sofa and a walkway; a closet takes neither.
 */
const MIN_WIDTH: Partial<Record<RoomKind, number>> = {
  bedroom: 11,
  living: 11,
  dining: 10,
  kitchen: 9,
  office: 8,
  gym: 9,
  theater: 10,
  bathroom: 5,
  laundry: 5,
  closet: 4.5,
};

/**
 * Build the tiling items for a storey, grouping rooms that must end up
 * touching. A group is one cell to the tiler and tiles its own interior, so
 * an ensuite cannot be separated from its bedroom by anything at all.
 */
function tileItems(specs: RoomSpec[]): TileItem[] {
  const items: TileItem[] = [];
  const suites = new Map<string, TileItem>();
  // A room much smaller than the rest of its storey has nowhere good to go: a
  // 60sqft bathroom placed among 200sqft rooms takes a full-depth strip and
  // comes out 3.6ft wide. Pairing the small ones gives them a cell to share,
  // which is both what fixes the shape and where a plan puts them anyway.
  const loose = specs.filter((spec) => !spec.suite);
  const mean = loose.reduce((sum, spec) => sum + spec.areaSqft, 0) / Math.max(1, loose.length);
  const small = loose
    .filter((spec) => spec.areaSqft < mean * 0.75)
    .sort((a, b) => b.areaSqft - a.areaSqft || a.label.localeCompare(b.label));
  const paired = new Map<string, string>();
  for (let i = 0; i + 1 < small.length; i += 2) {
    paired.set(small[i].label, `pair${i}`);
    paired.set(small[i + 1].label, `pair${i}`);
  }
  // An odd one out joins the last pair rather than standing alone, which is
  // the situation this exists to prevent.
  if (small.length > 2 && small.length % 2 === 1) {
    paired.set(small[small.length - 1].label, paired.get(small[small.length - 2].label)!);
  }
  for (const spec of specs) {
    // Tile the room PLUS its share of the walls. The rectangle drawn is the
    // interior, half a partition inside each face, so a cell sized to the
    // programme area hands back a room several percent short of it — and the
    // shortfall lands on the customer's square footage and their estimate.
    const depth = Math.sqrt(spec.areaSqft / spec.aspect);
    const width = spec.areaSqft / depth;
    const leaf: TileItem = {
      key: spec.label,
      areaSqft: spec.areaSqft + WALL_FT * (width + depth),
      aspect: spec.aspect,
      // The floor applies to the CELL and the room sits half a partition
      // inside each face of it, so the wall is added on — otherwise a ten-foot
      // minimum hands back a nine-and-a-half-foot room. A powder room is the
      // one bathroom that is genuinely narrow.
      minFt: (spec.minFt ?? (/powder/i.test(spec.label) ? 3 : (MIN_WIDTH[spec.kind] ?? 0))) + WALL_FT,
      // Habitable rooms have to reach an outside wall — a window is not a
      // finish, it is how you see out and how you get out.
      needsLight: HABITABLE.includes(spec.kind),
    };
    const groupKey = spec.suite ?? paired.get(spec.label);
    if (!groupKey) {
      items.push(leaf);
      continue;
    }
    let group = suites.get(groupKey);
    if (!group) {
      group = { key: `group:${groupKey}`, areaSqft: 0, aspect: 1.15, children: [], minFt: 0 };
      suites.set(groupKey, group);
      items.push(group);
    }
    group.children!.push(leaf);
    // A group is only as placeable as its most demanding room. Without this
    // the tiler happily gave a primary suite a cell seven feet deep and then
    // discovered, one level down, that a bedroom does not fit in seven feet.
    group.minFt = Math.max(group.minFt ?? 0, leaf.minFt ?? 0);
  }

  // Pairing only helps a small room that has another small room to pair with.
  // On the sleeping side of a wide single storey there is exactly one — the
  // hall bath, with the laundry and the mechanical closet already claimed by
  // the service group — so it stood alone among two-hundred-square-foot
  // bedrooms and took a full-depth strip: 3.6ft x 16.3ft. A lone small room
  // joins the smallest group on its storey instead. Next to the laundry is
  // where a hall bath goes anyway, and the two then share a wet wall.
  // A group of one is not a group — upstairs the laundry stays downstairs and
  // the service group is left holding the mechanical closet alone, which is a
  // leaf wearing a group's clothes and hides from the rule below.
  for (const item of items) {
    if (item.children && item.children.length === 1) {
      const only = item.children[0];
      item.key = only.key;
      item.areaSqft = only.areaSqft;
      item.aspect = only.aspect;
      item.minFt = only.minFt;
      delete item.children;
    }
  }
  // Only service rooms are folded. A kitchen can be the smallest cell on the
  // day side of a compact storey and it is still a room in its own right:
  // folding one into a cell with the dining room turned it into 9.2ft x 21.6ft.
  const foldable = new Set(
    specs.filter((spec) => ["bathroom", "closet", "laundry"].includes(spec.kind)).map((spec) => spec.label),
  );
  const meanCell = items.reduce((sum, item) => sum + itemArea(item), 0) / Math.max(1, items.length);
  for (const item of [...items]) {
    if (item.children || !foldable.has(item.key) || itemArea(item) >= meanCell * 0.6) continue;
    // Pair with the smallest room that is not already spoken for, and only
    // fall back to an existing group if there is none. Sharing a cell with
    // one other room is what stops a 55sqft closet taking the full depth of
    // a sleeping zone and coming out 3.7ft across; folding it into the primary
    // suite would fix the shape by putting the furnace in the wardrobe.
    const others = items.filter((other) => other !== item);
    const leaves = others.filter((other) => !other.children);
    const host = (leaves.length > 0 ? leaves : others).sort(
      (a, b) => itemArea(a) - itemArea(b) || a.key.localeCompare(b.key),
    )[0];
    if (!host) continue;
    if (!host.children) {
      const moved: TileItem = { ...host };
      host.key = `group:${host.key}`;
      host.areaSqft = 0;
      host.aspect = 1.15;
      host.children = [moved];
    }
    host.children.push(item);
    host.minFt = Math.max(host.minFt ?? 0, item.minFt ?? 0);
    items.splice(items.indexOf(item), 1);
  }
  return items;
}

/** Split a storey into two near-equal halves, largest rooms first. */
function halve(specs: RoomSpec[]): RoomSpec[][] {
  if (specs.length < 2) return [specs];
  const sorted = [...specs].sort((a, b) => b.areaSqft - a.areaSqft || a.label.localeCompare(b.label));
  const total = sorted.reduce((sum, spec) => sum + spec.areaSqft, 0);
  const front: RoomSpec[] = [];
  let running = 0;
  for (const spec of sorted) {
    if (running < total / 2 || front.length === 0) {
      front.push(spec);
      running += spec.areaSqft;
    }
  }
  const back = sorted.filter((spec) => !front.includes(spec));
  return back.length > 0 ? [front, back] : [sorted];
}

/**
 * Lay out one storey by tiling the buildable rectangle.
 *
 * Depth is computed from the programme rather than discovered afterwards, so
 * a plan is as deep as its rooms need and no deeper. The old packer worked the
 * other way round — stack bands, then find out you had built a hundred-foot
 * house on an eighty-five-foot lot — and every attempt to claw that back cost
 * a room its proportions.
 */
function packLevel(specs: RoomSpec[], level: number, maxRowWidthFt: number): Room[] {
  const rooms: Room[] = [];
  let halls = 0;
  if (specs.length === 0) return rooms;

  // Outdoor rooms are not tiled with the interior. A porch belongs across the
  // front of the house and a covered terrace across the back; tiled in with
  // everything else the porch came out 4.7ft x 27.3ft, standing on its end
  // beside the living room.
  const isPorch = (spec: RoomSpec) => spec.kind === "outdoor" && /porch/i.test(spec.label);
  const porches = specs.filter(isPorch);
  const terraces = specs.filter((spec) => spec.kind === "outdoor" && !isPorch(spec));
  // A garage is a mass, not a room to be tiled: two cars park side by side or
  // they do not park, and a tiler asked to fill a rectangle will return one
  // 20ft wide and 26ft deep. It stands at the front with the porch beside it,
  // at the size it actually is — a garage-forward house with a porch off the
  // entry, the commonest plan there is.
  const garages = specs.filter((spec) => spec.kind === "garage");
  const indoor = specs.filter((spec) => spec.kind !== "outdoor" && spec.kind !== "garage");

  const width = Math.max(MIN_ROOM_FT * 2, maxRowWidthFt);
  const emit = (spec: RoomSpec, rect: [number, number, number, number]) => {
    rooms.push({
      key: spec.key!,
      kind: spec.kind,
      label: spec.label,
      level,
      // Half a partition inside each face: the rectangle is the room, not the
      // room plus its share of the walls.
      rect: [
        round1(rect[0] + WALL_FT / 2),
        round1(rect[1] + WALL_FT / 2),
        Math.max(round1(rect[2] - WALL_FT), 1),
        Math.max(round1(rect[3] - WALL_FT), 1),
      ],
    });
  };

  /** An outdoor room as a strip across a face, at the proportions it asked for. */
  const strip = (group: RoomSpec[], z: number): number => {
    if (group.length === 0) return 0;
    const area = group.reduce((sum, spec) => sum + spec.areaSqft, 0);
    const aspect = group[0].aspect;
    // The strip takes the shape it asked for, and only spreads thinner if
    // that shape will not fit across the face. Clamping it the other way
    // round is what laid a covered terrace out 34ft x 3.5ft.
    const depth = Math.max(Math.sqrt(area / aspect), area / width);
    let x = 0;
    for (const spec of group) {
      const w = spec.areaSqft / depth;
      emit(spec, [x, z, w, depth]);
      x = round1(x + w);
    }
    return round1(depth);
  };

  let z = 0;
  let frontDepth = 0;
  let frontX = 0;
  // The porch takes the frontage first: it is the thing you walk up to, and a
  // porch behind the garage is not a front porch. A garage pushed onto the
  // second line still has its flanks, and opens through one of those — a
  // side-loaded garage, which is a plan builders draw on purpose.
  for (const spec of [...porches, ...garages]) {
    // Each keeps the shape it asked for. If what is left of the width cannot
    // take it, it goes on the next line rather than being squeezed into the
    // gap — squeezing turned a porch into a 3.5ft x 29.5ft passage.
    const natural = Math.sqrt(spec.areaSqft / spec.aspect);
    const wanted = spec.areaSqft / natural;
    if (frontX > 0 && wanted > width - frontX) {
      z = round1(z + frontDepth);
      frontX = 0;
      frontDepth = 0;
    }
    const w = Math.min(wanted, width);
    emit(spec, [frontX, z, w, spec.areaSqft / w]);
    frontX = round1(frontX + w);
    frontDepth = Math.max(frontDepth, spec.areaSqft / w);
  }
  z = round1(z + frontDepth);

  // Every area below is the room PLUS its share of the walls, because that is
  // what the tiler places; measuring the rectangle from bare room areas and
  // then filling it with walled ones overflows it and distorts everything.
  const walled = (group: RoomSpec[]) =>
    tileItems(group).reduce((sum, item) => sum + itemArea(item), 0);
  const roomArea = walled(indoor);
  const split = [ZONE_FRONT, ZONE_BACK]
    .map((zone) => indoor.filter((spec) => zoneOf(spec) === zone))
    .filter((group) => group.length > 0);
  // A day side and a night side is a ground-floor idea. Upstairs everything is
  // private, so one of the two zones ends up holding a single small room and
  // gets a band of the storey's depth in proportion to it: an office alone in
  // the front zone of an upper floor came out 40.8ft x 2.8ft. A zone that
  // small is not a zone — the storey is simply one.
  const smallest = split.length > 1 ? Math.min(...split.map(walled)) : 0;
  const lopsided = split.length > 1 && smallest / roomArea < 0.2;
  // Every storey needs circulation — an upper floor has a landing and a hall
  // just as a ground floor does. When the day/night split does not apply, or
  // leaves one side too small to be a zone of its own, the storey is halved
  // by area instead so there is still a corridor through it.
  const zones =
    roomArea / width < MIN_ZONE_DEPTH_FT * 2
      ? [indoor]
      : split.length > 1 && !lopsided
        ? split
        : halve(indoor);
  // Circulation exists on every storey, including one laid as a single zone —
  // computing it only for split storeys emitted a landing of zero depth.
  const hallDepth = Math.max(HALL_WIDTH_FT, (roomArea * HALL_FRACTION) / width);
  const bodyDepth = roomArea / width;

  for (const [index, zone] of zones.entries()) {
    const depth = (bodyDepth * walled(zone)) / roomArea;
    // Which sides of this band are the outside of the house. The flanks
    // always are. The front is only outside when nothing stands in front of
    // it, and the back only when nothing follows — the corridor between two
    // zones is not daylight, and counting it as such kept landlocking
    // bedrooms in the middle of the sleeping side.
    const edges = {
      w: true,
      e: true,
      n: index === 0 && porches.length === 0 && garages.length === 0,
      s: index === zones.length - 1 && terraces.length === 0,
    };
    for (const placed of tile(tileItems(zone), [0, z, width, depth], edges)) {
      const spec = zone.find((candidate) => candidate.label === placed.key);
      if (spec) emit(spec, placed.rect);
    }
    z = round1(z + depth);
    // A storey too shallow to halve still needs its landing; it goes across
    // the end rather than through the middle.
    if (index + 1 < zones.length || zones.length === 1) {
      rooms.push({
        key: roomKey(level, "hallway", ++halls),
        kind: "hallway",
        label: level === 0 ? "Hall" : `Hall L${level + 1}`,
        level,
        rect: [
          round1(WALL_FT / 2),
          round1(z + WALL_FT / 2),
          round1(width - WALL_FT),
          round1(hallDepth - WALL_FT),
        ],
      });
      z = round1(z + hallDepth);
    }
  }

  strip(terraces, z);
  return rooms;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Rooms that get daylight: a bedroom needs a window, a closet does not. */
const HABITABLE: RoomKind[] = ["bedroom", "living", "dining", "kitchen", "office", "gym", "theater"];

/** A window opening, and how far apart a row of them sits on one wall. */
const WINDOW_FT = 4;
const WINDOW_SPACING_FT = 7;
/** Bath and utility windows are narrow and high — privacy, not a view. */
const SMALL_WINDOW_FT = 2.5;
/** Windows stop this far short of a corner — you cannot trim one into a corner. */
const CORNER_INSET_FT = 1.2;
/** Rooms that take a small window rather than none at all. */
const LIT_SERVICE: RoomKind[] = ["bathroom", "laundry"];

/**
 * Doors and windows on the walls that actually have them.
 *
 * This used to put every window on the room's north wall, on the theory that
 * north is the street. That was true of the front row and of nothing else: a
 * generated house came back with its windows buried in interior partitions in
 * the middle of the plan and every outside wall blank. The 3D view of it was a
 * shoebox. Now each wall is asked which stretches of itself face outdoors, and
 * the openings go there.
 */
function addOpenings(model: ParametricModel): void {
  let key = 0;
  const add = (
    kind: Opening["kind"],
    room: Room,
    wall: WallSide,
    offsetFt: number,
    widthFt: number,
  ) => {
    model.openings.push({ key: `o${key++}`, kind, roomKey: room.key, wall, offsetFt: round1(offsetFt), widthFt });
  };

  for (let level = 0; level < model.levels; level++) {
    const rooms = model.rooms.filter((r) => r.level === level);
    const halls = rooms.filter((r) => r.kind === "hallway");
    const street = Math.min(...rooms.map((r) => r.rect[1]));

    // Outside wall, by room and by face, with the doors taken out of it as
    // they are placed. Windows are laid into what is left, so a front door
    // and a window no longer come out of the wall in the same three feet.
    const free = new Map<string, { from: number; to: number }[]>();
    const at = (room: Room, side: WallSide) => `${room.key}:${side}`;
    for (const room of rooms) {
      for (const side of WALL_SIDES) free.set(at(room, side), exteriorRuns(room, rooms, side));
    }
    const widest = (room: Room, side: WallSide) =>
      free.get(at(room, side))!.reduce<{ from: number; to: number } | null>(
        (best, run) => (!best || run.to - run.from > best.to - best.from ? run : best),
        null,
      );
    const consume = (room: Room, side: WallSide, from: number, to: number) => {
      const runs = free.get(at(room, side))!;
      free.set(
        at(room, side),
        runs.flatMap((run) => {
          if (to <= run.from || from >= run.to) return [run];
          const left = { from: run.from, to: Math.min(from, run.to) };
          const right = { from: Math.max(to, run.from), to: run.to };
          return [left, right].filter((piece) => piece.to - piece.from >= MIN_OPENING_RUN_FT);
        }),
      );
    };

    // The garage door, on the outside wall facing the street. A garage with
    // its door on an interior partition is a garage you cannot drive into,
    // and the driveway in every view is drawn from wherever this lands.
    for (const garage of rooms.filter((r) => r.kind === "garage")) {
      // The street face if it has one, else the widest outside wall it has —
      // side-loaded and alley-loaded garages are both real, and a garage whose
      // only outside wall faces the back still has to open somewhere.
      // Only walls with room for a bay are candidates, and the street face
      // wins among those. Preferring north outright picked a four-foot strip
      // of frontage beside the porch and then gave up, leaving the garage with
      // no vehicle door at all while twenty-four feet of flank stood free.
      const best = WALL_SIDES.map((side) => ({ side, run: widest(garage, side) }))
        .filter((o): o is { side: WallSide; run: { from: number; to: number } } =>
          o.run !== null && o.run.to - o.run.from >= 9)
        .sort(
          (a, b) =>
            (a.side === "n" ? 0 : 1) - (b.side === "n" ? 0 : 1) ||
            b.run.to - b.run.from - (a.run.to - a.run.from),
        )[0];
      if (!best) continue;
      const bay = Math.min(best.run.to - best.run.from - 1, 16);
      const from = (best.run.from + best.run.to) / 2 - bay / 2;
      add("door", garage, best.side, from, round1(bay));
      consume(garage, best.side, from, from + bay);
    }

    // The front door, on the street face of whatever you arrive into: the
    // porch if there is one, then the public rooms in the order a plan puts
    // them. Requiring the entry to touch the street line left a garage-forward
    // house with no front door at all — nothing but the garage was that far
    // forward, and the door belongs behind it, still facing the street.
    if (level === 0) {
      const rank = (room: Room) =>
        room.kind === "outdoor" ? 0
        : room.kind === "living" ? 1
        : room.kind === "dining" ? 2
        : room.kind === "kitchen" ? 3
        : 4;
      const entries = rooms
        .filter((r) => r.kind !== "garage" && r.kind !== "hallway")
        .sort((a, b) => rank(a) - rank(b) || a.rect[1] - b.rect[1]);
      // The street face first. When nothing has one — a narrow lot where the
      // garage spans the whole frontage, which is a plan builders really do
      // draw — the door goes in the flank, and you walk up the side of the
      // house to it. Insisting on a street-facing door left that plan with no
      // way in at all.
      let placed = false;
      for (const side of ["n", "w", "e", "s"] as const) {
        for (const entry of entries) {
          const run = widest(entry, side);
          if (!run || run.to - run.from < 5) continue;
          const from = (run.from + run.to) / 2 - 1.75;
          add("door", entry, side, from, 3.5);
          consume(entry, side, from - 0.5, from + 4);
          placed = true;
          break;
        }
        if (placed) break;
      }
    }

    for (const room of rooms) {
      if (room.kind === "hallway") continue;

      // The way in from indoors. A room is entered from the hallway it
      // touches, through the middle of the run they share, which is what makes
      // the walkthrough walk and the plan read. Without a hall to open off — a
      // porch, a garage, a room on a storey with no corridor — the door goes
      // in the longest wall that is not an outside wall, rather than always
      // facing south because south was where the corridor used to be.
      const hall = halls
        .map((h) => ({ h, wall: sharedWall(room.rect, h.rect) }))
        .filter((c) => c.wall && c.wall.to - c.wall.from >= 3)
        .sort((a, b) => b.wall!.to - b.wall!.from - (a.wall!.to - a.wall!.from))[0];
      // The way from the garage into the house is a person door. Making it
      // nine feet wide gave the garage two vehicle-sized doors, and every
      // renderer that looks for "the widest door" to find the one you drive
      // through could pick the one into the hallway.
      const doorWidth = room.kind === "outdoor" ? 6 : 3;
      if (hall) {
        const [x, z, w, d] = room.rect;
        const { axis, at: line, from, to } = hall.wall!;
        const mid = (from + to) / 2;
        const side: WallSide = axis === "z" ? (line < z + d / 2 ? "n" : "s") : line < x + w / 2 ? "w" : "e";
        const along = axis === "z" ? mid - x : mid - z;
        add(room.kind === "outdoor" ? "opening" : "door", room, side, Math.max(0, along - doorWidth / 2), doorWidth);
      } else {
        const inside = WALL_SIDES.map((side) => {
          const span = side === "n" || side === "s" ? room.rect[2] : room.rect[3];
          const outside = free.get(at(room, side))!.reduce((sum, r) => sum + (r.to - r.from), 0);
          return { side, run: span - outside, span };
        }).sort((a, b) => b.run - a.run)[0];
        add(
          room.kind === "outdoor" ? "opening" : "door",
          room,
          inside.side,
          Math.max(0, inside.span / 2 - doorWidth / 2),
          doorWidth,
        );
      }

      // A porch is already open — it is drawn as a railing, and cutting a
      // window into a railing is not a window, it is a gap in a fence.
      const lit = HABITABLE.includes(room.kind);
      if (!lit && !LIT_SERVICE.includes(room.kind)) continue;
      const width = lit ? WINDOW_FT : SMALL_WINDOW_FT;
      for (const side of WALL_SIDES) {
        for (const run of free.get(at(room, side))!) {
          const usable = run.to - run.from - CORNER_INSET_FT * 2;
          // A hair of slack, because these are differences of rounded
          // dimensions: a kitchen's seven-foot strip of outside wall measured
          // 3.999999999999996 feet of usable run and came back windowless.
          if (usable < width - 1e-6) continue;
          // One window every seven feet or so, spread evenly down the run — a
          // wall with three evenly spaced windows reads as a house, one with a
          // single window floating at its midpoint does not.
          const n = Math.max(1, Math.round(usable / WINDOW_SPACING_FT));
          for (let i = 0; i < n; i++) {
            const centre = run.from + CORNER_INSET_FT + ((i + 0.5) * usable) / n;
            add("window", room, side, centre - width / 2, width);
          }
        }
      }
    }
  }
}

/**
 * Pack per-level room specs into a complete model with openings.
 * Shared by initial generation and by the revision engine, so a revised
 * program flows through exactly the same layout rules.
 */
export function assembleModel(levelSpecs: RoomSpec[][], maxRowWidthFt: number): ParametricModel {
  // Identity is settled before any geometry is computed, and once — the width
  // search below packs the storey seven times, and keys minted during packing
  // would differ between candidates as well as between revisions.
  const next = ordinals();
  for (const [level, specs] of levelSpecs.entries()) {
    for (const spec of specs) {
      if (!spec.key) spec.key = roomKey(level, spec.kind, next(`${level}:${spec.kind}`));
    }
  }
  // The footprint is chosen, not inherited. Taking the full width the lot
  // allows is what put a bedroom at 30.6ft x 4.9ft on a 75ft lot: a wide,
  // shallow storey gives every full-depth room the storey's depth, and on a
  // shallow storey that is a corridor. Narrower storeys are packed too and
  // scored the same way the tiler scores its own rows, so the proportions of
  // the house and the proportions of its rooms are decided by one standard.
  const targets = new Map<string, { aspect: number; minFt: number }>();
  for (const specs of levelSpecs) {
    for (const spec of specs) {
      targets.set(spec.label, {
        aspect: spec.aspect,
        minFt: spec.minFt ?? (/powder/i.test(spec.label) ? 3 : (MIN_WIDTH[spec.kind] ?? 0)),
      });
    }
  }
  const packAll = (width: number): Room[] => {
    const out: Room[] = [];
    levelSpecs.forEach((specs, level) => out.push(...packLevel(specs, level, width)));
    return out;
  };
  const cost = (packed: Room[]): number => {
    let total = 0;
    for (const room of packed) {
      const want = targets.get(room.label);
      if (!want) continue;
      const [, , w, d] = room.rect;
      const narrowest = Math.min(w, d);
      const penalty = narrowest >= want.minFt ? 1 : 10 * (want.minFt / Math.max(narrowest, 0.1));
      const off = distortion(w / d, want.aspect) * penalty;
      total += off * off;
    }
    return total;
  };
  // A storey narrower than its widest room cannot hold it, whatever that does
  // to the score. This is a bound rather than a cost because the search is a
  // sum: on a 50ft lot it bought slightly squarer bedrooms with a two-car
  // garage 17.9ft across, which is a garage you cannot park in.
  const floorWidth = Math.max(
    MIN_ROOM_FT * 2,
    ...levelSpecs.flatMap((specs) => specs.map((spec) => (targets.get(spec.label)?.minFt ?? 0) + WALL_FT)),
  );
  // Down to two thirds of the frontage. Below that the house stops being the
  // shape the lot wants and starts being a tower on a wide lot.
  let rooms = packAll(maxRowWidthFt);
  let best = cost(rooms);
  for (let step = 1; step <= 6; step++) {
    const width = maxRowWidthFt * (1 - step * 0.055);
    if (width < floorWidth) break;
    const candidate = packAll(width);
    const score = cost(candidate);
    if (score < best) {
      best = score;
      rooms = candidate;
    }
  }
  const model: ParametricModel = {
    schemaVersion: 1,
    levels: levelSpecs.length,
    rooms,
    openings: [],
  };
  addOpenings(model);
  return model;
}

export interface ConceptVariant {
  label: string;
  /** Massing archetype key — drives the style-flavored display name. */
  massing: MassingKey;
  /** Fraction of lot width the plan may use per row. */
  rowWidthFactor: number;
  twoStory: boolean;
  /** Depth-fit room proportions, tried in order; distinct per variant so
   * narrow-lot concepts stay visually different instead of converging. */
  deepenScales: number[];
}

export const VARIANTS: ConceptVariant[] = [
  { label: "The Courtyard", massing: "courtyard", rowWidthFactor: 0.8, twoStory: false, deepenScales: [0.82, 0.68, 0.6] },
  { label: "The Compact Two-Story", massing: "two_story", rowWidthFactor: 0.55, twoStory: true, deepenScales: [0.85, 0.72, 0.62] },
  { label: "The Wide Ranch", massing: "wide", rowWidthFactor: 0.95, twoStory: false, deepenScales: [0.92, 0.8, 0.7] },
];

/** Variant order led by the style's natural massing (roof.ts massingBias). */
function orderedVariants(style: HomeStyle): ConceptVariant[] {
  const bias = massingBias(style);
  if (bias === null) return VARIANTS;
  return [...VARIANTS].sort((a, b) => {
    const pref = (v: ConceptVariant) => (bias === "two" ? (v.twoStory ? 0 : 1) : v.twoStory ? 1 : 0);
    return pref(a) - pref(b);
  });
}

/**
 * The home's own square footage: everything but the garage and the outdoor
 * rooms. Hallways count — people walk through them, the floor is finished and
 * the heat reaches them, and a plan that excludes them understates the house.
 */
function livableSqft(model: ParametricModel): number {
  return model.rooms
    .filter((r) => r.kind !== "garage" && r.kind !== "outdoor")
    .reduce((sum, r) => sum + r.rect[2] * r.rect[3], 0);
}

/** Ground-floor depth of a model, in feet. */
function planDepthFt(model: ParametricModel): number {
  const ground = model.rooms.filter((r) => r.level === 0);
  if (ground.length === 0) return 0;
  return Math.max(...ground.map((r) => r.rect[1] + r.rect[3])) - Math.min(...ground.map((r) => r.rect[1]));
}

export function generateConcepts(
  brief: DesignBrief,
  lotWidthFt: number | null,
  depthBudgetFt?: number | null,
): DesignConcept[] {
  const lot = lotWidthFt && lotWidthFt > 24 ? lotWidthFt : 60;
  const depthBudget = depthBudgetFt && depthBudgetFt > 24 ? depthBudgetFt : null;
  return orderedVariants(brief.style).map((variant, vi) => {
    const buildFor = (targetSqft: number | undefined): ParametricModel => {
      const specs = programRooms({ ...brief.program, targetSqft }, brief.style);
      // A house is never narrower than thirty feet across, however narrow the
      // lot: a two-car garage is twenty-one of them, and the compact variant's
      // 55% of a 50ft frontage left a 27.5ft storey with a galley kitchen
      // 10ft x 20ft and a closet three feet across. Real narrow-lot plans use
      // the buildable width and go up, they do not get thinner.
      let maxRow = Math.max(Math.min(lot, 30), lot * variant.rowWidthFactor);

      let levelSpecs: RoomSpec[][];
      if (variant.twoStory) {
        const publicSpecs = specs.filter((s) => s.public || s.kind === "garage" || s.kind === "laundry");
        const privateSpecs = specs.filter((s) => !publicSpecs.includes(s));
        // Keep one bath downstairs for accessibility — but never the ensuite.
        // Taking the first bathroom it found took the primary bath, which left
        // the walk-in closet upstairs with only a bedroom to pair with and
        // turned it into a 24ft x 1.9ft strip. A suite is not a pool of
        // bathrooms to draw from.
        const downBathIdx = privateSpecs.findIndex((s) => s.kind === "bathroom" && !s.suite);
        if (downBathIdx >= 0) publicSpecs.push(...privateSpecs.splice(downBathIdx, 1));
        levelSpecs = [publicSpecs, privateSpecs];
      } else {
        levelSpecs = [specs];
      }

      // A narrow variant on a big program can pack deeper than the lot
      // allows; widen the rows (never past the buildable width) until the
      // plan fits the depth budget too. Deterministic: fixed growth, bounded.
      let built = assembleModel(levelSpecs.map((l) => [...l]), maxRow);
      if (depthBudget) {
        let guard = 0;
        while (guard++ < 8 && maxRow < lot && planDepthFt(built) > depthBudget) {
          maxRow = Math.min(lot, maxRow * 1.2);
          built = assembleModel(levelSpecs.map((l) => [...l]), maxRow);
        }
        // Width exhausted and still too deep: deepen the living rooms
        // (lower aspect → narrower rooms → fuller rows), the way narrow-lot
        // homes are actually proportioned. Garages and outdoor spaces keep
        // their natural shape — a square garage helps nobody.
        for (const scale of variant.deepenScales) {
          if (planDepthFt(built) <= depthBudget) break;
          const deepened = levelSpecs.map((l) =>
            l.map((spec) =>
              spec.kind === "garage" || spec.kind === "outdoor"
                ? { ...spec }
                : { ...spec, aspect: Math.max(0.6, spec.aspect * scale) },
            ),
          );
          built = assembleModel(deepened, maxRow);
        }
      }
      return built;
    };

    const target = brief.program.targetSqft;
    let model = buildFor(target);

    // A square-footage target is a promise about the HOME, and a home includes
    // its hallways. programRooms only scales rooms, so asking for 2,600 sqft
    // used to deliver 2,600 sqft of rooms standing in a 3,160 sqft house.
    // Solve for the room scale that lands the finished plan on the number the
    // customer actually asked for: measure, correct, rebuild. Bounded passes,
    // so it stays deterministic and cannot spin.
    if (target && target > 0) {
      let effective = target;
      for (let pass = 0; pass < 4; pass++) {
        const actual = livableSqft(model);
        if (actual <= 0 || Math.abs(actual - target) / target <= 0.02) break;
        effective = (effective * target) / actual;
        model = buildFor(effective);
      }
    }

    return {
      id: `concept-${vi}`,
      briefId: brief.id,
      label: conceptName(styleInfo(brief.style)?.category, variant.massing) ?? variant.label,
      style: brief.style,
      sqft: Math.round(livableSqft(model)),
      beds: brief.program.bedrooms,
      baths: brief.program.bathrooms,
      model,
    };
  });
}
