/**
 * How a room's name is drawn inside its rectangle, for every plan that draws
 * one.
 *
 * The editable plan learned to fit labels; the static plan — the one on the
 * project page, the landing folio and the PDF — never did, and kept a naive
 * `min(2.4, width/6)`. So "Living Room" and "Primary Bedroom" ran into each
 * other, "Outdoor Kitchen" escaped the drawing entirely, and a band of five
 * rooms went unlabelled because the width gate cut them before anything
 * tried to make the text smaller. Two components disagreeing about one
 * question, which is the same shape of bug as three engines each guessing at
 * a wall.
 */

/**
 * Rough width of a character as a fraction of the font size.
 *
 * Measured against the plan's own sans face rather than guessed: 0.55 is the
 * average of lowercase alone, and a label with capitals in it — every room
 * name has at least one — overran its box by a few percent. Erring wide costs
 * a point of type size; erring narrow puts text through a wall.
 */
const CHAR_WIDTH = 0.6;

/**
 * Largest readable size at which `label` still fits inside `widthFt`.
 *
 * `maxFt` is the ceiling. It defaults to the floor plans' 2.4ft, where the
 * room name is the drawing's main content. The coordination drawings pass
 * something smaller: on an electrical or plumbing plan the name is an
 * annotation competing with symbols, and letting it grow to title size made
 * "Living Room" shout over the very fixtures the sheet exists to locate.
 */
export function labelSize(label: string, widthFt: number, maxFt = 2.4): number {
  return Math.max(1.1, Math.min(maxFt, widthFt / 6, (widthFt * 0.92) / (label.length * CHAR_WIDTH)));
}

/** Whether the label fits at all — below 1.1ft of type it is not worth drawing. */
export function fitsLabel(label: string, widthFt: number, maxFt = 2.4): boolean {
  return label.length * CHAR_WIDTH * labelSize(label, widthFt, maxFt) <= widthFt;
}

/**
 * Whether a room is worth labelling. Depth alone gates it: the width question
 * is `fitsLabel`'s, and gating on width too dropped names from rooms that
 * would have carried them perfectly well at a smaller size.
 */
export function labelFits(label: string, widthFt: number, depthFt: number, maxFt = 2.4): boolean {
  return depthFt > 4 && fitsLabel(label, widthFt, maxFt);
}

/**
 * Type size for a room name on a coordination drawing, where the symbols are
 * the point and the name is a caption.
 */
export const ANNOTATION_FT = 1.3;
