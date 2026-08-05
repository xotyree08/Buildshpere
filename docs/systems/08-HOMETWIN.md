# HomeTwin — Permanent Digital Twin

**Purpose:** The home's permanent memory. Everything decided, installed, inspected, and warranted during the build stays queryable for decades — and transfers to the next owner.

**Primary users:** Homeowners (current and future), service contractors, insurers, and (Phase 5) renovation planning.

## Core Capabilities

### Record of the build
- Final plans (as-builts from BuildSphere Pro)
- Inspection reports and permits
- Stud locations, plumbing, electrical, and HVAC routing (from the BIM model)
- Paint colors, flooring, cabinets, and all `MaterialSelection` records

### Record of what's installed
- Appliances with serial numbers
- Warranty information per component
- Insurance documents

### Living record
- Maintenance schedule (generated from installed components; e.g., HVAC filter cadence)
- Renovation history — future work appends, never overwrites
- **Ownership transfer:** future homeowners inherit the HomeTwin with the property

## Primary Flow

1. At substantial completion, BuildSphere Pro's closeout package activates the HomeTwin ("HomeTwin activation rate" is a platform KPI).
2. Maintenance schedule generates; reminders flow through notification preferences.
3. Owner queries the twin ("what's behind this wall?", "what paint is the kitchen?") — answered from the BIM model and selections.
4. On sale, the owner transfers the twin; the new owner gets full history, documents, and schedules — the **Resale Package** (Phase 5).

## Key Data Entities

| Entity | Notes |
| --- | --- |
| `HomeTwin` | One per completed home; links to the final BIM model |
| `InstalledComponent` | Appliance/system, serial, location, warranty ref |
| `MaintenanceTask` | Recurring, component-linked |
| `TwinDocument` | Plans, permits, inspections, insurance |
| `TwinTransfer` | Ownership handoff record |
| `RenovationRecord` | Post-build changes, append-only |

## Phase 5 extensions

Predictive maintenance · insurance integration · resale package · AI renovation planning (renovations start from the twin's real geometry instead of guesswork).

## Trust model

- The twin is owner-controlled: sharing with service contractors, insurers, or buyers is explicit and scoped.
- Data outlives BuildSphere subscriptions — export is always available (this is a trust commitment, not a feature).

## Depends on / feeds

- **Depends on:** BuildSphere Pro closeout, EngineerSphere final documents, the BIM model.
- **Feeds:** Phase 5 renovation planning (a renovation is a new DesignSphere project seeded from the twin), insurance partners.

## Open questions

- Long-term storage economics and format durability (IFC for geometry, PDF/A for documents).
- Transfer mechanics when a home sells outside the platform.
