/**
 * Procedural material textures for the 3D viewer — generated on a canvas
 * at runtime, so the app ships zero texture assets and every material in
 * the catalog still renders with believable surface detail. Deterministic:
 * same inputs, same pixels.
 */

import * as THREE from "three";

import type { ExteriorPalette } from "@/lib/render/palette";

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return [c, c.getContext("2d")!];
}

/**
 * Vary a colour the way a real surface varies: mostly in brightness.
 *
 * Moving each channel independently is what turned a charcoal roof into
 * purple-and-green confetti — at ±34 per channel a dark base has nowhere to
 * go but sideways in hue, and the roof read as a mosaic rather than shingles.
 * A shingle differs from its neighbour in how much light it takes, with only
 * a little drift in colour, so the swing is shared across the channels and
 * only a fraction of it is per-channel.
 */
function jitter(hex: string, amount: number, r: () => number): string {
  const n = parseInt(hex.slice(1), 16);
  const common = (r() - 0.5) * amount;
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v + common + (r() - 0.5) * amount * 0.18)));
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Anisotropic filtering budget. Ground and roof planes are seen at grazing
 * angles, where isotropic mipmapping smears them into mush — the single
 * cheapest realism win available. The viewer raises this to the GPU maximum
 * before building any texture; 4 is the floor for anything that asks early.
 */
let maxAnisotropy = 4;

export function setMaxAnisotropy(n: number): void {
  maxAnisotropy = Math.max(4, Math.floor(n));
}

function finish(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/** Bump/roughness data is linear — never sRGB-encode it. */
function finishLinear(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/** One texture tile covers this many feet — repeats are set per mesh. */
export const TILE_FT = 8;

/** Height relief for clapboard laps — each course steps out over the last. */
export function clapboardBump(): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const lapH = 256 / 12;
  for (let row = 0; row < 12; row++) {
    const y = row * lapH;
    const grad = g.createLinearGradient(0, y, 0, y + lapH);
    grad.addColorStop(0, "#b0b0b0");
    grad.addColorStop(0.82, "#d8d8d8");
    grad.addColorStop(1, "#2a2a2a");
    g.fillStyle = grad;
    g.fillRect(0, y, 256, lapH);
  }
  return finishLinear(c);
}

/** Height relief for shingle courses. */
export function shingleBump(): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const r = mulberry32(19);
  const rowH = 256 / 8;
  g.fillStyle = "#bdbdbd";
  g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    const y = row * rowH;
    const offset = row % 2 === 0 ? 0 : 24;
    for (let x = -48; x < 256; x += 48) {
      const tone = Math.round(150 + r() * 60);
      g.fillStyle = `rgb(${tone},${tone},${tone})`;
      g.fillRect(x + offset, y, 46, rowH - 3);
    }
    g.fillStyle = "#1c1c1c";
    g.fillRect(0, y + rowH - 3, 256, 3);
  }
  return finishLinear(c);
}

/** Interior wall paint: fine, almost-invisible tooth — not siding. */
export function plasterTexture(base: string): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const r = mulberry32(37);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = jitter(base, 10, r);
    g.fillRect(r() * 256, r() * 256, 1, 1);
  }
  return finish(c);
}

/** Hardwood planks: staggered lengths, tone variation, grain streaks. */
export function woodFloorTexture(base: string): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const r = mulberry32(41);
  const plankH = 256 / 16; // ~6" planks over the 8ft tile
  for (let row = 0; row < 16; row++) {
    const y = row * plankH;
    let x = -Math.floor(r() * 96);
    while (x < 256) {
      const len = 72 + Math.floor(r() * 84);
      const tone = jitter(base, 34, r);
      g.fillStyle = tone;
      g.fillRect(x, y, len - 1, plankH - 1);
      // grain
      g.fillStyle = "rgba(0,0,0,0.10)";
      for (let i = 0; i < 3; i++) {
        g.fillRect(x + 4 + r() * (len - 12), y + 2 + r() * (plankH - 4), 10 + r() * 26, 1);
      }
      x += len;
    }
    g.fillStyle = "rgba(0,0,0,0.28)";
    g.fillRect(0, y + plankH - 1, 256, 1);
  }
  return finish(c);
}

/** Ceramic tile floor: 2ft grid, grout, slight tile-to-tile variation. */
export function tileFloorTexture(base: string): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const r = mulberry32(43);
  g.fillStyle = "#c9c4ba"; // grout
  g.fillRect(0, 0, 256, 256);
  const t = 256 / 4;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      g.fillStyle = jitter(base, 14, r);
      g.fillRect(col * t + 2, row * t + 2, t - 4, t - 4);
    }
  }
  return finish(c);
}

export function brickTexture(base: string): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const r = mulberry32(7);
  const courseH = 256 / 12; // ~8" courses over 8ft
  g.fillStyle = "#cfc8bc"; // mortar
  g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 12; row++) {
    const y = row * courseH;
    const offset = row % 2 === 0 ? 0 : 32;
    for (let x = -32; x < 256; x += 64) {
      g.fillStyle = jitter(base, 46, r);
      g.fillRect(x + offset + 2, y + 2, 60, courseH - 4);
    }
  }
  return finish(c);
}

export function clapboardTexture(base: string): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const r = mulberry32(11);
  const lapH = 256 / 12; // ~8" laps
  for (let row = 0; row < 12; row++) {
    const y = row * lapH;
    const grad = g.createLinearGradient(0, y, 0, y + lapH);
    const tone = jitter(base, 18, r);
    grad.addColorStop(0, tone);
    grad.addColorStop(0.85, tone);
    grad.addColorStop(1, "rgba(0,0,0,0.35)");
    g.fillStyle = grad;
    g.fillRect(0, y, 256, lapH);
  }
  return finish(c);
}

export function stuccoTexture(base: string): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const r = mulberry32(13);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = jitter(base, 26, r);
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  return finish(c);
}

export function shingleTexture(base: string): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const r = mulberry32(17);
  const rowH = 256 / 8; // ~1ft courses
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    const y = row * rowH;
    const offset = row % 2 === 0 ? 0 : 24;
    for (let x = -48; x < 256; x += 48) {
      g.fillStyle = jitter(base, 34, r);
      g.fillRect(x + offset, y, 46, rowH - 2);
    }
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, y + rowH - 2, 256, 2);
  }
  return finish(c);
}

export function standingSeamTexture(base: string): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    const grad = g.createLinearGradient(x, 0, x + 32, 0);
    grad.addColorStop(0, "rgba(255,255,255,0.16)");
    grad.addColorStop(0.12, "rgba(0,0,0,0.18)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x, 0, 32, 256);
  }
  return finish(c);
}

export function tileRoofTexture(base: string): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const r = mulberry32(23);
  const rowH = 256 / 8;
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    const y = row * rowH;
    for (let x = 0; x < 256; x += 32) {
      g.fillStyle = jitter(base, 30, r);
      g.beginPath();
      g.arc(x + 16, y + rowH, 16, Math.PI, 2 * Math.PI);
      g.fill();
    }
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fillRect(0, y + rowH - 2, 256, 2);
  }
  return finish(c);
}

export function grassTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const r = mulberry32(29);
  g.fillStyle = "#7d9e5c";
  g.fillRect(0, 0, 256, 256);
  // Broad soft patches first — lawns are mottled long before they are blades.
  for (let i = 0; i < 34; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const rad = 22 + r() * 52;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    const dark = r() > 0.5;
    grad.addColorStop(0, dark ? "rgba(58,82,40,0.16)" : "rgba(168,196,120,0.14)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = jitter("#7d9e5c", 46, r);
    g.fillRect(r() * 256, r() * 256, 1 + (i % 2), 2 + (i % 3));
  }
  return finish(c);
}

export function concreteTexture(base: string): THREE.CanvasTexture {
  const [c, g] = canvas(256);
  const r = mulberry32(31);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = jitter(base, 18, r);
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  g.strokeStyle = "rgba(0,0,0,0.22)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(128, 0);
  g.lineTo(128, 256);
  g.stroke();
  return finish(c);
}

export function wallTextureFor(palette: ExteriorPalette): THREE.CanvasTexture {
  if (palette.wallTexture === "brick") return brickTexture(palette.wall);
  if (palette.wallTexture === "smooth") return stuccoTexture(palette.wall);
  return clapboardTexture(palette.wall);
}

export function roofTextureFor(palette: ExteriorPalette): THREE.CanvasTexture {
  switch (palette.roofTexture) {
    case "standing_seam":
      return standingSeamTexture(palette.roof);
    case "tile":
      return tileRoofTexture(palette.roof);
    default:
      return shingleTexture(palette.roof);
  }
}

/**
 * What a window looks like in an architectural photograph.
 *
 * A pane is mostly reflection, and the thing it reflects is the sky: bright
 * and cool at the head, dropping through a horizon line into the darker
 * ground and the room behind. The obvious way to get that is an environment
 * map, but every envMap on a PBR material is PMREM-filtered internally by
 * three, and that is the exact path this viewer had to abandon — it renders
 * black on SwiftShader, llvmpipe, and iOS Safari. So the reflection is
 * painted instead: no render targets, no float textures, works everywhere.
 *
 * Box UVs run 0..1 per face and textures are flipped, so canvas top is world
 * top — the sky lands at the head of the pane without any per-mesh setup.
 */
export function glassTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128);
  // Sky above the horizon, ground and room below it.
  const HORIZON = 0.62;
  const sky = g.createLinearGradient(0, 0, 0, 128 * HORIZON);
  sky.addColorStop(0, "#b8d6ee");
  sky.addColorStop(0.55, "#dbeaf6");
  sky.addColorStop(1, "#eef4f7");
  g.fillStyle = sky;
  g.fillRect(0, 0, 128, 128 * HORIZON);
  const room = g.createLinearGradient(0, 128 * HORIZON, 0, 128);
  room.addColorStop(0, "#7d8f97");
  room.addColorStop(0.35, "#4c565c");
  room.addColorStop(1, "#39424a");
  g.fillStyle = room;
  g.fillRect(0, 128 * HORIZON, 128, 128 * (1 - HORIZON));
  // A soft tree-line sitting on the horizon, the way glass picks up whatever
  // is across the street. Deterministic, so panes never shimmer.
  const r = mulberry32(71);
  g.fillStyle = "rgba(58,74,52,0.5)";
  for (let x = 0; x < 128; x += 4) {
    const h = 5 + r() * 9;
    g.fillRect(x, 128 * HORIZON - h, 5, h);
  }
  // The diagonal sheen that says "flat glass" more than anything else does.
  g.save();
  g.globalCompositeOperation = "lighter";
  const sheen = g.createLinearGradient(0, 128, 128, 0);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.46, "rgba(255,255,255,0)");
  sheen.addColorStop(0.54, "rgba(255,255,255,0.30)");
  sheen.addColorStop(0.62, "rgba(255,255,255,0)");
  g.fillStyle = sheen;
  g.fillRect(0, 0, 128, 128);
  g.restore();
  return finish(c);
}
