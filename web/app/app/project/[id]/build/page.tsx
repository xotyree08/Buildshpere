"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { EMPTY_LOG, summarizeBuild, type ConstructionLog } from "@/lib/engine/buildtrack";
import { buildSchedule } from "@/lib/engine/schedule";
import { formatUsd, loadProject, newId, saveProject, type StoredProject } from "@/lib/store";
import { numField } from "@/lib/forms";

/**
 * The during-construction ledger: change orders and draw payments
 * against the plan. Local-first like every project record; the math
 * lives in the buildtrack engine, and paying ahead of the work warns
 * loudly.
 */
export default function BuildPage() {
  const params = useParams<{ id: string }>();
  const [entry, setEntry] = useState<StoredProject | null | undefined>(undefined);
  const [conceptIdx, setConceptIdx] = useState(0);
  const [coDesc, setCoDesc] = useState("");
  const [coAmount, setCoAmount] = useState("");
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

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
  const log: ConstructionLog = entry.construction ?? EMPTY_LOG;
  const summary = summarizeBuild(schedule, log);

  function persist(next: ConstructionLog) {
    if (!entry) return;
    const updated = { ...entry, construction: next };
    const saved = saveProject(updated);
    if (saved.ok) {
      setEntry(updated);
      setFeedback(null);
    } else {
      setFeedback(saved.error);
    }
  }

  function addChangeOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!coDesc.trim()) return;
    const deltaCents = numField(coAmount, { min: -100_000_000, max: 100_000_000, fallback: 0 }) * 100;
    if (deltaCents === 0) {
      setFeedback("A change order needs a non-zero amount (negative for credits).");
      return;
    }
    persist({
      ...log,
      changeOrders: [
        ...log.changeOrders,
        { id: newId(), description: coDesc.trim(), deltaCents, status: "proposed", at: Date.now() },
      ],
    });
    setCoDesc("");
    setCoAmount("");
  }

  function setChangeStatus(id: string, status: "approved" | "rejected") {
    persist({
      ...log,
      changeOrders: log.changeOrders.map((c) => (c.id === id ? { ...c, status } : c)),
    });
  }

  function recordPayment(milestoneId: string) {
    const dollars = numField(payAmounts[milestoneId] ?? "", { min: 1, fallback: 0 });
    if (dollars <= 0) {
      setFeedback("Enter the paid amount in dollars first.");
      return;
    }
    persist({
      ...log,
      draws: [...log.draws, { milestoneId, paidCents: dollars * 100, at: Date.now() }],
    });
    setPayAmounts({ ...payAmounts, [milestoneId]: "" });
  }

  return (
    <main className="report">
      <div className="topbar no-print">
        <h1>Build Tracker</h1>
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
          <Link href={`/app/project/${project.id}/schedule`}>Schedule</Link>
          <Link href={`/app/project/${project.id}`}>Back to project</Link>
        </span>
      </div>

      <header>
        <h2 style={{ marginTop: 0 }}>{project.name} — construction ledger</h2>
        <p style={{ fontSize: "1.05rem" }}>
          Working budget <strong>{formatUsd(summary.workingBudgetCents)}</strong>{" "}
          <span style={{ color: "var(--muted)" }}>
            (contract {formatUsd(summary.contractCents)}
            {summary.approvedChangeCents !== 0 && <> {summary.approvedChangeCents > 0 ? "+" : "−"} {formatUsd(Math.abs(summary.approvedChangeCents))} changes</>})
          </span>{" "}
          · paid {formatUsd(summary.paidCents)} ({summary.pctPaid}%) · remaining{" "}
          <strong>{formatUsd(summary.remainingCents)}</strong>
        </p>
      </header>

      {summary.warnings.length > 0 && (
        <section className="card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Needs your attention</h3>
          <ul style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {summary.warnings.map((w, i) => (
              <li key={i} className="status-warn">
                {w}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Draws</h3>
        <table className="lineitems">
          <thead>
            <tr>
              <th>Release when</th>
              <th>Planned</th>
              <th>Paid</th>
              <th>Status</th>
              <th>Record a payment</th>
            </tr>
          </thead>
          <tbody>
            {summary.drawStatus.map((d) => (
              <tr key={d.milestoneId}>
                <td>{d.name}</td>
                <td>{formatUsd(d.plannedCents)}</td>
                <td>{d.paidCents > 0 ? formatUsd(d.paidCents) : "—"}</td>
                <td className={d.status === "paid" ? "status-pass" : d.status === "overpaid" ? "status-fail" : d.status === "partial" ? "status-warn" : ""}>
                  {d.status}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <input
                    type="number"
                    min={1}
                    placeholder="$"
                    style={{ width: "6.5rem", marginRight: "0.4rem" }}
                    value={payAmounts[d.milestoneId] ?? ""}
                    onChange={(e) => setPayAmounts({ ...payAmounts, [d.milestoneId]: e.target.value })}
                  />
                  <button className="btn secondary" style={{ padding: "0.2rem 0.7rem", fontSize: "0.8rem" }} type="button" onClick={() => recordPayment(d.milestoneId)}>
                    Record
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Change orders</h3>
        <form onSubmit={addChangeOrder} style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.75rem" }}>
          <input
            style={{ flex: "1 1 240px" }}
            placeholder='Describe the change — e.g. "Upgrade to tile shower"'
            value={coDesc}
            onChange={(e) => setCoDesc(e.target.value)}
          />
          <input
            type="number"
            style={{ width: "9rem" }}
            placeholder="$ (− for credit)"
            value={coAmount}
            onChange={(e) => setCoAmount(e.target.value)}
          />
          <button className="btn" type="submit">
            Add
          </button>
        </form>
        {log.changeOrders.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            None yet. Every deviation from the contract belongs here, in writing, before the work happens.
          </p>
        ) : (
          <table className="lineitems">
            <thead>
              <tr>
                <th>Change</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {log.changeOrders.map((c) => (
                <tr key={c.id}>
                  <td>{c.description}</td>
                  <td>{c.deltaCents < 0 ? `−${formatUsd(-c.deltaCents)}` : formatUsd(c.deltaCents)}</td>
                  <td className={c.status === "approved" ? "status-pass" : c.status === "rejected" ? "status-fail" : "status-warn"}>
                    {c.status}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {c.status === "proposed" && (
                      <>
                        <button className="btn secondary" style={{ padding: "0.15rem 0.6rem", fontSize: "0.78rem", marginRight: "0.3rem" }} type="button" onClick={() => setChangeStatus(c.id, "approved")}>
                          Approve
                        </button>
                        <button className="btn secondary" style={{ padding: "0.15rem 0.6rem", fontSize: "0.78rem" }} type="button" onClick={() => setChangeStatus(c.id, "rejected")}>
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {feedback && <p className="status-warn">{feedback}</p>}

      <section>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          Draw plan comes from this concept&apos;s{" "}
          <Link href={`/app/project/${project.id}/schedule`}>construction schedule</Link>. Record
          payments only after the milestone&apos;s work is inspected and in place.
        </p>
      </section>
    </main>
  );
}
