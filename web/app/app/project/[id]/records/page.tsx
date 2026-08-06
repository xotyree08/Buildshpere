"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  EMPTY_RECORDS,
  summarizeRecords,
  warrantyState,
  type OwnershipRecords,
} from "@/lib/records";
import { loadProject, newId, saveProject, type StoredProject } from "@/lib/store";

/**
 * The home's paper trail: warranties (with expiry alarms), the
 * equipment registry, and the closeout punch list — the records that
 * make year-seven service calls painless.
 */
export default function RecordsPage() {
  const params = useParams<{ id: string }>();
  const [entry, setEntry] = useState<StoredProject | null | undefined>(undefined);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [wForm, setWForm] = useState({ item: "", provider: "", expires: "" });
  const [eForm, setEForm] = useState({ name: "", brand: "", modelNo: "", serial: "" });
  const [pForm, setPForm] = useState({ roomLabel: "", note: "" });

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
  const records: OwnershipRecords = entry.records ?? EMPTY_RECORDS;
  const now = Date.now();
  const summary = summarizeRecords(records, now);
  const roomLabels = [
    ...new Set(
      (packages[0]?.concept.model.rooms ?? [])
        .filter((r) => r.kind !== "hallway")
        .map((r) => r.label),
    ),
  ];

  function persist(next: OwnershipRecords) {
    if (!entry) return;
    const updated = { ...entry, records: next };
    const saved = saveProject(updated);
    if (saved.ok) {
      setEntry(updated);
      setFeedback(null);
    } else {
      setFeedback(saved.error);
    }
  }

  function addWarranty(e: React.FormEvent) {
    e.preventDefault();
    const expiresAt = Date.parse(wForm.expires);
    if (!wForm.item.trim() || Number.isNaN(expiresAt)) {
      setFeedback("A warranty needs an item and an expiration date.");
      return;
    }
    persist({
      ...records,
      warranties: [...records.warranties, { id: newId(), item: wForm.item.trim(), provider: wForm.provider.trim(), expiresAt }],
    });
    setWForm({ item: "", provider: "", expires: "" });
  }

  function addEquipment(e: React.FormEvent) {
    e.preventDefault();
    if (!eForm.name.trim()) {
      setFeedback("Equipment needs at least a name.");
      return;
    }
    persist({
      ...records,
      equipment: [...records.equipment, { id: newId(), name: eForm.name.trim(), brand: eForm.brand.trim(), modelNo: eForm.modelNo.trim(), serial: eForm.serial.trim() }],
    });
    setEForm({ name: "", brand: "", modelNo: "", serial: "" });
  }

  function addPunch(e: React.FormEvent) {
    e.preventDefault();
    if (!pForm.note.trim()) {
      setFeedback("Describe the punch item.");
      return;
    }
    persist({
      ...records,
      punch: [
        ...records.punch,
        { id: newId(), roomLabel: pForm.roomLabel || roomLabels[0] || "General", note: pForm.note.trim(), status: "open", at: now },
      ],
    });
    setPForm({ roomLabel: "", note: "" });
  }

  function togglePunch(id: string) {
    persist({
      ...records,
      punch: records.punch.map((p) => (p.id === id ? { ...p, status: p.status === "open" ? "done" : "open" } : p)),
    });
  }

  return (
    <main className="report">
      <div className="topbar no-print">
        <h1>Home Records</h1>
        <span style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <Link href={`/app/project/${project.id}/maintenance`}>Maintenance plan</Link>
          <Link href={`/app/project/${project.id}`}>Back to project</Link>
        </span>
      </div>

      <header>
        <h2 style={{ marginTop: 0 }}>{project.name}</h2>
        <p style={{ color: "var(--muted)" }}>
          {summary.openPunch} open punch item{summary.openPunch === 1 ? "" : "s"} ·{" "}
          {summary.expiringSoon.length} warrant{summary.expiringSoon.length === 1 ? "y" : "ies"} expiring
          within 90 days.
        </p>
        {summary.expiringSoon.length > 0 && (
          <p className="status-warn">
            Expiring soon:{" "}
            {summary.expiringSoon.map((w) => `${w.item} (${new Date(w.expiresAt).toLocaleDateString()})`).join(", ")}{" "}
            — file claims for any defects before these dates.
          </p>
        )}
      </header>

      <section>
        <h3>Warranties</h3>
        <form onSubmit={addWarranty} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
          <input placeholder="Item — e.g. Roof shingles" value={wForm.item} onChange={(e) => setWForm({ ...wForm, item: e.target.value })} style={{ flex: "1 1 180px" }} />
          <input placeholder="Provider" value={wForm.provider} onChange={(e) => setWForm({ ...wForm, provider: e.target.value })} style={{ flex: "1 1 140px" }} />
          <input type="date" value={wForm.expires} onChange={(e) => setWForm({ ...wForm, expires: e.target.value })} />
          <button className="btn" type="submit">Add</button>
        </form>
        {records.warranties.length > 0 && (
          <table className="lineitems">
            <tbody>
              {[...records.warranties].sort((a, b) => a.expiresAt - b.expiresAt).map((w) => {
                const state = warrantyState(w, now);
                return (
                  <tr key={w.id}>
                    <td>{w.item}</td>
                    <td>{w.provider || "—"}</td>
                    <td>{new Date(w.expiresAt).toLocaleDateString()}</td>
                    <td className={state === "active" ? "status-pass" : state === "expiring" ? "status-warn" : "status-fail"}>{state}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>Equipment registry</h3>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 0.5rem" }}>
          Model and serial numbers turn every future service call from an archaeology dig into a phone call.
        </p>
        <form onSubmit={addEquipment} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
          <input placeholder="Equipment — e.g. Furnace" value={eForm.name} onChange={(e) => setEForm({ ...eForm, name: e.target.value })} style={{ flex: "1 1 150px" }} />
          <input placeholder="Brand" value={eForm.brand} onChange={(e) => setEForm({ ...eForm, brand: e.target.value })} style={{ width: "8rem" }} />
          <input placeholder="Model #" value={eForm.modelNo} onChange={(e) => setEForm({ ...eForm, modelNo: e.target.value })} style={{ width: "8rem" }} />
          <input placeholder="Serial #" value={eForm.serial} onChange={(e) => setEForm({ ...eForm, serial: e.target.value })} style={{ width: "9rem" }} />
          <button className="btn" type="submit">Add</button>
        </form>
        {records.equipment.length > 0 && (
          <table className="lineitems">
            <tbody>
              {records.equipment.map((eq) => (
                <tr key={eq.id}>
                  <td>{eq.name}</td>
                  <td>{eq.brand || "—"}</td>
                  <td>{eq.modelNo || "—"}</td>
                  <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>{eq.serial || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>Punch list</h3>
        <form onSubmit={addPunch} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.6rem" }}>
          <select value={pForm.roomLabel} onChange={(e) => setPForm({ ...pForm, roomLabel: e.target.value })}>
            {["", ...roomLabels].map((r) => (
              <option key={r} value={r}>
                {r || "Room…"}
              </option>
            ))}
            <option value="General">General / exterior</option>
          </select>
          <input placeholder='What needs fixing — e.g. "door rubs the jamb"' value={pForm.note} onChange={(e) => setPForm({ ...pForm, note: e.target.value })} style={{ flex: "1 1 240px" }} />
          <button className="btn" type="submit">Add</button>
        </form>
        {records.punch.length > 0 && (
          <table className="lineitems">
            <tbody>
              {records.punch.map((p) => (
                <tr key={p.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{p.roomLabel}</td>
                  <td style={p.status === "done" ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>{p.note}</td>
                  <td>
                    <button className="btn secondary" style={{ padding: "0.15rem 0.6rem", fontSize: "0.78rem" }} type="button" onClick={() => togglePunch(p.id)}>
                      {p.status === "open" ? "Mark done" : "Reopen"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {feedback && <p className="status-warn">{feedback}</p>}
    </main>
  );
}
