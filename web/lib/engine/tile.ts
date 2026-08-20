/**
 * Squarified treemap with per-item target proportions.
 *
 * The band packer this replaces followed one path and took whatever fell out:
 * every fix for one pathology produced another, because nothing in it ever
 * compared two arrangements. This does. It fills a rectangle exactly — the
 * footprint is an INPUT, so a plan cannot overrun its lot through packing
 * waste — and at each step it takes the row that leaves rooms closest to the
 * shape they asked for.
 *
 * Groups tile their own cell, which is how a primary suite stays a suite: the
 * bedroom, the ensuite and the walk-in are one item to the level above, so
 * nothing can be placed between them.
 */

export type Rect = [number, number, number, number];

/**
 * Below this a cell stops being a room.
 *
 * A treemap's weakness is its last row: take a little too much into the rows
 * before it and whatever is left gets a strip three feet deep to live in. An
 * office came out 33ft x 3.6ft that way. When the leftover would be that thin,
 * the row takes everything instead and there is no leftover.
 */
export const MIN_CELL_FT = 6;

export interface TileItem {
  key: string;
  areaSqft: number;
  /** Preferred width:depth. */
  aspect: number;
  /**
   * Narrowest this room can usefully be, from what has to fit in it. A
   * bedroom needs a bed and a way round it; a closet needs neither. Without
   * this the tiler happily returned 8ft bedrooms — legal, and a queen bed
   * does not fit beside them.
   */
  minFt?: number;
  /**
   * This room has to reach an outside wall. A bedroom without one has no
   * window and no way out of a fire; two plans in five came back with one,
   * because nothing in the tiling cared where a cell landed as long as it was
   * the right shape.
   */
  needsLight?: boolean;
  /** Placed inside this item's own cell, so they always end up together. */
  children?: TileItem[];
}

export interface Tile {
  key: string;
  rect: Rect;
}

/**
 * Which sides of a rectangle are the outside of the building.
 *
 * A zone's flanks are always outside walls; its front and back may be, or may
 * face the corridor. Without being told, the tiler counted a cell against the
 * corridor as daylit and went on landlocking bedrooms.
 */
export interface Edges {
  n: boolean;
  s: boolean;
  e: boolean;
  w: boolean;
}

const ALL_OPEN: Edges = { n: true, s: true, e: true, w: true };

/** The sides of `cell` that are on the outside, given its parent's. */
function edgesOf(cell: Rect, rect: Rect, edges: Edges): Edges {
  const [cx, cz, cw, cd] = cell;
  const [rx, rz, rw, rd] = rect;
  return {
    n: edges.n && cz <= rz + 0.01,
    s: edges.s && cz + cd >= rz + rd - 0.01,
    w: edges.w && cx <= rx + 0.01,
    e: edges.e && cx + cw >= rx + rw - 0.01,
  };
}

export function itemArea(item: TileItem): number {
  return item.children && item.children.length > 0
    ? item.children.reduce((sum, child) => sum + itemArea(child), 0)
    : item.areaSqft;
}

/**
 * How far from its target a proportion is, as a factor of 1 or more.
 *
 * Orientation-free: a room asking for 1.4:1 is equally well served by a cell
 * 1.4 times as wide as it is deep or 1.4 times as deep as it is wide. Judging
 * the two differently scored a perfectly ordinary galley kitchen — 9ft x 21ft,
 * running front to back beside the living room — at 3.3 times off, and the
 * layout search kept trading good plans away to avoid it. Where orientation
 * really does matter it is imposed directly: a porch is laid across the front
 * and a garage carries a minimum width, neither of them by aspect.
 */
export function distortion(aspect: number, target: number): number {
  if (!(aspect > 0) || !(target > 0)) return Infinity;
  const upright = Math.max(aspect / target, target / aspect);
  const turned = Math.max(aspect * target, 1 / (aspect * target));
  return Math.min(upright, turned);
}

/** The worst-proportioned room in a row laid `side` long at this thickness. */
function rowWorst(row: TileItem[], side: number, along: "x" | "z"): number {
  const total = row.reduce((sum, item) => sum + itemArea(item), 0);
  if (total <= 0 || side <= 0) return Infinity;
  const thickness = total / side;
  let worst = 1;
  for (const item of row) {
    const run = itemArea(item) / thickness;
    const aspect = along === "x" ? run / thickness : thickness / run;
    // A cell under the minimum is not merely badly proportioned, it is not a
    // room, so it is scored far worse than any proportion could be. Without
    // this the tiler would happily trade a 24ft x 1.9ft closet for slightly
    // better aspect ratios elsewhere in the row.
    const narrowest = Math.min(run, thickness);
    const floor = item.minFt ?? MIN_CELL_FT;
    const penalty = narrowest >= floor ? 1 : 10 * (floor / Math.max(narrowest, 0.1));
    worst = Math.max(worst, distortion(aspect, item.aspect) * penalty);
  }
  return worst;
}

/**
 * Tile `rect` with `items`, exactly and without gaps.
 *
 * Rows run along the shorter side, which is what stops cells coming out as
 * slivers, and a row stops growing at the point where taking one more room
 * would make the worst room in it worse.
 */
function squarify(items: TileItem[], rect: Rect, edges: Edges, flip = false, forceFirst = 0): Tile[] {
  const out: Tile[] = [];
  // Squarify depends on its input being sorted largest first: fed in
  // programme order it makes good cells for the first rooms and slivers for
  // whatever is left. Ties break on the key so the result stays deterministic.
  const remainingAll = items
    .filter((item) => itemArea(item) > 0)
    .sort((a, b) => itemArea(b) - itemArea(a) || a.key.localeCompare(b.key));
  let remaining = remainingAll;
  let [x, z, w, d] = rect;
  let first = true;

  while (remaining.length > 0 && w > 0 && d > 0) {
    if (remaining.length === 1) {
      out.push(...emit(remaining[0], [x, z, w, d], rect, edges));
      break;
    }
    // Rows normally run along the shorter side, which is what keeps cells
    // from coming out as slivers. Running them the other way is sometimes
    // better for a small group whose rooms want a particular orientation —
    // a primary suite came out with the bedroom 12ft x 19ft the other way —
    // so both are tried and scored.
    const shortFirst = w <= d;
    const along: "x" | "z" = (flip ? !shortFirst : shortFirst) ? "x" : "z";
    const side = along === "x" ? w : d;

    let cut = 1;
    let best = rowWorst(remaining.slice(0, 1), side, along);
    for (let n = 2; n <= remaining.length; n++) {
      const candidate = rowWorst(remaining.slice(0, n), side, along);
      if (candidate > best) break;
      best = candidate;
      cut = n;
    }

    // Two repairs, because a treemap's failures are always at the edges.
    // A row thinner than a room needs more in it, not less.
    const spanOf = (n: number) => remaining.slice(0, n).reduce((sum, item) => sum + itemArea(item), 0);
    while (cut < remaining.length && spanOf(cut) / side < MIN_CELL_FT) cut += 1;
    // A strip left behind that is too thin to hold a room is a fault — but so
    // is a row of slivers, and absorbing the rest to avoid the first used to
    // cause the second: a 4.4ft-deep powder room became a 2.8ft-wide one.
    //
    // The comparison that decides between them has to count both faults. The
    // first version of this weighed the row on its own against the merged row
    // and never scored the sliver it was about to leave, so it always chose to
    // leave one: a 60sqft hall bath came out 3.6ft x 16.3ft against a sleeping
    // zone, because the row before it looked fine in isolation. Costing the
    // leftover — and trying shorter rows, which leave a fatter strip — puts the
    // bath at 7.4ft.
    const across = along === "x" ? d : w;
    const stripCost = (n: number) => {
      const rest = remaining.slice(n);
      if (rest.length === 0) return 1;
      const leftover = across - spanOf(n) / side;
      const floor = Math.min(...rest.map((item) => item.minFt ?? MIN_CELL_FT));
      return leftover >= floor ? 1 : 10 * (floor / Math.max(leftover, 0.1));
    };
    if (stripCost(cut) > 1) {
      let bestCut = cut;
      let bestCost = Math.max(rowWorst(remaining.slice(0, cut), side, along), stripCost(cut));
      for (let n = 1; n <= remaining.length; n++) {
        if (n === cut) continue;
        const cost = Math.max(rowWorst(remaining.slice(0, n), side, along), stripCost(n));
        if (cost < bestCost) {
          bestCost = cost;
          bestCut = n;
        }
      }
      cut = bestCut;
    }

    // The greedy row stop is one guess at where the first row ends, and it is
    // the guess the whole tiling hangs from: a kitchen came out 22ft x 9ft
    // because the row above it took one room too many. Forcing the first row
    // to each size in turn and scoring the finished tilings is what finds the
    // arrangement the greedy rule cannot reach.
    if (first && forceFirst > 0) cut = Math.min(forceFirst, remaining.length);
    first = false;

    const row = remaining.slice(0, cut);
    remaining = remaining.slice(cut);
    const total = row.reduce((sum, item) => sum + itemArea(item), 0);
    const thickness = total / side;

    let cursor = along === "x" ? x : z;
    for (const item of row) {
      const run = itemArea(item) / thickness;
      const cell: Rect = along === "x" ? [cursor, z, run, thickness] : [x, cursor, thickness, run];
      out.push(...emit(item, cell, rect, edges));
      cursor += run;
    }
    if (along === "x") {
      z += thickness;
      d -= thickness;
    } else {
      x += thickness;
      w -= thickness;
    }
  }
  return out;
}

function emit(item: TileItem, cell: Rect, rect: Rect, edges: Edges): Tile[] {
  if (item.children && item.children.length > 0) return tile(item.children, cell, edgesOf(cell, rect, edges));
  return [{ key: item.key, rect: cell }];
}

/** Every leaf's target proportion, by key. */
function targetsOf(
  items: TileItem[],
  into = new Map<string, { aspect: number; minFt: number; needsLight: boolean }>(),
): Map<string, { aspect: number; minFt: number; needsLight: boolean }> {
  for (const item of items) {
    if (item.children && item.children.length > 0) targetsOf(item.children, into);
    else
      into.set(item.key, {
        aspect: item.aspect,
        minFt: item.minFt ?? MIN_CELL_FT,
        needsLight: item.needsLight === true,
      });
  }
  return into;
}

/**
 * Score a finished tiling by its worst cell.
 *
 * Scoring the RESULT rather than each row as it is chosen is the point: a row
 * heuristic cannot see the sliver it leaves for the last room three levels of
 * recursion later, which is why every fix for one sliver produced another
 * somewhere else.
 */
function scoreTiles(
  tiles: Tile[],
  targets: Map<string, { aspect: number; minFt: number; needsLight: boolean }>,
  rect: Rect,
  edges: Edges,
): number {
  // Summed, not maxed. Scoring on the worst cell alone made the comparison
  // blind: if every candidate had the same worst room — a powder room, say —
  // they all scored identically and nothing else in the plan could break the
  // tie, so three bedrooms staying nine feet wide cost a candidate nothing.
  let total = 0;
  for (const placed of tiles) {
    const [, , w, d] = placed.rect;
    const want = targets.get(placed.key);
    const narrowest = Math.min(w, d);
    const floor = want?.minFt ?? MIN_CELL_FT;
    const penalty = narrowest >= floor ? 1 : 10 * (floor / Math.max(narrowest, 0.1));
    // A room that needs an outside wall and does not reach one is not merely
    // badly proportioned. Landlocking it is a fault of a different kind, so
    // it is scored like one.
    const [rx, rz, rw, rd] = rect;
    const [px, pz] = placed.rect;
    const outside =
      (edges.w && px <= rx + 0.01) ||
      (edges.n && pz <= rz + 0.01) ||
      (edges.e && px + w >= rx + rw - 0.01) ||
      (edges.s && pz + d >= rz + rd - 0.01);
    const dark = want?.needsLight && !outside ? 5 : 1;
    const off = distortion(w / d, want?.aspect ?? 1) * penalty * dark;
    total += off * off;
  }
  return total;
}

/**
 * Recursive bisection: halve the items by area, halve the rectangle to match,
 * recurse. It has no last row, so it cannot leave a strip too thin to live in
 * — the failure squarify keeps making — though it is worse at hitting target
 * proportions when the areas are lopsided. Neither wins everywhere, so both
 * are tried.
 */
function bisect(items: TileItem[], rect: Rect, edges: Edges, flip = false): Tile[] {
  const live = items.filter((item) => itemArea(item) > 0);
  if (live.length === 0) return [];
  if (live.length === 1) return emit(live[0], rect, rect, edges);

  const sorted = [...live].sort((a, b) => itemArea(b) - itemArea(a) || a.key.localeCompare(b.key));
  const total = sorted.reduce((sum, item) => sum + itemArea(item), 0);
  let running = 0;
  let cut = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    running += itemArea(sorted[i]);
    cut = i + 1;
    if (running >= total / 2) break;
  }
  const head = sorted.slice(0, cut);
  const tail = sorted.slice(cut);
  const headArea = head.reduce((sum, item) => sum + itemArea(item), 0);
  const [x, z, w, d] = rect;
  if (flip ? w < d : w >= d) {
    const wa = (w * headArea) / total;
    return [
      ...bisect(head, [x, z, wa, d], edgesOf([x, z, wa, d], rect, edges), flip),
      ...bisect(tail, [x + wa, z, w - wa, d], edgesOf([x + wa, z, w - wa, d], rect, edges), flip),
    ];
  }
  const da = (d * headArea) / total;
  return [
    ...bisect(head, [x, z, w, da], edgesOf([x, z, w, da], rect, edges), flip),
    ...bisect(tail, [x, z + da, w, d - da], edgesOf([x, z + da, w, d - da], rect, edges), flip),
  ];
}

/**
 * Tile `rect` with `items`, taking whichever strategy leaves the worst room
 * least badly off.
 */
export function tile(items: TileItem[], rect: Rect, edges: Edges = ALL_OPEN): Tile[] {
  const targets = targetsOf(items);
  let best: Tile[] | null = null;
  let bestScore = Infinity;
  // Eight arrangements, not one. Every hand-tuned heuristic in this file's
  // history fixed the case in front of it and broke another somewhere else;
  // searching a handful of genuinely different arrangements and keeping the
  // one that scores best is what stops that, and it costs microseconds.
  const base = [
    squarify(items, rect, edges),
    squarify(items, rect, edges, true),
    bisect(items, rect, edges),
    bisect(items, rect, edges, true),
  ];
  for (let k = 1; k <= Math.min(4, items.length); k++) {
    base.push(squarify(items, rect, edges, false, k), squarify(items, rect, edges, true, k));
  }
  // Every arrangement, and its reflections.
  //
  // Feeding the items in reversed order used to be four of these candidates,
  // and it did nothing at all: squarify sorts largest-first on the way in, so
  // reversing the list produced the identical tiling. That left the largest
  // room always at the near corner and no way to put it at the far one —
  // which is why a bedroom could not be moved out to the wall it needed.
  // Mirroring a finished tiling is free and actually reaches those layouts.
  const [rx, rz, rw, rd] = rect;
  const mirror = (tiles: Tile[], x: boolean, z: boolean): Tile[] =>
    tiles.map((t) => ({
      key: t.key,
      rect: [
        x ? rx + rw - (t.rect[0] - rx) - t.rect[2] : t.rect[0],
        z ? rz + rd - (t.rect[1] - rz) - t.rect[3] : t.rect[1],
        t.rect[2],
        t.rect[3],
      ] as Rect,
    }));
  const strategies = base.flatMap((tiles) => [
    tiles,
    mirror(tiles, true, false),
    mirror(tiles, false, true),
    mirror(tiles, true, true),
  ]);
  for (const candidate of strategies) {
    const score = scoreTiles(candidate, targets, rect, edges);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best ?? [];
}
