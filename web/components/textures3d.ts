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

function jitter(hex: string, amount: number, r: () => number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + (r() - 0.5) * amount)));
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

function finish(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** One texture tile covers this many feet — repeats are set per mesh. */
export const TILE_FT = 8;

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
  for (let i = 0; i < 5200; i++) {
    g.fillStyle = jitter("#7d9e5c", 44, r);
    g.fillRect(r() * 256, r() * 256, 2, 3);
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
