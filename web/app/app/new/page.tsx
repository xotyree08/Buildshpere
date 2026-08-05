"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { InspirationUpload, type InspirationResult } from "@/components/InspirationUpload";
import { DEFAULT_FINISHES, FINISH_CATEGORIES, type FinishSelections } from "@/lib/catalog/materials";
import { styleInfo, stylesByCategory } from "@/lib/catalog/styles";
import { runDesignLoop } from "@/lib/engine/loop";
import { newId, saveProject } from "@/lib/store";
import type { DesignBrief, HomeStyle } from "@/lib/types";

const REGIONS = [
  ["US_NATIONAL", "US — National average"],
  ["US_SOUTH", "US — South"],
  ["US_MIDWEST", "US — Midwest"],
  ["US_NORTHEAST", "US — Northeast"],
  ["US_WEST", "US — West"],
] as const;

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("My Custom Home");
  const [budget, setBudget] = useState(450000);
  const [region, setRegion] = useState("US_NATIONAL");
  const [lotWidth, setLotWidth] = useState(60);
  const [lotDepth, setLotDepth] = useState(120);
  const [familySize, setFamilySize] = useState(4);
  const [bedrooms, setBedrooms] = useState(3);
  const [bathrooms, setBathrooms] = useState(2);
  const [garageBays, setGarageBays] = useState(2);
  const [style, setStyle] = useState<HomeStyle>("modern");
  const [finishes, setFinishes] = useState<FinishSelections>({ ...DEFAULT_FINISHES });
  const [inspiration, setInspiration] = useState<InspirationResult | null>(null);

  function handleInspiration(result: InspirationResult) {
    setInspiration(result);
    if (result.analysis?.styleKey) setStyle(result.analysis.styleKey);
  }
  const [office, setOffice] = useState(false);
  const [gym, setGym] = useState(false);
  const [theater, setTheater] = useState(false);
  const [outdoorKitchen, setOutdoorKitchen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const projectId = newId();
    const brief: DesignBrief = {
      id: `${projectId}-brief-1`,
      projectId,
      version: 1,
      program: { familySize, bedrooms, bathrooms, office, gym, theater, outdoorKitchen, garageBays },
      style,
      interiors: {},
      lifestyleNotes: notes,
    };
    const budgetCents = Math.round(budget * 100);
    const packages = runDesignLoop(brief, { lotWidthFt: lotWidth, budgetCents, regionCode: region, finishes });
    const saved = saveProject({
      project: {
        id: projectId,
        ownerId: "local",
        name,
        addressText: null,
        lotWidthFt: lotWidth,
        lotDepthFt: lotDepth,
        budgetCents,
        status: "designing",
      },
      brief,
      packages,
      regionCode: region,
      finishes,
      inspiration: inspiration ?? undefined,
    });
    if (!saved.ok) {
      setBusy(false);
      setSaveError(saved.error);
      return;
    }
    router.push(`/app/project/${projectId}`);
  }

  return (
    <main>
      <div className="topbar">
        <h1>Design Interview</h1>
        <a href="/app">Back to projects</a>
      </div>
      <form onSubmit={submit} className="card" style={{ maxWidth: 720 }}>
        <label className="field">
          <span>Project name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Budget (USD)</span>
            <input type="number" min={50000} step={10000} value={budget} onChange={(e) => setBudget(+e.target.value)} />
          </label>
          <label className="field">
            <span>Region</span>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              {REGIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Lot width (ft)</span>
            <input type="number" min={25} value={lotWidth} onChange={(e) => setLotWidth(+e.target.value)} />
          </label>
          <label className="field">
            <span>Lot depth (ft)</span>
            <input type="number" min={40} value={lotDepth} onChange={(e) => setLotDepth(+e.target.value)} />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Family size</span>
            <input type="number" min={1} max={12} value={familySize} onChange={(e) => setFamilySize(+e.target.value)} />
          </label>
          <label className="field">
            <span>Bedrooms</span>
            <input type="number" min={1} max={8} value={bedrooms} onChange={(e) => setBedrooms(+e.target.value)} />
          </label>
          <label className="field">
            <span>Bathrooms</span>
            <input type="number" min={1} max={8} value={bathrooms} onChange={(e) => setBathrooms(+e.target.value)} />
          </label>
          <label className="field">
            <span>Garage bays</span>
            <input type="number" min={0} max={4} value={garageBays} onChange={(e) => setGarageBays(+e.target.value)} />
          </label>
        </div>

        <InspirationUpload onResult={handleInspiration} />

        <label className="field">
          <span>Architectural style</span>
          <select value={style} onChange={(e) => setStyle(e.target.value as HomeStyle)}>
            {stylesByCategory().map(([category, styles]) => (
              <optgroup key={category} label={category}>
                {styles.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {styleInfo(style) && (
          <p style={{ marginTop: "-0.5rem", fontSize: "0.85rem", color: "var(--muted)" }}>
            {styleInfo(style)!.description} Roof: {styleInfo(style)!.roof}.
          </p>
        )}

        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Interior finishes</span>
        <div className="field-row" style={{ marginTop: "0.25rem" }}>
          {FINISH_CATEGORIES.map(({ field, label, options }) => (
            <label className="field" key={field}>
              <span>{label}</span>
              <select
                value={finishes[field] ?? DEFAULT_FINISHES[field]}
                onChange={(e) => setFinishes({ ...finishes, [field]: e.target.value })}
              >
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label} ({o.tier})
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Special spaces</span>
        <div className="checks">
          <label>
            <input type="checkbox" checked={office} onChange={(e) => setOffice(e.target.checked)} /> Office
          </label>
          <label>
            <input type="checkbox" checked={gym} onChange={(e) => setGym(e.target.checked)} /> Gym
          </label>
          <label>
            <input type="checkbox" checked={theater} onChange={(e) => setTheater(e.target.checked)} /> Theater
          </label>
          <label>
            <input type="checkbox" checked={outdoorKitchen} onChange={(e) => setOutdoorKitchen(e.target.checked)} />{" "}
            Outdoor kitchen
          </label>
        </div>

        <label className="field">
          <span>Lifestyle notes (optional)</span>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        <button className="btn" disabled={busy} type="submit">
          {busy ? "Generating…" : "Generate concepts"}
        </button>
        {saveError && <p className="status-fail">{saveError}</p>}
      </form>
    </main>
  );
}
