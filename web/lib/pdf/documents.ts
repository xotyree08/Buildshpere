/**
 * Vector PDF composers for the working documents: the bid package (one
 * sheet per trade, price columns deliberately blank), the construction
 * schedule (gantt + draws), and the 30-year maintenance plan. Same
 * jsPDF discipline as the Design Report: true vectors, small files,
 * honest text.
 */

import { jsPDF } from "jspdf";

import type { BidPackageSet } from "../engine/bids";
import type { MaintenancePlan } from "../engine/maintenance";
import { COST_BAND_LABELS, maintenanceCalendar } from "../engine/maintenance";
import type { ConstructionSchedule } from "../engine/schedule";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const INK = "#171512";
const MUTED = "#6d675e";
const BRASS = "#9a7b3f";
const LINE = "#c9c3b8";

interface Cursor {
  y: number;
}

function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function ensure(doc: jsPDF, c: Cursor, needed: number): void {
  if (c.y + needed > PAGE_H - MARGIN) {
    doc.addPage();
    c.y = MARGIN;
  }
}

function title(doc: jsPDF, c: Cursor, main: string, sub: string): void {
  doc.setFont("times", "normal");
  doc.setFontSize(18);
  doc.setTextColor(INK);
  doc.text(main, MARGIN, c.y);
  c.y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(sub, MARGIN, c.y);
  doc.setDrawColor(BRASS);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, c.y + 2.5, PAGE_W - MARGIN, c.y + 2.5);
  c.y += 9;
}

function heading(doc: jsPDF, c: Cursor, text: string): void {
  ensure(doc, c, 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(INK);
  doc.text(text, MARGIN, c.y);
  c.y += 5;
}

function bullets(doc: jsPDF, c: Cursor, items: string[], size = 8): void {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  doc.setTextColor(INK);
  for (const item of items) {
    const lines = doc.splitTextToSize(item, PAGE_W - 2 * MARGIN - 5) as string[];
    ensure(doc, c, lines.length * 3.8 + 1.5);
    doc.text("•", MARGIN, c.y);
    doc.text(lines, MARGIN + 4, c.y);
    c.y += lines.length * 3.8 + 1.5;
  }
}

function footer(doc: jsPDF, projectName: string): void {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(MUTED);
    doc.text(`BUILDSPHERE — onbuildsphere.com · ${projectName} · page ${i} of ${pages}`, MARGIN, PAGE_H - 8);
  }
}

// ---------- Bid package ----------

export function generateBidPackagePdf(projectName: string, set: BidPackageSet): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const facts = `${set.facts.livableSqft.toLocaleString("en-US")} livable sqft · ${
    set.facts.levels === 2 ? "two-story" : "single-story"
  } · ${set.facts.baths} bath · ${set.facts.windows} windows — attach the Design Report drawings.`;

  set.trades.forEach((trade, ti) => {
    if (ti > 0) doc.addPage();
    const c: Cursor = { y: MARGIN + 6 };
    title(doc, c, trade.trade, `Invitation to bid — ${projectName} · ${facts}`);

    heading(doc, c, "Scope of work");
    bullets(doc, c, trade.scope);
    c.y += 2;

    heading(doc, c, "Bid lines (provide unit and total pricing)");
    const cols = { item: MARGIN, qty: 120, unit: 134, unitP: 158, total: 186 };
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(MUTED);
    doc.text("ITEM", cols.item, c.y);
    doc.text("EST. QTY", cols.qty, c.y, { align: "right" });
    doc.text("UNIT", cols.unit, c.y);
    doc.text("UNIT PRICE", cols.unitP, c.y);
    doc.text("TOTAL", cols.total, c.y);
    c.y += 1.6;
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, c.y, PAGE_W - MARGIN, c.y);
    c.y += 4;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(INK);
    for (const line of trade.bidLines) {
      ensure(doc, c, 6.5);
      doc.setFontSize(7.6);
      doc.text(line.description.slice(0, 58), cols.item, c.y);
      doc.text(line.qty.toLocaleString("en-US"), cols.qty, c.y, { align: "right" });
      doc.text(line.unit, cols.unit, c.y);
      // Blank ruled cells for the bidder's pen — never our numbers (anchoring).
      doc.setDrawColor(LINE);
      doc.line(cols.unitP, c.y + 0.8, cols.unitP + 22, c.y + 0.8);
      doc.line(cols.total, c.y + 0.8, cols.total + 6, c.y + 0.8);
      c.y += 5.2;
    }
    ensure(doc, c, 8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("Trade total (labor + materials + tax):", cols.item, c.y + 1);
    doc.setDrawColor(INK);
    doc.line(cols.unitP, c.y + 1.8, PAGE_W - MARGIN, c.y + 1.8);
    c.y += 8;

    heading(doc, c, "Instructions to bidders");
    bullets(doc, c, set.instructions, 7);
    c.y += 3;
    ensure(doc, c, 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Bidder company: ____________________________   License #: ______________   Date: ____________", MARGIN, c.y);
  });

  footer(doc, projectName);
  return doc;
}

// ---------- Construction schedule ----------

export function generateSchedulePdf(projectName: string, schedule: ConstructionSchedule): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const c: Cursor = { y: MARGIN + 6 };
  const months = Math.round((schedule.totalWeeks / 52) * 12);
  title(doc, c, "Construction Schedule", `${projectName} · about ${schedule.totalWeeks} weeks (~${months} months) permit to occupancy`);

  // Gantt.
  const chartX = MARGIN + 52;
  const chartW = PAGE_W - MARGIN - chartX;
  const rowH = 6.4;
  const scale = chartW / schedule.totalWeeks;
  doc.setFontSize(6.4);
  for (let wk = 0; wk <= schedule.totalWeeks; wk += 8) {
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.15);
    doc.line(chartX + wk * scale, c.y, chartX + wk * scale, c.y + schedule.milestones.length * rowH);
    doc.setTextColor(MUTED);
    doc.text(`${wk}`, chartX + wk * scale, c.y + schedule.milestones.length * rowH + 3.4, { align: "center" });
  }
  schedule.milestones.forEach((m, i) => {
    doc.setTextColor(INK);
    doc.setFontSize(6.8);
    doc.text(m.name.slice(0, 34), MARGIN, c.y + i * rowH + 4);
    doc.setFillColor(m.id === "exterior" ? "#c9a96a" : BRASS);
    doc.rect(chartX + m.startWeek * scale, c.y + i * rowH + 1.2, Math.max(1, m.weeks * scale), rowH - 2.6, "F");
  });
  c.y += schedule.milestones.length * rowH + 8;

  heading(doc, c, "Draw schedule");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  doc.setTextColor(MUTED);
  doc.text(`Builder contract basis ${usd(schedule.contractCents)} — soft costs and contingency stay with the owner.`, MARGIN, c.y);
  c.y += 5;
  doc.setTextColor(INK);
  for (const d of schedule.draws) {
    ensure(doc, c, 5);
    doc.text(`${d.name}`, MARGIN, c.y);
    doc.text(`${d.pct}%`, 150, c.y, { align: "right" });
    doc.text(usd(d.amountCents), PAGE_W - MARGIN, c.y, { align: "right" });
    c.y += 4.6;
  }
  doc.setFont("helvetica", "bold");
  ensure(doc, c, 6);
  doc.text("Total", MARGIN, c.y);
  doc.text("100%", 150, c.y, { align: "right" });
  doc.text(usd(schedule.contractCents), PAGE_W - MARGIN, c.y, { align: "right" });
  c.y += 8;

  heading(doc, c, "Read this first");
  bullets(doc, c, schedule.notes, 7);

  footer(doc, projectName);
  return doc;
}

// ---------- Maintenance plan ----------

export function generateMaintenancePdf(projectName: string, plan: MaintenancePlan): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const c: Cursor = { y: MARGIN + 6 };
  title(doc, c, "30-Year Maintenance Plan", `${projectName} · generated from this home's actual materials`);

  heading(doc, c, "Routine habits");
  bullets(
    doc,
    c,
    plan.routines.map(
      (t) =>
        `${t.system}: ${t.action} — ${t.intervalYears === 0.25 ? "quarterly" : t.intervalYears === 0.5 ? "twice a year" : "yearly"} (${COST_BAND_LABELS[t.costBand]})`,
    ),
  );
  c.y += 2;

  heading(doc, c, "Scheduled maintenance");
  bullets(
    doc,
    c,
    plan.recurring.map((t) => `${t.system}: ${t.action} — every ${t.intervalYears} year${t.intervalYears === 1 ? "" : "s"} (${COST_BAND_LABELS[t.costBand]})`),
  );
  c.y += 2;

  heading(doc, c, "Plan-ahead replacements");
  bullets(
    doc,
    c,
    plan.replacements.map((r) => `Around year ${r.atYear}: ${r.item} (${COST_BAND_LABELS[r.costBand]})`),
  );
  c.y += 2;

  heading(doc, c, "Year-by-year calendar");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(INK);
  for (const year of maintenanceCalendar(plan)) {
    const text = `Year ${year.year}: ${year.due.map((d) => d.what).join(" · ")}`;
    const lines = doc.splitTextToSize(text, PAGE_W - 2 * MARGIN) as string[];
    ensure(doc, c, lines.length * 3.2 + 1);
    doc.text(lines, MARGIN, c.y);
    c.y += lines.length * 3.2 + 1;
  }
  c.y += 3;

  heading(doc, c, "Read this first");
  bullets(doc, c, plan.notes, 7);

  footer(doc, projectName);
  return doc;
}
