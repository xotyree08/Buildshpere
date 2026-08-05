"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  defaultSchemeFor,
  designBoard,
  INTERIOR_SCHEMES,
  matchScheme,
  schemeByKey,
  type FurnitureItem,
  type InteriorScheme,
  type RoomDesign,
} from "@/lib/engine/interiors";
import { loadProject, saveProject, type StoredProject } from "@/lib/store";
import type { Room } from "@/lib/types";

const TONE_STROKE = "#4a463f";

/** Mini furnished plan: the room with its staged pieces, to scale. */
function RoomPlanCard({ design, scheme }: { design: RoomDesign; scheme: InteriorScheme }) {
  const { room, furniture } = design;
  const [x, z, w, d] = room.rect;
  const scale = 200 / Math.max(w, d);
  const width = w * scale;
  const height = d * scale;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxWidth: 230, height: "auto" }} role="img" aria-label={`${room.label} furnished plan`}>
      <rect x={0} y={0} width={width} height={height} fill={design.paint} stroke={TONE_STROKE} strokeWidth={2.5} />
      {/* Door tick at the hallway wall */}
      <line x1={width / 2 - 5} y1={height - 1} x2={width / 2 + 5} y2={height - 1} stroke="#fff" strokeWidth={3} />
      {furniture.map((f: FurnitureItem) => (
        <g key={f.key}>
          <rect
            x={(f.x - x) * scale}
            y={(f.z - z) * scale}
            width={f.w * scale}
            height={f.d * scale}
            fill={scheme[f.tone]}
            stroke={TONE_STROKE}
            strokeWidth={0.8}
            rx={2}
          />
        </g>
      ))}
    </svg>
  );
}

function Swatches({ scheme }: { scheme: InteriorScheme }) {
  const entries: [string, string][] = [
    ["Field", scheme.wall],
    ["Accent", scheme.accent],
    ["Textile", scheme.textile],
    ["Wood", scheme.wood],
    ["Metal", scheme.metal],
  ];
  return (
    <span style={{ display: "inline-flex", gap: "0.45rem", alignItems: "center", flexWrap: "wrap" }}>
      {entries.map(([label, color]) => (
        <span key={label} style={{ display: "inline-flex", gap: "0.3rem", alignItems: "center", fontSize: "0.75rem", color: "var(--muted)" }}>
          <span style={{ width: 16, height: 16, borderRadius: 4, background: color, border: "1px solid var(--line)", display: "inline-block" }} />
          {label}
        </span>
      ))}
    </span>
  );
}

/**
 * The interior design section: pick a scheme (or describe a feeling and
 * let the stylist pick), see every room furnished in it, and carry it
 * into the 3D walkthrough. The AI proposes from the same deterministic
 * catalog the fallback matcher uses — it never invents a scheme.
 */
export default function InteriorsPage() {
  const params = useParams<{ id: string }>();
  const [entry, setEntry] = useState<StoredProject | null | undefined>(undefined);
  const [conceptIdx, setConceptIdx] = useState(0);
  const [feel, setFeel] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

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
  const scheme = schemeByKey(entry.interiorScheme) ?? defaultSchemeFor(pkg.concept.style);
  const board = designBoard(model, scheme);

  function setScheme(key: string) {
    if (!entry) return;
    const next = { ...entry, interiorScheme: key };
    const saved = saveProject(next);
    if (saved.ok) setEntry(next);
    else setNote(saved.error);
  }

  async function stylist(e: React.FormEvent) {
    e.preventDefault();
    if (!feel.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/v1/interiors/style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: feel }),
      });
      if (res.ok) {
        const data = (await res.json()) as { schemeKey: string; note: string };
        setScheme(data.schemeKey);
        setNote(data.note);
        return;
      }
      // Honest fallback: the deterministic keyword matcher, labeled as such.
      const local = matchScheme(feel);
      if (local) {
        setScheme(local.scheme.key);
        setNote(`Matched "${local.matched.join('", "')}" → ${local.scheme.label}. (AI styling is not configured; this used the keyword matcher.)`);
      } else {
        setNote("Nothing in that maps to a scheme yet — try words like calm, coastal, rustic, or minimal. (AI styling is not configured on this deployment.)");
      }
    } catch {
      setNote("Could not reach the server — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="report">
      <div className="topbar no-print">
        <h1>Interiors</h1>
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
          <button className="btn secondary" onClick={() => window.print()}>
            Print
          </button>
        </span>
      </div>

      <header>
        <h2 style={{ marginTop: 0 }}>{project.name} — {scheme.label}</h2>
        <p style={{ color: "var(--muted)" }}>{scheme.blurb}</p>
        <Swatches scheme={scheme} />
      </header>

      <section className="card no-print" style={{ margin: "1rem 0" }}>
        <form onSubmit={stylist} style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
          <input
            style={{ flex: "1 1 260px" }}
            placeholder='How should it feel? — e.g. "calm and airy, like a spa"'
            value={feel}
            maxLength={400}
            onChange={(e) => setFeel(e.target.value)}
          />
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Styling…" : "Style it"}
          </button>
        </form>
        {note && <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem" }}>{note}</p>}
        <p style={{ margin: "0.6rem 0 0", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {INTERIOR_SCHEMES.map((s) => (
            <button
              key={s.key}
              type="button"
              className={s.key === scheme.key ? "btn" : "btn secondary"}
              style={{ padding: "0.2rem 0.7rem", fontSize: "0.78rem" }}
              onClick={() => {
                setScheme(s.key);
                setNote(null);
              }}
            >
              {s.label}
            </button>
          ))}
        </p>
      </section>

      <section>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
          Every room staged in {scheme.label} — the same furniture appears in the 3D viewer&apos;s
          Walk mode. Door swings stay clear by rule; a small room gets fewer pieces, never a
          blocked door.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "1rem" }}>
          {board.map((design) => (
            <div key={design.room.key} className="card" style={{ padding: "0.8rem" }}>
              <strong style={{ fontSize: "0.9rem" }}>{design.room.label}</strong>
              <p style={{ margin: "0.15rem 0 0.5rem", fontSize: "0.75rem", color: "var(--muted)" }}>
                {Math.round(design.room.rect[2])}×{Math.round(design.room.rect[3])} ft ·{" "}
                {design.paintLabel} paint
              </p>
              <RoomPlanCard design={design} scheme={scheme} />
              <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem", fontSize: "0.78rem" }}>
                {design.furniture.length > 0 ? (
                  design.furniture.map((f) => <li key={f.key}>{f.label}</li>)
                ) : (
                  <li>Kept open — this room stages best empty.</li>
                )}
              </ul>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.72rem", color: "var(--muted)" }}>
                {design.notes.join(" ")}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          Walk it: open the project&apos;s <Link href={`/app/project/${project.id}`}>3D viewer</Link>{" "}
          and choose &quot;Walk inside&quot; — the rooms are furnished in this scheme.
        </p>
      </section>
    </main>
  );
}
