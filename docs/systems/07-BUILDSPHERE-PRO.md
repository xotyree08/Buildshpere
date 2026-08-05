# BuildSphere Pro — Construction Management

**Purpose:** Run the build itself: schedule, money, people, and paperwork in one place, with the homeowner seeing honest progress and the contractor running their job efficiently.

**Primary users:** General contractors, specialty contractors, builders. Homeowners consume progress, approve change orders, and see draws. Lenders consume draw requests.

## Core Capabilities

### Field operations
- Scheduling (task-level, dependency-aware)
- Daily reports / daily logs
- Project photos and drone uploads
- Progress tracking against the schedule (with computer-vision photo-to-plan comparison assisting verification)
- Punch lists

### Money
- Budget tracking against the CostSphere baseline
- Change orders (scope, cost, schedule impact; homeowner approval workflow)
- Purchase orders and invoices
- **Construction draw management**: draw requests packaged with progress evidence for lender release

### Coordination
- Subcontractor coordination and bid management (Contractor Portal)
- Material requests
- RFIs (request for information → answered from the drawing set of record)
- Warranty tracking and warranty documentation
- Completion tracking

## Primary Flow

1. Permit issued (PermitSphere) → baseline schedule and budget instantiate from the approved set and estimate.
2. Contractor runs dailies: logs, photos, material requests; progress % updates from schedule + photo evidence.
3. Scope changes → change order → homeowner approval → budget and schedule re-baseline.
4. Milestones → draw request with evidence package → lender approval → funds released.
5. Substantial completion → punch list → warranty documentation → handoff to HomeTwin.

## Key Data Entities

| Entity | Notes |
| --- | --- |
| `ScheduleTask` | Dependencies, trade, planned/actual dates |
| `DailyLog` | Weather, crew, work performed, photos |
| `ChangeOrder` | Cost/schedule delta, approval state |
| `DrawRequest` | Milestone, evidence, lender status |
| `RFI` | Question, drawing reference, answer, impact |
| `PunchItem` | Location, trade, status, photo |
| `WarrantyItem` | Component, term, claim history |

## Depends on / feeds

- **Depends on:** PermitSphere (start gate, inspections), CostSphere (budget baseline), EngineerSphere (documents of record), lender integrations.
- **Feeds:** HomeTwin (as-builts, inspection reports, warranties, serials), CostSphere (actuals for estimate-accuracy KPI).

## Phase mapping

**Phase 4:** construction management, scheduling, draw requests, contractor collaboration.

## Open questions

- Draw evidence standards per lender; whether photo-verification confidence is surfaced to lenders.
- Offline-first requirements for job sites with poor connectivity.
