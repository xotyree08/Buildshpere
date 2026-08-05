# DesignSphere — AI Architectural Design Engine

**Purpose:** Turn a structured interview about budget, lifestyle, and taste into buildable design concepts — floor plans, elevations, and placement — validated by automated design-quality checks.

**Primary users:** Homeowners (interview + concept selection); architects (review and refinement via EngineerSphere).

## Core Capabilities

### User interview
Collects the design brief:
- **Program:** budget, lifestyle, family size, bedrooms, bathrooms, office, gym, theater, outdoor kitchen, garage
- **Style:** Modern, Traditional, Farmhouse, Mediterranean, Luxury Contemporary, Scandinavian, Coastal, Mountain
- **Interior preferences:** flooring, paint, cabinets, countertops, lighting, appliances, furniture

### AI generation
- Multiple floor plan options per brief
- Room layouts, traffic flow, furniture placement
- Window layout, exterior elevations, roof concepts
- Foundation concepts and site placement (within LandSphere's buildable envelope when available)

### Design Health Score
Automated checks run on every concept and every revision:
door swings · hallway widths · accessibility · furniture clearance · kitchen triangle · storage · natural lighting · privacy · HVAC space · structural spans.

Each check returns pass/warn/fail with a location on the plan; the composite is the **Design Health Score** shown with every concept.

## Primary Flow

1. User completes the interview → a `DesignBrief` is saved.
2. AI generates N concepts; each gets a Design Health Score and a CostSphere estimate.
3. User compares, favorites, and iterates ("make the kitchen bigger") — each iteration is a new `DesignRevision` with re-run checks and re-priced budget.
4. A selected concept is promoted for professional review in EngineerSphere.

## Key Data Entities

| Entity | Notes |
| --- | --- |
| `DesignBrief` | Interview answers; versioned |
| `DesignConcept` | A generated candidate (plan geometry, elevations, metadata) |
| `DesignRevision` | Immutable iteration of a concept; parent-linked |
| `DesignCheckResult` | One row per health check per revision |
| `MaterialSelection` | Interior preference bound to a surface/room |

## Guardrails

- AI output is always labeled **concept — not construction documents**; promotion to permit-ready drawings requires licensed professional approval (EngineerSphere).
- Structural span check is a screening heuristic; real spans are engineered in EngineerSphere.
- Generation respects `SiteConstraint` records as hard bounds when a parcel is attached.

## Depends on / feeds

- **Depends on:** LandSphere constraints (optional in MVP — user-entered lot dimensions suffice).
- **Feeds:** ModelSphere (geometry to render), CostSphere (quantities for takeoff), EngineerSphere (concepts for review).

## Phase mapping

**Phase 1 core.** Interview, generation, health checks, and iteration are the MVP's center of gravity.

## Open questions

- Concept representation: parametric model vs. generated raster + structured metadata (parametric strongly preferred — everything downstream needs quantities).
- How many free generations per tier (see revenue model: rendering credits / premium AI features).
