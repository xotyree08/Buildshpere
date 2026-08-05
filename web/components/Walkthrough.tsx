"use client";

import { useMemo, useState } from "react";

import { FloorPlan } from "@/components/FloorPlan";
import { RoomView } from "@/components/RoomView";
import { buildTour, stopDescription } from "@/lib/engine/walkthrough";
import type { ParametricModel } from "@/lib/types";

/** Guided room-by-room tour: plan on the left, interior view on the right. */
export function Walkthrough({ model }: { model: ParametricModel }) {
  const tour = useMemo(() => buildTour(model), [model]);
  const [index, setIndex] = useState(0);
  const stop = tour[Math.min(index, tour.length - 1)];
  if (!stop) return null;

  return (
    <div>
      <div className="topbar" style={{ marginBottom: "0.5rem" }}>
        <h3 style={{ margin: 0 }}>
          {index + 1} / {tour.length} — {stop.room.label}
          {model.levels > 1 && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · level {stop.room.level + 1}</span>}
        </h3>
        <span style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn secondary"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            type="button"
          >
            ← Back
          </button>
          <button
            className="btn"
            onClick={() => setIndex((i) => Math.min(tour.length - 1, i + 1))}
            disabled={index === tour.length - 1}
            type="button"
          >
            Next room →
          </button>
        </span>
      </div>
      <p style={{ margin: "0 0 0.75rem", color: "var(--muted)" }}>{stopDescription(stop)}</p>
      <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <p style={{ margin: "0 0 0.25rem", fontSize: "0.8rem" }}>You are here</p>
          <FloorPlan model={model} level={stop.room.level} highlightKey={stop.room.key} />
        </div>
        <div style={{ flex: "1 1 260px" }}>
          <p style={{ margin: "0 0 0.25rem", fontSize: "0.8rem" }}>Looking into the room</p>
          <RoomView stop={stop} />
        </div>
      </div>
    </div>
  );
}
