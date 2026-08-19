"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  moveOpening,
  moveRoom,
  resizeRoom,
  snap,
  type Edge,
  type Envelope,
} from "@/lib/engine/edit";
import type { ParametricModel } from "@/lib/types";
import { labelFits, labelSize } from "@/lib/render/planlabel";

/**
 * Direct manipulation of the plan: drag a room, drag a wall, slide a door.
 *
 * The engine in lib/engine/edit.ts owns every rule — this component only
 * turns pointers into feet and shows what the engine says. A drag that the
 * engine would refuse is drawn in the refusal color while the pointer is
 * still down, so the answer arrives before the drop, and the reason is
 * spelled out the moment it lands.
 *
 * Nothing here writes to the project. Edits accumulate in a working copy
 * until Save, which hands the finished model up to be committed as one
 * revision — so an editing session is one reviewable change, and Discard
 * is always a complete escape.
 */

const ROOM_FILLS: Record<string, string> = {
  bedroom: "var(--plan-bedroom)",
  bathroom: "var(--plan-bathroom)",
  kitchen: "var(--plan-kitchen)",
  living: "var(--plan-living)",
  dining: "var(--plan-living)",
  office: "var(--plan-office)",
  gym: "var(--plan-office)",
  theater: "var(--plan-office)",
  garage: "var(--plan-garage)",
  hallway: "var(--plan-hall)",
  outdoor: "var(--plan-outdoor)",
};

type Drag =
  | { mode: "move"; roomKey: string; startX: number; startY: number; dxFt: number; dyFt: number }
  | { mode: "resize"; roomKey: string; edge: Edge; startX: number; startY: number; deltaFt: number }
  | { mode: "opening"; openingKey: string; startX: number; startY: number; offsetFt: number };

const HANDLE = 1.1; // feet — big enough to grab on a phone at typical zoom

export function EditableFloorPlan({
  model,
  level,
  envelope,
  onSave,
  onCancel,
}: {
  model: ParametricModel;
  level: number;
  envelope: Envelope;
  onSave: (model: ParametricModel, summaries: string[]) => void;
  onCancel: () => void;
}) {
  const [working, setWorking] = useState<ParametricModel>(model);
  const [summaries, setSummaries] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  /**
   * The authoritative drag. Pointer handlers read and write this ref rather
   * than the state mirror: an event handler closure can hold a render-old
   * copy of state, and committing a drag from a stale copy silently drops
   * the user's movement. The state below exists only so the ghost redraws.
   */
  const dragRef = useRef<Drag | null>(null);

  const setDragBoth = useCallback((next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const rooms = useMemo(() => working.rooms.filter((r) => r.level === level), [working, level]);

  // The drawing always shows the whole buildable envelope, so a room's
  // relationship to the setback line is visible while dragging — not just
  // the rooms' own bounding box, which would move under the user.
  const viewW = envelope.widthFt;
  const viewH = envelope.depthFt;
  const pad = 3;

  /** Feet per client pixel — uniform, since the viewBox scales isotropically. */
  const scale = useCallback(() => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 1;
    return (viewW + pad * 2) / rect.width;
  }, [viewW]);

  const record = useCallback((result: ReturnType<typeof moveRoom>) => {
    if (result.ok) {
      setWorking(result.model);
      setSummaries((prev) => [...prev, result.summary]);
      setMessage(null);
    } else {
      setMessage(result.error);
    }
  }, []);

  /**
   * The engine's verdict for the drag in flight, used to color the ghost.
   * A drag that hasn't moved yet is not a refusal — the room would otherwise
   * flash red the instant a finger touches it.
   */
  const dragValid = useMemo(() => {
    if (!drag) return true;
    if (drag.mode === "move") {
      if (drag.dxFt === 0 && drag.dyFt === 0) return true;
      return moveRoom(working, drag.roomKey, drag.dxFt, drag.dyFt, envelope).ok;
    }
    if (drag.mode === "resize") {
      if (drag.deltaFt === 0) return true;
      return resizeRoom(working, drag.roomKey, drag.edge, drag.deltaFt, envelope).ok;
    }
    return moveOpening(working, drag.openingKey, drag.offsetFt).ok;
  }, [drag, working, envelope]);

  function onPointerMove(e: React.PointerEvent) {
    const active = dragRef.current;
    if (!active) return;
    const k = scale();
    const dx = (e.clientX - active.startX) * k;
    const dy = (e.clientY - active.startY) * k;
    if (active.mode === "move") {
      setDragBoth({ ...active, dxFt: snap(dx), dyFt: snap(dy) });
    } else if (active.mode === "resize") {
      // Positive always grows: north/west edges grow as the pointer moves
      // toward negative coordinates.
      const raw = active.edge === "e" ? dx : active.edge === "w" ? -dx : active.edge === "s" ? dy : -dy;
      setDragBoth({ ...active, deltaFt: snap(raw) });
    } else {
      const opening = working.openings.find((o) => o.key === active.openingKey);
      if (!opening) return;
      const along = opening.wall === "n" || opening.wall === "s" ? dx : dy;
      setDragBoth({ ...active, offsetFt: snap(opening.offsetFt + along) });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const active = dragRef.current;
    if (!active) return;
    try {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      // The pointer may already have been released implicitly; either way the
      // drag still has to be committed below.
    }
    if (active.mode === "move") {
      if (active.dxFt !== 0 || active.dyFt !== 0) {
        record(moveRoom(working, active.roomKey, active.dxFt, active.dyFt, envelope));
      }
    } else if (active.mode === "resize") {
      if (active.deltaFt !== 0) record(resizeRoom(working, active.roomKey, active.edge, active.deltaFt, envelope));
    } else {
      record(moveOpening(working, active.openingKey, active.offsetFt));
    }
    setDragBoth(null);
  }

  function startDrag(e: React.PointerEvent, next: Drag) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragBoth(next);
  }

  /** Arrow keys nudge the selected room — the whole editor without a mouse. */
  function onKeyDown(e: React.KeyboardEvent) {
    if (!selected) return;
    const step = e.shiftKey ? 1 : 0.5;
    const map: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = map[e.key];
    if (!delta) {
      if (e.key === "Escape") setSelected(null);
      return;
    }
    e.preventDefault();
    record(moveRoom(working, selected, delta[0], delta[1], envelope));
  }

  const selectedRoom = rooms.find((r) => r.key === selected);
  const dirty = summaries.length > 0;

  return (
    <div>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <button
          className="btn"
          type="button"
          disabled={!dirty}
          onClick={() => onSave(working, summaries)}
        >
          {dirty ? `Save ${summaries.length} change${summaries.length === 1 ? "" : "s"}` : "Save changes"}
        </button>
        <button className="btn secondary" type="button" onClick={onCancel}>
          {dirty ? "Discard changes" : "Done editing"}
        </button>
        {dirty && (
          <button
            className="btn secondary"
            type="button"
            style={{ padding: "0.25rem 0.8rem", fontSize: "0.8rem" }}
            onClick={() => {
              setWorking(model);
              setSummaries([]);
              setMessage(null);
              setSelected(null);
            }}
          >
            Undo all
          </button>
        )}
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          {selectedRoom
            ? `${selectedRoom.label} — ${selectedRoom.rect[2]}′ × ${selectedRoom.rect[3]}′ (${Math.round(selectedRoom.rect[2] * selectedRoom.rect[3]).toLocaleString()} sq ft)`
            : "Tap a room to select · drag to move · drag a wall handle to resize"}
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`${-pad} ${-pad} ${viewW + pad * 2} ${viewH + pad * 2}`}
        role="application"
        aria-label={`Editable floor plan, level ${level + 1}. Select a room, then use arrow keys to move it.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDragBoth(null)}
        style={{
          width: "100%",
          height: "auto",
          display: "block",
          touchAction: "none",
          background: "var(--card)",
          borderRadius: 8,
          border: "1px solid var(--line)",
          cursor: drag ? "grabbing" : "default",
        }}
      >
        {/* The buildable envelope: everything must live inside this line. */}
        <rect
          x={0}
          y={0}
          width={viewW}
          height={viewH}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={0.4}
          strokeDasharray="1.5 1.5"
        />
        <text x={0} y={-0.8} fontSize={1.8} fill="var(--muted)">
          Buildable area {viewW}′ × {viewH}′
        </text>

        {rooms.map((room) => {
          const [x, y, w, d] = room.rect;
          const isSel = room.key === selected;
          const moving = drag?.mode === "move" && drag.roomKey === room.key;
          const resizing = drag?.mode === "resize" && drag.roomKey === room.key;
          const ox = moving ? drag.dxFt : 0;
          const oy = moving ? drag.dyFt : 0;

          // Preview the resize by the same rule the engine applies.
          let rx = x + ox, ry = y + oy, rw = w, rh = d;
          if (resizing) {
            const dl = drag.deltaFt;
            if (drag.edge === "n") { ry = y - dl; rh = d + dl; }
            else if (drag.edge === "s") { rh = d + dl; }
            else if (drag.edge === "w") { rx = x - dl; rw = w + dl; }
            else { rw = w + dl; }
          }
          const bad = (moving || resizing) && !dragValid;

          return (
            <g key={room.key}>
              <rect
                x={rx}
                y={ry}
                width={Math.max(rw, 0.5)}
                height={Math.max(rh, 0.5)}
                fill={ROOM_FILLS[room.kind] ?? "var(--plan-hall)"}
                fillOpacity={bad ? 0.45 : 1}
                stroke={bad ? "var(--danger, #b3261e)" : isSel ? "var(--accent)" : "var(--fg)"}
                strokeWidth={bad || isSel ? 0.9 : 0.3}
                // Focus is shown by the accent stroke and the wall handles: the
                // UA outline is scaled by the viewBox and would cover the plan.
                style={{ cursor: "grab", outline: "none" }}
                role="button"
                tabIndex={0}
                aria-label={`${room.label}, ${w} by ${d} feet at ${x}, ${y}`}
                onFocus={() => setSelected(room.key)}
                onPointerDown={(e) => {
                  setSelected(room.key);
                  setMessage(null);
                  startDrag(e, { mode: "move", roomKey: room.key, startX: e.clientX, startY: e.clientY, dxFt: 0, dyFt: 0 });
                }}
              />
              {labelFits(room.label, rw, rh) && (
                <text
                  x={rx + rw / 2}
                  y={ry + rh / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={labelSize(room.label, rw)}
                  fill="var(--fg)"
                  pointerEvents="none"
                >
                  {room.label}
                </text>
              )}

              {/* Wall handles, only on the selected room so the plan stays readable. */}
              {isSel &&
                (["n", "s", "e", "w"] as Edge[]).map((edge) => {
                  const hx = edge === "w" ? x - HANDLE / 2 : edge === "e" ? x + w - HANDLE / 2 : x + w / 2 - HANDLE;
                  const hy = edge === "n" ? y - HANDLE / 2 : edge === "s" ? y + d - HANDLE / 2 : y + d / 2 - HANDLE;
                  const hw = edge === "n" || edge === "s" ? HANDLE * 2 : HANDLE;
                  const hh = edge === "n" || edge === "s" ? HANDLE : HANDLE * 2;
                  return (
                    <rect
                      key={edge}
                      x={hx}
                      y={hy}
                      width={hw}
                      height={hh}
                      fill="var(--accent)"
                      rx={0.25}
                      style={{ cursor: edge === "n" || edge === "s" ? "ns-resize" : "ew-resize" }}
                      role="button"
                      aria-label={`Drag the ${WALL_NAMES[edge]} wall of ${room.label}`}
                      onPointerDown={(e) =>
                        startDrag(e, { mode: "resize", roomKey: room.key, edge, startX: e.clientX, startY: e.clientY, deltaFt: 0 })
                      }
                    />
                  );
                })}
            </g>
          );
        })}

        {working.openings
          .filter((o) => rooms.some((r) => r.key === o.roomKey))
          .map((o) => {
            const room = rooms.find((r) => r.key === o.roomKey)!;
            const [x, y, w, d] = room.rect;
            const dragging = drag?.mode === "opening" && drag.openingKey === o.key;
            const offset = dragging ? drag.offsetFt : o.offsetFt;
            let ox = x, oy = y, ow = o.widthFt, oh = 0.6;
            if (o.wall === "n") { ox = x + offset - o.widthFt / 2; oy = y - 0.3; }
            if (o.wall === "s") { ox = x + offset - o.widthFt / 2; oy = y + d - 0.3; }
            if (o.wall === "e") { ox = x + w - 0.3; oy = y + offset - o.widthFt / 2; ow = 0.6; oh = o.widthFt; }
            if (o.wall === "w") { ox = x - 0.3; oy = y + offset - o.widthFt / 2; ow = 0.6; oh = o.widthFt; }
            const bad = dragging && !dragValid;
            return (
              <rect
                key={o.key}
                x={ox}
                y={oy}
                width={ow}
                height={oh}
                fill={bad ? "var(--danger, #b3261e)" : o.kind === "window" ? "var(--plan-window)" : "var(--card)"}
                stroke="var(--fg)"
                strokeWidth={0.15}
                style={{ cursor: "grab" }}
                role="button"
                aria-label={`Drag the ${o.kind} on ${room.label}`}
                onPointerDown={(e) => {
                  setMessage(null);
                  startDrag(e, { mode: "opening", openingKey: o.key, startX: e.clientX, startY: e.clientY, offsetFt: o.offsetFt });
                }}
              />
            );
          })}
      </svg>

      {message && (
        <p className="status-warn" data-testid="editor-message" role="status" style={{ marginTop: "0.5rem" }}>
          {message}
        </p>
      )}

      {dirty && (
        <details style={{ marginTop: "0.5rem" }}>
          <summary style={{ cursor: "pointer", fontSize: "0.85rem" }}>
            {summaries.length} unsaved change{summaries.length === 1 ? "" : "s"}
          </summary>
          <ul style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0.35rem 0 0", paddingLeft: "1.2rem" }}>
            {summaries.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </details>
      )}

      <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0.5rem 0 0" }}>
        Health score and the estimate recalculate when you save — the same checks and pricing every
        other revision goes through. Structural and MEP consequences of a layout change are for your
        licensed professional to confirm.
      </p>
    </div>
  );
}

const WALL_NAMES: Record<Edge, string> = { n: "north", s: "south", e: "east", w: "west" };

/**
 * Room labels are drawn in feet, so a long name in a narrow room spills over
 * its neighbours. Size the text to the room it belongs to (~0.55 of the font
 * size per character for this face), and stay silent when even the floor of
 * that range would not fit — a misplaced label reads as a drafting error.
 */
