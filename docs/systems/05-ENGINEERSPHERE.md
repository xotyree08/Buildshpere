# EngineerSphere — Professional Collaboration

**Purpose:** Put licensed professionals in the loop with real authority: AI produces concepts, professionals review, mark up, revise, and formally approve everything that requires professional judgment.

**Primary users:** Architects, structural engineers, civil engineers, MEP (mechanical/electrical/plumbing) engineers. Homeowners see status and outcomes, not markup internals.

## Core Capabilities

### Review
- AI Review: automated pre-check that annotates likely problem areas before a human opens the file
- Markup tools and drawing overlay (compare revisions visually)
- Clash detection across disciplines (structural vs. MEP vs. architectural)
- CAD viewer and BIM viewer (from the Professional Portal)

### Workflow
- Revision requests with structured comments
- Digital approval workflow with **digital signatures**
- Version history — every drawing set immutable and diffable
- Project responsibility tracking: exactly which licensed professional is responsible for which scope
- Audit logs on every action

### Collaboration
- Professional messaging, task assignment, status tracking
- Document uploads (calcs, reports, stamped sheets)

## Primary Flow

1. A selected `DesignConcept` is promoted to review; responsible professionals are assigned per discipline (from the Marketplace or invited).
2. AI Review annotates; professionals mark up and file revision requests.
3. DesignSphere (or the professional directly) produces a new revision; overlay diffing shows what changed.
4. When a discipline is satisfied, its professional signs digitally. All required disciplines signed → the set is **Approved for Permitting** and handed to PermitSphere.

## Key Data Entities

| Entity | Notes |
| --- | --- |
| `ReviewCycle` | One per discipline per drawing set |
| `Markup` | Geometry-anchored annotation |
| `RevisionRequest` | Structured change ask; links markup → resulting revision |
| `Approval` | Digital signature, professional license reference, scope, timestamp |
| `ResponsibilityAssignment` | Professional ↔ discipline ↔ project |
| `AuditEvent` | Append-only log |

## Trust & compliance

- License verification (Admin Portal) is a prerequisite for holding a `ResponsibilityAssignment`.
- Approvals are non-repudiable: signed hash of the exact drawing-set version.
- Nothing AI-generated becomes a construction document without a licensed signature — this is the platform's core professional-responsibility boundary (see Mission).

## Depends on / feeds

- **Depends on:** DesignSphere revisions, Admin license verification, Marketplace matching.
- **Feeds:** PermitSphere (approved sets), BuildSphere Pro (issued-for-construction documents), HomeTwin (final plans).

## Phase mapping

**Phase 2.** MVP ships without it; the Phase 1 → 2 seam is the "promote concept to professional review" action, which exists in Phase 1 as a stub CTA.

## Open questions

- E-signature regulatory requirements per state for stamped drawings.
- Whether markup tooling is built or embedded (e.g., existing CAD/BIM viewer SDKs).
