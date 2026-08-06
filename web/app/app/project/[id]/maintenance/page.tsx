"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  buildMaintenancePlan,
  COST_BAND_LABELS,
  maintenanceCalendar,
} from "@/lib/engine/maintenance";
import { loadProject, type StoredProject } from "@/lib/store";

/**
 * The Ownership sphere's first deliverable: a maintenance plan generated
 * from the exact materials this home was designed with. Change the roof,
 * and the calendar changes — it's the same source of truth.
 */
export default function MaintenancePage() {
  const params = useParams<{ id: string }>();
  const [entry, setEntry] = useState<StoredProject | null | undefined>(undefined);

  useEffect(() => {
    setEntry(loadProject(params.id));
  }, [params.id]);

  if (entry === undefined) return null;
  if (entry === null)
    return (
      <main>
        <h1>Project not found</h1>
        <p>
          <Link className="btn" href="/app">
            Back to projects
          </Link>
        </p>
      </main>
    );

  const { project, finishes } = entry;
  const plan = buildMaintenancePlan(finishes ?? {});
  const calendar = maintenanceCalendar(plan);

  return (
    <main className="report">
      <div className="topbar no-print">
        <h1>Maintenance Plan</h1>
        <span style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <Link href={`/app/project/${project.id}`}>Back to project</Link>
          <button
            className="btn"
            onClick={() => {
              void import("@/lib/pdf/documents").then(({ generateMaintenancePdf }) =>
                generateMaintenancePdf(project.name, plan).save(
                  `${project.name.replace(/[^\w-]+/g, "-")}-maintenance-plan.pdf`,
                ),
              );
            }}
          >
            Download PDF
          </button>
          <button className="btn secondary" onClick={() => window.print()}>
            Print
          </button>
        </span>
      </div>

      <header>
        <h2 style={{ marginTop: 0 }}>{project.name} — 30-year care plan</h2>
        <p style={{ color: "var(--muted)" }}>
          Built from this home&apos;s actual materials — change a selection and this plan follows.
        </p>
      </header>

      <section>
        <h3>Routine habits (set reminders, not appointments)</h3>
        <table className="lineitems">
          <tbody>
            {plan.routines.map((t, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: "nowrap" }}>{t.system}</td>
                <td>{t.action}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {t.intervalYears === 0.25 ? "quarterly" : t.intervalYears === 0.5 ? "twice a year" : "yearly"}
                </td>
                <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{COST_BAND_LABELS[t.costBand]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Scheduled maintenance</h3>
        <table className="lineitems">
          <thead>
            <tr>
              <th>System</th>
              <th>Task</th>
              <th>Every</th>
              <th>Cost band</th>
            </tr>
          </thead>
          <tbody>
            {plan.recurring.map((t, i) => (
              <tr key={i}>
                <td>{t.system}</td>
                <td>{t.action}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {t.intervalYears} {t.intervalYears === 1 ? "year" : "years"}
                </td>
                <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{COST_BAND_LABELS[t.costBand]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Plan-ahead replacements</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
          Typical end-of-life within the 30-year horizon. Materials that outlive the horizon
          (slate, brick, tile) simply don&apos;t appear here — that&apos;s part of what you paid for.
        </p>
        <table className="lineitems">
          <thead>
            <tr>
              <th>Around year</th>
              <th>What</th>
              <th>Cost band</th>
            </tr>
          </thead>
          <tbody>
            {plan.replacements.map((r, i) => (
              <tr key={i}>
                <td>{r.atYear}</td>
                <td>{r.item}</td>
                <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{COST_BAND_LABELS[r.costBand]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Year-by-year calendar</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.75rem" }}>
          {calendar.map((y) => (
            <div key={y.year} className="card" style={{ padding: "0.6rem 0.8rem" }}>
              <strong style={{ fontSize: "0.85rem" }}>Year {y.year}</strong>
              <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.1rem", fontSize: "0.8rem" }}>
                {y.due.map((d, i) => (
                  <li key={i} style={d.costBand === "major" ? { fontWeight: 600 } : undefined}>
                    {d.what}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>Read this first</h3>
        <ul style={{ fontSize: "0.9rem" }}>
          {plan.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
