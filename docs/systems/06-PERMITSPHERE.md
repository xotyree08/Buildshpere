# PermitSphere — Permit Preparation

**Purpose:** Turn an approved drawing set into a jurisdiction-ready submission package, then track corrections and inspections until the project is cleared to build.

**Primary users:** Homeowners (status), architects/engineers (corrections), contractors (inspection scheduling), permitting agencies (recipients).

## Core Capabilities

### Preparation
- Municipal code database and jurisdiction rules engine
- Code analysis: automated screening of the approved set against local requirements
- Permit checklist generated per jurisdiction and project type
- Submission package assembly (forms, drawings, calcs, site data from LandSphere)

### Tracking
- Permit dashboard: application status per permit type
- Correction tracking: agency comments → assigned professionals → resolved revisions
- Inspection scheduling and inspection timeline

### Outputs
- **Permit Package** (submission-ready)
- **Correction Reports**
- **Inspection Timeline**

## Primary Flow

1. Approved-for-permitting set arrives from EngineerSphere; jurisdiction identified via LandSphere parcel data.
2. Rules engine produces the checklist; code analysis flags gaps before submission.
3. Package is assembled and submitted (electronically where permit integrations exist; download-and-file elsewhere).
4. Agency corrections come back → tracked, assigned, resolved via EngineerSphere revision flow, resubmitted.
5. Permit issued → inspection schedule seeds BuildSphere Pro's construction timeline.

## Key Data Entities

| Entity | Notes |
| --- | --- |
| `Jurisdiction` | Agency contacts, rule set version, submission channels |
| `PermitApplication` | Type, status, submitted set version |
| `ChecklistItem` | Requirement, evidence, status |
| `Correction` | Agency comment, assignee, resolving revision |
| `Inspection` | Type, scheduled date, result, reinspection linkage |

## Reality constraints

- Jurisdiction coverage is inherently incremental: launch metros first, generic checklist + manual filing as the universal fallback.
- Code analysis is assistive, never authoritative — the agency's review is the source of truth; "Permit approval cycle time" is the KPI to optimize.

## Depends on / feeds

- **Depends on:** EngineerSphere approvals, LandSphere jurisdiction data, building code reference services, permit integrations (where available).
- **Feeds:** BuildSphere Pro (start-of-construction gate, inspection schedule), HomeTwin (permits and inspection records).

## Phase mapping

**Phase 3**, alongside municipal integration and inspection tracking.

## Open questions

- Code content licensing (ICC and state amendments) vs. building-code reference API partners.
- Priority list of launch jurisdictions.
