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
export const MIN_CELL_FT = 5;

export interface TileItem {
  key: string;
  areaSqft: number;
  /** Preferred width:depth. */
  aspect: number;
  /** Placed inside this item's own cell, so they always end up together. */
  children?: TileItem[];
}

export interface Tile {
  key: string;
  rect: Rect;
}

export function itemArea(item: TileItem): number {
  return item.children && item.children.length > 0
    ? item.children.reduce((sum, child) => sum + itemArea(child), 0)
    : item.areaSqft;
}

/** How far from its target a proportion is, as a factor of 1 or more. */
export function distortion(aspect: number, target: number): number {
  if (!(aspect > 0) || !(target > 0)) return Infinity;
  return Math.max(aspect / target, target / aspect);
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
    const penalty = narrowest >= MIN_CELL_FT ? 1 : 10 * (MIN_CELL_FT / Math.max(narrowest, 0.1));
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
function squarify(items: TileItem[], rect: Rect): Tile[] {
  const out: Tile[] = [];
  // Squarify depends on its input being sorted largest first: fed in
  // programme order it makes good cells for the first rooms and slivers for
  // whatever is left. Ties break on the key so the result stays deterministic.
  const remainingAll = items
    .filter((item) => itemArea(item) > 0)
    .sort((a, b) => itemArea(b) - itemArea(a) || a.key.localeCompare(b.key));
  let remaining = remainingAll;
  let [x, z, w, d] = rect;

  while (remaining.length > 0 && w > 0 && d > 0) {
    if (remaining.length === 1) {
      out.push(...emit(remaining[0], [x, z, w, d]));
      break;
    }
    const along: "x" | "z" = w <= d ? "x" : "z";
    const side = Math.min(w, d);

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
    // Take the rest only when doing so is actually better.
    const across = along === "x" ? d : w;
    if (cut < remaining.length && across - spanOf(cut) / side < MIN_CELL_FT) {
      const asIs = rowWorst(remaining.slice(0, cut), side, along);
      const merged = rowWorst(remaining, side, along);
      if (merged < asIs) cut = remaining.length;
    }

    const row = remaining.slice(0, cut);
    remaining = remaining.slice(cut);
    const total = row.reduce((sum, item) => sum + itemArea(item), 0);
    const thickness = total / side;

    let cursor = along === "x" ? x : z;
    for (const item of row) {
      const run = itemArea(item) / thickness;
      const cell: Rect = along === "x" ? [cursor, z, run, thickness] : [x, cursor, thickness, run];
      out.push(...emit(item, cell));
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

function emit(item: TileItem, rect: Rect): Tile[] {
  if (item.children && item.children.length > 0) return tile(item.children, rect);
  return [{ key: item.key, rect }];
}

/** Every leaf's target proportion, by key. */
function targetsOf(items: TileItem[], into = new Map<string, number>()): Map<string, number> {
  for (const item of items) {
    if (item.children && item.children.length > 0) targetsOf(item.children, into);
    else into.set(item.key, item.aspect);
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
function scoreTiles(tiles: Tile[], targets: Map<string, number>): number {
  let worst = 1;
  for (const placed of tiles) {
    const [, , w, d] = placed.rect;
    const narrowest = Math.min(w, d);
    const penalty = narrowest >= MIN_CELL_FT ? 1 : 10 * (MIN_CELL_FT / Math.max(narrowest, 0.1));
    worst = Math.max(worst, distortion(w / d, targets.get(placed.key) ?? 1) * penalty);
  }
  return worst;
}

/**
 * Recursive bisection: halve the items by area, halve the rectangle to match,
 * recurse. It has no last row, so it cannot leave a strip too thin to live in
 * — the failure squarify keeps making — though it is worse at hitting target
 * proportions when the areas are lopsided. Neither wins everywhere, so both
 * are tried.
 */
function bisect(items: TileItem[], rect: Rect): Tile[] {
  const live = items.filter((item) => itemArea(item) > 0);
  if (live.length === 0) return [];
  if (live.length === 1) return emit(live[0], rect);

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
  if (w >= d) {
    const wa = (w * headArea) / total;
    return [...bisect(head, [x, z, wa, d]), ...bisect(tail, [x + wa, z, w - wa, d])];
  }
  const da = (d * headArea) / total;
  return [...bisect(head, [x, z, w, da]), ...bisect(tail, [x, z + da, w, d - da])];
}

/**
 * Tile `rect` with `items`, taking whichever strategy leaves the worst room
 * least badly off.
 */
export function tile(items: TileItem[], rect: Rect): Tile[] {
  const targets = targetsOf(items);
  let best: Tile[] | null = null;
  let bestScore = Infinity;
  for (const candidate of [squarify(items, rect), bisect(items, rect)]) {
    const score = scoreTiles(candidate, targets);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best ?? [];
}
