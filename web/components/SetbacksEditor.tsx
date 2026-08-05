"use client";

import { useState } from "react";

import { GENERIC_SETBACKS, isGenericSetbacks, sanitizeSetbacks, type SetbackRules } from "@/lib/engine/site";

const FIELDS: { field: keyof SetbackRules; label: string; max: number }[] = [
  { field: "frontFt", label: "Front (ft)", max: 100 },
  { field: "rearFt", label: "Rear (ft)", max: 100 },
  { field: "sideFt", label: "Side (ft)", max: 50 },
  { field: "maxCoveragePct", label: "Max coverage (%)", max: 100 },
];

/**
 * Entry form for the jurisdiction's real setback rules. The app never
 * guesses local code (L8) — the customer copies numbers from their
 * jurisdiction's published zoning table, and everything downstream
 * (site plan, permit readiness) checks against them.
 */
export function SetbacksEditor({
  rules,
  onSave,
}: {
  rules: SetbackRules;
  /** null = reset to the generic defaults. */
  onSave: (rules: SetbackRules | null) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<keyof SetbackRules, string>>({
    frontFt: "",
    rearFt: "",
    sideFt: "",
    maxCoveragePct: "",
  });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  function startEditing() {
    setDraft({
      frontFt: String(rules.frontFt),
      rearFt: String(rules.rearFt),
      sideFt: String(rules.sideFt),
      maxCoveragePct: String(rules.maxCoveragePct),
    });
    setFeedback(null);
    setEditing(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const next = sanitizeSetbacks({
        frontFt: Number(draft.frontFt),
        rearFt: Number(draft.rearFt),
        sideFt: Number(draft.sideFt),
        maxCoveragePct: Number(draft.maxCoveragePct),
      });
      const problem = await onSave(next);
      setFeedback(problem);
      if (!problem) setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <p style={{ display: "flex", gap: "0.5rem", alignItems: "center", margin: "0.5rem 0 0" }}>
        <button className="btn secondary" style={{ padding: "0.2rem 0.7rem", fontSize: "0.85rem" }} type="button" onClick={startEditing}>
          Enter my jurisdiction&apos;s setbacks
        </button>
        {!isGenericSetbacks(rules) && (
          <button
            className="btn secondary"
            style={{ padding: "0.2rem 0.7rem", fontSize: "0.85rem" }}
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setFeedback(await onSave(null));
              } finally {
                setBusy(false);
              }
            }}
          >
            Reset to generic
          </button>
        )}
        {feedback && <span className="status-warn">{feedback}</span>}
      </p>
    );
  }

  return (
    <form onSubmit={submit} style={{ margin: "0.5rem 0 0" }}>
      <p style={{ margin: "0 0 0.35rem", fontSize: "0.85rem", color: "var(--muted)" }}>
        Copy these from your jurisdiction&apos;s published zoning table (out-of-range values are clamped; defaults:{" "}
        {GENERIC_SETBACKS.frontFt}/{GENERIC_SETBACKS.rearFt}/{GENERIC_SETBACKS.sideFt} ft, {GENERIC_SETBACKS.maxCoveragePct}%).
      </p>
      <p style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end", margin: 0 }}>
        {FIELDS.map(({ field, label, max }) => (
          <label key={field} style={{ display: "flex", flexDirection: "column", fontSize: "0.8rem", gap: "0.2rem" }}>
            {label}
            <input
              type="number"
              min={0}
              max={max}
              step={0.5}
              required
              value={draft[field]}
              onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
              style={{ width: "6.5rem", padding: "0.35rem 0.5rem", border: "1px solid var(--line)", borderRadius: 8, background: "var(--card)", color: "var(--fg)", font: "inherit" }}
            />
          </label>
        ))}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button className="btn secondary" type="button" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </p>
      {feedback && <p className="status-warn">{feedback}</p>}
    </form>
  );
}
