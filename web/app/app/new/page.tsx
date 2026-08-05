"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { runDesignLoop } from "@/lib/engine/loop";
import { newId, saveProject } from "@/lib/store";
import type { DesignBrief, HomeStyle } from "@/lib/types";

const STYLES: { value: HomeStyle; label: string }[] = [
  { value: "modern", label: "Modern" },
  { value: "traditional", label: "Traditional" },
  { value: "farmhouse", label: "Farmhouse" },
  { value: "mediterranean", label: "Mediterranean" },
  { value: "luxury_contemporary", label: "Luxury Contemporary" },
  { value: "scandinavian", label: "Scandinavian" },
  { value: "coastal", label: "Coastal" },
  { value: "mountain", label: "Mountain" },
];

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
  const [office, setOffice] = useState(false);
  const [gym, setGym] = useState(false);
  const [theater, setTheater] = useState(false);
  const [outdoorKitchen, setOutdoorKitchen] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

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
    const packages = runDesignLoop(brief, { lotWidthFt: lotWidth, budgetCents, regionCode: region });
    saveProject({
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
    });
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

        <label className="field">
          <span>Style</span>
          <select value={style} onChange={(e) => setStyle(e.target.value as HomeStyle)}>
            {STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

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
      </form>
    </main>
  );
}
