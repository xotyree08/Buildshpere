"use client";

import { useRef, useState } from "react";

import { featureLabel, type InspirationAnalysis } from "@/lib/engine/inspiration";
import { ROOFING, SIDING } from "@/lib/catalog/materials";
import { styleInfo } from "@/lib/catalog/styles";

export interface InspirationResult {
  photoDataUrl: string;
  analysis: InspirationAnalysis | null;
}

/** Downscale to ≤maxEdge px JPEG so uploads and localStorage stay small. */
async function downscale(file: File, maxEdge = 1024): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function InspirationUpload({
  onResult,
}: {
  onResult: (result: InspirationResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<InspirationAnalysis | null>(null);
  const [status, setStatus] = useState<"idle" | "analyzing" | "done" | "unavailable" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleFile(file: File) {
    setStatus("analyzing");
    setMessage(null);
    setAnalysis(null);
    let dataUrl: string;
    try {
      dataUrl = await downscale(file);
    } catch {
      setStatus("error");
      setMessage("Couldn't read that image — try a JPEG or PNG.");
      return;
    }
    setPhoto(dataUrl);

    try {
      const res = await fetch("/api/v1/inspiration/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageBase64: dataUrl.split(",")[1],
          mediaType: "image/jpeg",
        }),
      });
      if (res.status === 503) {
        setStatus("unavailable");
        setMessage("AI photo analysis isn't configured here — pick a style manually; the photo is kept as inspiration.");
        onResult({ photoDataUrl: dataUrl, analysis: null });
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setStatus("error");
        setMessage(body?.error ?? "Analysis failed — pick a style manually.");
        onResult({ photoDataUrl: dataUrl, analysis: null });
        return;
      }
      const { analysis: found } = (await res.json()) as { analysis: InspirationAnalysis };
      setAnalysis(found);
      setStatus("done");
      onResult({ photoDataUrl: dataUrl, analysis: found });
    } catch {
      setStatus("error");
      setMessage("Analysis failed — pick a style manually.");
      onResult({ photoDataUrl: dataUrl, analysis: null });
    }
  }

  const detected = analysis?.styleKey ? styleInfo(analysis.styleKey) : null;

  return (
    <div style={{ marginBottom: "1rem" }}>
      <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
        Inspiration photo (optional) — we read its style and design a <em>new</em> home in that
        spirit for your rooms and lot. The drawings won&apos;t reproduce the photo.
      </span>
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", marginTop: "0.35rem" }}>
        <button
          type="button"
          className="btn secondary"
          onClick={() => inputRef.current?.click()}
          disabled={status === "analyzing"}
        >
          {photo ? "Change photo" : "Upload photo"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt="Inspiration home"
            style={{ width: 120, borderRadius: 8, border: "1px solid var(--line)" }}
          />
        )}
        <div style={{ flex: 1, fontSize: "0.9rem" }}>
          {status === "analyzing" && <p style={{ margin: 0 }}>Analyzing the home's style…</p>}
          {status === "done" && detected && (
            <p style={{ margin: 0 }}>
              Looks like <strong>{detected.label}</strong>
              {analysis!.secondaryStyleKey && styleInfo(analysis!.secondaryStyleKey) && (
                <> with {styleInfo(analysis!.secondaryStyleKey)!.label} influence</>
              )}{" "}
              ({Math.round(analysis!.confidence * 100)}% match) ·{" "}
              {analysis!.levels === 2 ? "two-story" : "single-story"}
              {analysis!.features.length > 0 && <> · {analysis!.features.map(featureLabel).join(", ")}</>}
              {(analysis!.sidingKey || analysis!.roofingKey) && (
                <>
                  {" "}
                  · materials applied:{" "}
                  {[
                    SIDING.find((s) => s.key === analysis!.sidingKey)?.label,
                    ROOFING.find((r) => r.key === analysis!.roofingKey)?.label,
                  ]
                    .filter(Boolean)
                    .join(" + ")}
                </>
              )}
              {analysis!.notes && (
                <>
                  <br />
                  <span style={{ color: "var(--muted)" }}>{analysis!.notes}</span>
                </>
              )}
              <br />
              <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                Your concepts will be new designs in this style, sized to your program — not a
                copy of the photo.
              </span>
            </p>
          )}
          {status === "done" && !detected && (
            <p style={{ margin: 0 }} className="status-warn">
              Couldn't confidently match a style — pick one manually below.
            </p>
          )}
          {message && (
            <p style={{ margin: 0 }} className="status-warn">
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
