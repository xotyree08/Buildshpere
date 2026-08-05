"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { CONCEPT_DISCLAIMER } from "@/lib/claims";
import { buildSchedule, type ConstructionSchedule } from "@/lib/engine/schedule";
import { formatUsd, loadProject, type StoredProject } from "@/lib/store";

function GanttChart({ schedule }: { schedule: ConstructionSchedule }) {
  const rowH = 30;
  const labelW = 190;
  const chartW = 640;
  const w = labelW + chartW;
  const h = schedule.milestones.length * rowH + 28;
  const scale = chartW / schedule.totalWeeks;

  const gridStep = schedule.totalWeeks > 40 ? 8 : 4;
  const gridWeeks: number[] = [];
  for (let wk = 0; wk <= schedule.totalWeeks; wk += gridStep) gridWeeks.push(wk);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: "100%", height: "auto", maxWidth: w }}
      role="img"
      aria-label="Construction timeline"
    >
      {gridWeeks.map((wk) => (
        <g key={wk}>
          <line
            x1={labelW + wk * scale}
            y1={0}
            x2={labelW + wk * scale}
            y2={h - 18}
            stroke="var(--line)"
            strokeWidth="1"
          />
          <text x={labelW + wk * scale} y={h - 4} fontSize="10" fill="var(--muted)" textAnchor="middle">
            Wk {wk}
          </text>
        </g>
      ))}
      {schedule.milestones.map((m, i) => (
        <g key={m.id}>
          <text
            x={labelW - 8}
            y={i * rowH + rowH / 2 + 4}
            fontSize="11"
            fill="var(--fg)"
            textAnchor="end"
          >
            {m.name}
          </text>
          <rect
            x={labelW + m.startWeek * scale}
            y={i * rowH + 6}
            width={Math.max(2, m.weeks * scale)}
            height={rowH - 12}
            rx="3"
            fill={m.id === "exterior" ? "var(--brass-soft, #c9a96a)" : "var(--brass, #9a7b3f)"}
            opacity={m.id === "permits" ? 0.45 : 0.9}
          />
          <text
            x={labelW + m.startWeek * scale + Math.max(2, m.weeks * scale) + 6}
            y={i * rowH + rowH / 2 + 4}
            fontSize="10"
            fill="var(--muted)"
          >
            {m.weeks} wk
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * The construction schedule: milestone timeline sized from the design,
 * and a draw schedule tied to inspected milestones — the two documents a
 * first-time builder needs before signing anything.
 */
export default function SchedulePage() {
  const params = useParams<{ id: string }>();
  const [entry, setEntry] = useState<StoredProject | null | undefined>(undefined);
  const [conceptIdx, setConceptIdx] = useState(0);

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

  const { project, packages } = entry;
  const pkg = packages[Math.min(conceptIdx, packages.length - 1)];
  const history = pkg.revisions ?? [];
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const model = latest ? latest.revision.model : pkg.concept.model;
  const estimate = latest ? latest.estimate : pkg.estimate;
  const schedule = buildSchedule(model, estimate);

  const months = Math.round((schedule.totalWeeks / 52) * 12);

  return (
    <main className="report">
      <div className="topbar no-print">
        <h1>Construction Schedule</h1>
        <span style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.9rem" }}>
            Concept
            <select value={conceptIdx} onChange={(e) => setConceptIdx(Number(e.target.value))}>
              {packages.map((p, i) => (
                <option key={p.concept.id} value={i}>
                  {p.concept.label}
                </option>
              ))}
            </select>
          </label>
          <Link href={`/app/project/${project.id}`}>Back to project</Link>
          <button
            className="btn"
            onClick={() => {
              void import("@/lib/pdf/documents").then(({ generateSchedulePdf }) =>
                generateSchedulePdf(project.name, schedule).save(
                  `${project.name.replace(/[^\w-]+/g, "-")}-schedule.pdf`,
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
        <h2 style={{ marginTop: 0 }}>
          {project.name} — {pkg.concept.label}
        </h2>
        <p style={{ color: "var(--muted)" }}>
          About <strong>{schedule.totalWeeks} weeks</strong> (~{months} months) from permit
          application to certificate of occupancy, for this design&apos;s size.
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{CONCEPT_DISCLAIMER}</p>
      </header>

      <section>
        <h3>Timeline</h3>
        <GanttChart schedule={schedule} />
      </section>

      <section>
        <h3>Milestones</h3>
        <table className="lineitems">
          <thead>
            <tr>
              <th>Milestone</th>
              <th>Weeks</th>
              <th>What happens</th>
              <th>Trades on site</th>
            </tr>
          </thead>
          <tbody>
            {schedule.milestones.map((m) => (
              <tr key={m.id}>
                <td style={{ whiteSpace: "nowrap" }}>{m.name}</td>
                <td>
                  {m.startWeek}–{m.startWeek + m.weeks}
                </td>
                <td>{m.detail}</td>
                <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{m.trades.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Draw schedule</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
          Builder contract basis: <strong>{formatUsd(schedule.contractCents)}</strong> (hard costs —
          soft costs and contingency stay with you).
        </p>
        <table className="lineitems">
          <thead>
            <tr>
              <th>Release when</th>
              <th>Share</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {schedule.draws.map((d) => (
              <tr key={d.milestoneId + d.name}>
                <td>{d.name}</td>
                <td>{d.pct}%</td>
                <td>{formatUsd(d.amountCents)}</td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Total</strong>
              </td>
              <td>
                <strong>100%</strong>
              </td>
              <td>
                <strong>{formatUsd(schedule.contractCents)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>Read this first</h3>
        <ul style={{ fontSize: "0.9rem" }}>
          {schedule.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
