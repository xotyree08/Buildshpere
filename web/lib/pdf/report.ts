/**
 * True-vector PDF export of the Design Report. No screenshots, no print
 * CSS: floor plans, the site plan, and estimate tables are drawn straight
 * from the parametric model with jsPDF, so lines stay crisp at any zoom
 * and the file is small enough to email to a builder.
 */

import { jsPDF } from "jspdf";

import {
  DEFAULT_FINISHES,
  EXTERIOR_CATEGORIES,
  FINISH_CATEGORIES,
  type FinishSelections,
} from "../catalog/materials";
import { styleInfo } from "../catalog/styles";
import { CONCEPT_DISCLAIMER, ESTIMATE_RANGE_CLAIM } from "../claims";
import type { ConceptPackage } from "../engine/loop";
import { sanitizeSetbacks, type SetbackRules } from "../engine/site";
import type { Estimate, ParametricModel, Project } from "../types";

const PAGE_W = 210; // A4 portrait, mm
const PAGE_H = 297;
const MARGIN = 18;
const INK = "#171512";
const MUTED = "#6d675e";
const BRASS = "#9a7b3f";
const LINE = "#c9c3b8";

export interface ReportPdfInput {
  project: Project;
  packages: ConceptPackage[];
  finishes?: FinishSelections;
  setbacks?: SetbackRules;
}

function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

interface Cursor {
  y: number;
}

function ensureRoom(doc: jsPDF, cursor: Cursor, needed: number): void {
  if (cursor.y + needed > PAGE_H - MARGIN) {
    doc.addPage();
    cursor.y = MARGIN;
  }
}

function heading(doc: jsPDF, cursor: Cursor, text: string): void {
  ensureRoom(doc, cursor, 14);
  doc.setFont("times", "normal");
  doc.setFontSize(14);
  doc.setTextColor(INK);
  doc.text(text, MARGIN, cursor.y);
  doc.setDrawColor(BRASS);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, cursor.y + 1.6, MARGIN + 24, cursor.y + 1.6);
  cursor.y += 8;
}

/** Fit plan feet into a box in mm, preserving aspect; returns transform. */
function fitter(model: ParametricModel, x: number, y: number, w: number, h: number, level?: number) {
  const rooms = model.rooms.filter((r) => level === undefined || r.level === level);
  const minX = Math.min(...rooms.map((r) => r.rect[0]));
  const maxX = Math.max(...rooms.map((r) => r.rect[0] + r.rect[2]));
  const minZ = Math.min(...rooms.map((r) => r.rect[1]));
  const maxZ = Math.max(...rooms.map((r) => r.rect[1] + r.rect[3]));
  const scale = Math.min(w / (maxX - minX), h / (maxZ - minZ));
  const ox = x + (w - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = y + (h - (maxZ - minZ) * scale) / 2 - minZ * scale;
  return {
    scale,
    px: (ft: number) => ox + ft * scale,
    py: (ft: number) => oy + ft * scale,
    heightMm: (maxZ - minZ) * scale,
  };
}

const ROOM_FILL: Record<string, [number, number, number]> = {
  garage: [225, 225, 222],
  outdoor: [235, 226, 210],
  hallway: [244, 241, 234],
};

export function drawFloorPlan(
  doc: jsPDF,
  model: ParametricModel,
  level: number,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const t = fitter(model, x, y, w, h, level);
  const rooms = model.rooms.filter((r) => r.level === level);
  doc.setLineWidth(0.35);
  for (const room of rooms) {
    const [rx, rz, rw, rd] = room.rect;
    const fill = ROOM_FILL[room.kind] ?? [250, 248, 243];
    doc.setFillColor(...fill);
    doc.setDrawColor(INK);
    doc.rect(t.px(rx), t.py(rz), rw * t.scale, rd * t.scale, "FD");
  }
  // Openings: windows as brass ticks, doors as gaps marked in muted ink.
  doc.setLineWidth(0.7);
  for (const o of model.openings) {
    const room = rooms.find((r) => r.key === o.roomKey);
    if (!room) continue;
    const [rx, rz, rw, rd] = room.rect;
    doc.setDrawColor(o.kind === "window" ? BRASS : MUTED);
    if (o.wall === "n") doc.line(t.px(rx + o.offsetFt), t.py(rz), t.px(rx + o.offsetFt + o.widthFt), t.py(rz));
    else if (o.wall === "s") doc.line(t.px(rx + o.offsetFt), t.py(rz + rd), t.px(rx + o.offsetFt + o.widthFt), t.py(rz + rd));
    else if (o.wall === "w") doc.line(t.px(rx), t.py(rz + o.offsetFt), t.px(rx), t.py(rz + o.offsetFt + o.widthFt));
    else doc.line(t.px(rx + rw), t.py(rz + o.offsetFt), t.px(rx + rw), t.py(rz + o.offsetFt + o.widthFt));
  }
  // Labels.
  doc.setFont("helvetica", "normal");
  doc.setTextColor(INK);
  for (const room of rooms) {
    const [rx, rz, rw, rd] = room.rect;
    if (rw * t.scale < 12 || rd * t.scale < 7) continue;
    doc.setFontSize(6.5);
    doc.text(room.label, t.px(rx + rw / 2), t.py(rz + rd / 2) - 0.5, { align: "center" });
    doc.setFontSize(5.2);
    doc.setTextColor(MUTED);
    doc.text(`${Math.round(rw)}×${Math.round(rd)} ft`, t.px(rx + rw / 2), t.py(rz + rd / 2) + 2.2, { align: "center" });
    doc.setTextColor(INK);
  }
  return t.heightMm;
}

export function drawSitePlan(
  doc: jsPDF,
  model: ParametricModel,
  lotWidthFt: number,
  lotDepthFt: number,
  rules: SetbackRules,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  const scale = Math.min(w / lotWidthFt, h / lotDepthFt);
  const ox = x + (w - lotWidthFt * scale) / 2;
  const oy = y;
  // Lot.
  doc.setDrawColor(INK);
  doc.setLineWidth(0.4);
  doc.setFillColor(240, 243, 235);
  doc.rect(ox, oy, lotWidthFt * scale, lotDepthFt * scale, "FD");
  // Setback envelope, dashed brass.
  doc.setDrawColor(BRASS);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([1.4, 1.2], 0);
  doc.rect(
    ox + rules.sideFt * scale,
    oy + rules.frontFt * scale,
    (lotWidthFt - 2 * rules.sideFt) * scale,
    (lotDepthFt - rules.frontFt - rules.rearFt) * scale,
  );
  doc.setLineDashPattern([], 0);
  // Footprint, centered horizontally like the site engine places it.
  const ground = model.rooms.filter((r) => r.level === 0);
  const minX = Math.min(...ground.map((r) => r.rect[0]));
  const maxX = Math.max(...ground.map((r) => r.rect[0] + r.rect[2]));
  const shift = (lotWidthFt - (maxX - minX)) / 2 - minX;
  doc.setFillColor(214, 205, 189);
  doc.setDrawColor(INK);
  doc.setLineWidth(0.35);
  for (const room of ground) {
    const [rx, rz, rw, rd] = room.rect;
    doc.rect(ox + (rx + shift) * scale, oy + (rz + rules.frontFt) * scale, rw * scale, rd * scale, "FD");
  }
  doc.setFontSize(5.5);
  doc.setTextColor(MUTED);
  doc.text(`${lotWidthFt}×${lotDepthFt} ft lot · setbacks ${rules.frontFt}/${rules.rearFt}/${rules.sideFt} ft (dashed)`, ox, oy + lotDepthFt * scale + 3.4);
  doc.setTextColor(INK);
  return lotDepthFt * scale + 5;
}

function estimateTable(doc: jsPDF, cursor: Cursor, estimate: Estimate): void {
  const cols = { item: MARGIN, qty: 118, unit: 132, cost: 168 };
  ensureRoom(doc, cursor, 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(MUTED);
  doc.text("ITEM", cols.item, cursor.y);
  doc.text("QTY", cols.qty, cursor.y, { align: "right" });
  doc.text("UNIT", cols.unit, cursor.y);
  doc.text("COST", cols.cost + 24, cursor.y, { align: "right" });
  cursor.y += 1.6;
  doc.setDrawColor(LINE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, cursor.y, PAGE_W - MARGIN, cursor.y);
  cursor.y += 3.6;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(INK);
  for (const li of estimate.lineItems) {
    ensureRoom(doc, cursor, 6);
    doc.setFontSize(7.4);
    doc.text(`${li.category} — ${li.description}`.slice(0, 68), cols.item, cursor.y);
    doc.text(li.qty.toLocaleString("en-US"), cols.qty, cursor.y, { align: "right" });
    doc.text(li.unit, cols.unit, cursor.y);
    doc.text(usd(li.qty * li.unitCostCents), cols.cost + 24, cursor.y, { align: "right" });
    cursor.y += 4.1;
  }
  doc.setDrawColor(LINE);
  doc.line(MARGIN, cursor.y - 2.2, PAGE_W - MARGIN, cursor.y - 2.2);
  ensureRoom(doc, cursor, 8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.4);
  doc.text(`Total (${estimate.regionCode.replace(/_/g, " ")})`, cols.item, cursor.y + 1);
  doc.text(usd(estimate.totalCents), cols.cost + 24, cursor.y + 1, { align: "right" });
  cursor.y += 5.4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.6);
  doc.setTextColor(MUTED);
  doc.text(
    `Range ${usd(estimate.lowCents)} – ${usd(estimate.highCents)} · ${estimate.priceBookVersion ?? ""} · priced ${
      estimate.pricedAt ? new Date(estimate.pricedAt).toLocaleDateString("en-US") : "—"
    }`,
    cols.item,
    cursor.y,
  );
  doc.setTextColor(INK);
  cursor.y += 6;
}

export function generateReportPdf(input: ReportPdfInput): jsPDF {
  const { project, packages } = input;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const cursor: Cursor = { y: 0 };
  const style = styleInfo(packages[0]?.concept.style);

  // ---- Cover header ----
  doc.setFont("times", "normal");
  doc.setFontSize(24);
  doc.setTextColor(INK);
  doc.text(project.name, MARGIN, 34);
  doc.setFontSize(11);
  doc.setTextColor(MUTED);
  doc.text("Design Report — BuildSphere", MARGIN, 42);
  doc.setDrawColor(BRASS);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, 47, PAGE_W - MARGIN, 47);
  doc.setFontSize(8.4);
  const meta = [
    `${style?.label ?? "—"} style`,
    project.budgetCents != null ? `budget ${usd(project.budgetCents)}` : null,
    `lot ${project.lotWidthFt}×${project.lotDepthFt} ft`,
    ESTIMATE_RANGE_CLAIM,
  ]
    .filter(Boolean)
    .join(" · ");
  doc.text(meta, MARGIN, 53);
  doc.setFontSize(7);
  doc.text(doc.splitTextToSize(CONCEPT_DISCLAIMER, PAGE_W - 2 * MARGIN), MARGIN, 58.5);
  cursor.y = 70;

  // ---- Materials ----
  heading(doc, cursor, "Materials & finishes");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  const selections = [...EXTERIOR_CATEGORIES, ...FINISH_CATEGORIES];
  const colW = (PAGE_W - 2 * MARGIN) / 3;
  selections.forEach(({ field, label, options }, i) => {
    const key = input.finishes?.[field] ?? DEFAULT_FINISHES[field];
    const option = options.find((o) => o.key === key);
    const cx = MARGIN + (i % 3) * colW;
    const cy = cursor.y + Math.floor(i / 3) * 4.6;
    doc.setTextColor(MUTED);
    doc.text(label, cx, cy);
    doc.setTextColor(INK);
    doc.text(`${option?.label ?? key}`, cx + 24, cy);
  });
  cursor.y += Math.ceil(selections.length / 3) * 4.6 + 6;

  // ---- Concepts ----
  const rules = sanitizeSetbacks(input.setbacks);
  for (const pkg of packages) {
    const history = pkg.revisions ?? [];
    const latest = history.length > 0 ? history[history.length - 1] : null;
    const model = latest ? latest.revision.model : pkg.concept.model;
    const estimate = latest ? latest.estimate : pkg.estimate;
    const healthScore = latest ? latest.healthScore : pkg.healthScore;
    const sqft = Math.round(
      model.rooms
        .filter((r) => r.kind !== "garage" && r.kind !== "outdoor")
        .reduce((a, r) => a + r.rect[2] * r.rect[3], 0),
    );

    doc.addPage();
    cursor.y = MARGIN + 4;
    heading(doc, cursor, `${pkg.concept.label} — Health ${healthScore} — ${usd(estimate.totalCents)}`);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(MUTED);
    doc.text(
      `${sqft.toLocaleString("en-US")} sqft · ${pkg.concept.beds} bed / ${pkg.concept.baths} bath · ${
        model.levels === 2 ? "two-story" : "single-story"
      }${latest ? ` · ${history.length} revision(s)` : ""}`,
      MARGIN,
      cursor.y,
    );
    doc.setTextColor(INK);
    cursor.y += 7;

    // Drawings row: floor plans per level + site plan.
    const slots = model.levels + 1;
    const gap = 6;
    const slotW = (PAGE_W - 2 * MARGIN - gap * (slots - 1)) / slots;
    const slotH = 72;
    let used = 0;
    for (let lvl = 0; lvl < model.levels; lvl++) {
      const sx = MARGIN + lvl * (slotW + gap);
      doc.setFontSize(6.4);
      doc.setTextColor(MUTED);
      doc.text(model.levels > 1 ? `Level ${lvl + 1}` : "Floor plan", sx, cursor.y);
      used = Math.max(used, drawFloorPlan(doc, model, lvl, sx, cursor.y + 2, slotW, slotH));
    }
    const siteX = MARGIN + model.levels * (slotW + gap);
    doc.setFontSize(6.4);
    doc.setTextColor(MUTED);
    doc.text("Site placement", siteX, cursor.y);
    used = Math.max(
      used,
      drawSitePlan(doc, model, project.lotWidthFt ?? 60, project.lotDepthFt ?? 120, rules, siteX, cursor.y + 2, slotW, slotH),
    );
    doc.setTextColor(INK);
    cursor.y += used + 10;

    // Health checks, compact.
    heading(doc, cursor, "Design health checks");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    const checkResults = latest ? latest.checkResults : pkg.checkResults;
    for (const r of checkResults) {
      ensureRoom(doc, cursor, 5);
      doc.setTextColor(r.status === "pass" ? "#2e6b3f" : r.status === "warn" ? "#8a6d1f" : "#a03123");
      doc.text(r.status.toUpperCase(), MARGIN, cursor.y);
      doc.setTextColor(INK);
      doc.text(doc.splitTextToSize(`${r.check.replace(/_/g, " ")} — ${r.detail}`, PAGE_W - 2 * MARGIN - 16)[0] ?? "", MARGIN + 14, cursor.y);
      cursor.y += 4.2;
    }
    cursor.y += 4;

    heading(doc, cursor, "Estimate");
    estimateTable(doc, cursor, estimate);
  }

  // ---- Footer on every page ----
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(MUTED);
    doc.text(`BUILDSPHERE — onbuildsphere.com · ${project.name} · page ${i} of ${pages}`, MARGIN, PAGE_H - 8);
  }
  return doc;
}
