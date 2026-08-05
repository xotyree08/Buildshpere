"use client";

import { useState } from "react";

import type { ConstraintKind, ConstraintSeverity, SiteConstraint } from "@/lib/types";

const KINDS: ConstraintKind[] = ["zoning", "easement", "flood", "hoa", "tree", "soil", "utility", "access", "other"];
const SEVERITIES: ConstraintSeverity[] = ["info", "caution", "blocking"];
const SEVERITY_CLASS: Record<ConstraintSeverity, string> = {
  info: "",
  caution: "status-warn",
  blocking: "status-fail",
};

/**
 * The site constraint register (BS-LAND-004): easements, HOA rules, flood
 * notes — user-entered and labeled so, tracked to resolution, never
 * deleted (a resolved constraint is history, not noise). Parcel-data
 * sources arrive with LandSphere.
 */
export function ConstraintRegister({
  constraints,
  onChange,
}: {
  constraints: SiteConstraint[];
  onChange: (next: SiteConstraint[]) => Promise<string | null>;
}) {
  const [kind, setKind] = useState<ConstraintKind>("easement");
  const [severity, setSeverity] = useState<ConstraintSeverity>("caution");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function apply(next: SiteConstraint[]) {
    setBusy(true);
    try {
      setMessage(await onChange(next));
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = note.trim();
    if (trimmed.length < 3) {
      setMessage("Describe the constraint (at least a few words).");
      return;
    }
    const entry: SiteConstraint = {
      id: `c-${Math.random().toString(36).slice(2, 10)}`,
      kind,
      severity,
      note: trimmed.slice(0, 500),
      status: "open",
      source: "user-entered",
    };
    await apply([...constraints, entry]);
    setNote("");
  }

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>Site constraints</h2>
      <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 0.5rem" }}>
        Record what you know about the lot — easements, HOA rules, flood zones, protected trees.
        Everything here is user-entered (county data arrives with LandSphere); open blocking
        constraints hold back permit readiness until resolved.
      </p>

      {constraints.length > 0 && (
        <ul style={{ listStyle: "none", margin: "0 0 0.75rem", padding: 0, fontSize: "0.9rem" }}>
          {constraints.map((c) => (
            <li key={c.id} style={{ display: "flex", gap: "0.75rem", alignItems: "baseline", padding: "0.2rem 0", flexWrap: "wrap" }}>
              <span className={SEVERITY_CLASS[c.severity]} style={{ whiteSpace: "nowrap" }}>
                {c.severity}
              </span>
              <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{c.kind}</span>
              <span style={{ flex: "1 1 12rem", textDecoration: c.status === "resolved" ? "line-through" : "none" }}>
                {c.note}
              </span>
              <button
                className="btn secondary"
                style={{ padding: "0.1rem 0.6rem", fontSize: "0.8rem" }}
                type="button"
                disabled={busy}
                onClick={() =>
                  void apply(
                    constraints.map((x) =>
                      x.id === c.id ? { ...x, status: x.status === "open" ? "resolved" : "open" } : x,
                    ),
                  )
                }
              >
                {c.status === "open" ? "Resolve" : "Reopen"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="field" style={{ margin: 0 }}>
          <span>Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as ConstraintKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ margin: 0 }}>
          <span>Severity</span>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as ConstraintSeverity)}>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ margin: 0, flex: "1 1 14rem" }}>
          <span>Constraint</span>
          <input
            value={note}
            placeholder='e.g. "10 ft drainage easement along the north line"'
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button className="btn" type="submit" disabled={busy}>
          Add
        </button>
      </form>
      {message && <p className="status-warn">{message}</p>}
    </div>
  );
}
