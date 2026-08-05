# ModelSphere — 3D Visualization Engine

**Purpose:** Make every design decision visible before it's built — photorealistic stills, immersive walkthroughs, and interactive material swaps driven by the same model that prices the home.

**Primary users:** Homeowners (visualization, decisions), professionals (design communication), contractors (spatial reference).

## Core Capabilities

### Rendering
- Photorealistic exterior and interior renders
- 360° room panoramas
- Furniture and landscape rendering
- Night lighting scenes

### Immersive
- VR walkthrough
- AR placement (site-scale model on the actual lot via mobile)
- Drone flyover and street-view style exterior orbits

### Simulation
- Sunlight simulation (time of day, by season)
- Season simulation (foliage, snow)

### Interaction
- Interactive material changes (swap flooring, paint, countertops, cladding — live) — writes back to `MaterialSelection` so CostSphere reprices instantly

### Export
Video · images · VR packages · 3D model formats (glTF/OBJ; IFC via BIM pipeline).

## Primary Flow

1. A `DesignRevision` from DesignSphere is submitted for visualization.
2. Fast preview renders return inline; high-fidelity renders queue (rendering credits apply per revenue model).
3. User explores walkthrough/AR, swaps materials; swaps propagate to CostSphere and are saved to the revision.
4. Exports are attached to the project and shareable.

## Key Data Entities

| Entity | Notes |
| --- | --- |
| `RenderJob` | Type (still/360/video/VR), status, credits consumed |
| `RenderAsset` | Output file + metadata, linked to a `DesignRevision` |
| `Scene` | Camera, lighting, season/time parameters |
| `MaterialSwap` | Interactive change event; may be committed to `MaterialSelection` |

## Architecture notes

- Rendering is asynchronous job processing (queue + GPU workers); the app never blocks on it.
- One geometry source of truth: ModelSphere consumes DesignSphere's parametric model — it never maintains a divergent copy.

## Depends on / feeds

- **Depends on:** DesignSphere geometry, MaterialSelection.
- **Feeds:** CostSphere (via committed material swaps), marketing/sharing surfaces, HomeTwin (final visual record).

## Phase mapping

**Phase 1** ships stills, 360 rooms, and web walkthrough. VR/AR, drone flyover, and simulations follow (Phase 1.x–2) once the render pipeline is stable.

## Open questions

- Render pipeline build vs. buy (in-house path tracer vs. engine like Unreal/Blender Cycles farm vs. third-party API).
- Credit pricing and free-tier allowance.
