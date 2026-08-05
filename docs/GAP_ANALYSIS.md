# Gap Analysis — Build vs. Software Specification Package v1.0

Compares the shipped platform (27 merged PRs as of 2026-08-05) against the
BuildSphere Software Specification Package v1.0 (founder document, dated
2026-08-05). Statuses: **Built** (working + tested), **Partial** (a real
slice exists, spec asks for more), **Missing** (not started). Spec
requirement IDs (BS-*) reference the specification document.

## 1. Against the spec's MVP definition (§22.1)

| MVP item | Status | Notes |
|---|---|---|
| Account, organization, project management | Partial | Email+password auth + sessions + roles built. Missing: email verification (BS-ID-001), organizations (BS-ID-002), invitations (BS-ID-004), MFA. |
| Property setup, survey upload, confirmed constraints | Partial | Lot dimensions + user-entered setback rules (checked by site plan and permit readiness). Missing: survey upload/extraction (BS-LAND-002), parcel lookup (BS-LAND-001), constraint register (BS-LAND-004). |
| Design brief + inspiration uploads | Built | Interview + inspiration photo with AI style analysis (degrades honestly without AI key). Brief versioning/resume (BS-DES-001) not yet. |
| Three concept alternatives | Built | Three distinct variants, room list, areas, footprint, estimate range (BS-DES-002). 28-style catalog with style-true roofs/massing. |
| Editable room program, guided revisions | Partial | Conversational revisions (deterministic parser + AI interpreter, clamped ops), rollback timeline. Missing: direct wall/opening/fixture editing (BS-DES-003). |
| Interactive 2-D/3-D viewer + photoreal renders | Partial | Floor plans, isometric massing, orthographic elevations, perspective walkthrough — all materials-aware SVG. Missing: WebGL orbit viewer (BS-MOD-001), photoreal render jobs + credits (BS-MOD-002). Render-provider seam exists. |
| Material selections, curated catalog | Built | Interior + exterior catalogs with live repricing and visual updates (BS-MOD-004). |
| Model-linked estimate + budget scenarios | Partial | Deterministic takeoff → regional price book → ±15% range; VE with exact savings + one-click apply. Missing: per-line source/date/confidence (§22.3 launch gate), CSI-style cost codes (BS-COST-001), budget scenarios (BS-COST-004). |
| Document center, invitations, comments, decisions | Missing | No file storage (S3 unconfigured by design), no document versions/comments. |
| Professional directory, quote request, controlled delivery | Partial | Review request → claim → approve/request-changes with role gating and audit-style state. Missing: marketplace search (BS-PRO-001), proposals (BS-PRO-002), markup workspace (BS-PRO-003), license tracking (BS-PRO-006). |
| Subscriptions, render credits, admin, analytics | Partial | Mobile StoreKit/Play Billing with server receipt validation + entitlements (ahead of spec need). Missing: web subscriptions (Stripe-class, §20.1 tiers), render credits, admin console, analytics. |

## 2. Systems not started (spec Phases 2–5)

- **LandSphere**: parcel lookup, survey extraction, buildable envelope from
  easements/overlays, constraint register, buildability score.
- **Marketplace**: professional search/match, proposals, engagements,
  license/insurance verification, payouts.
- **Markup workspace**: synchronized drawing/model review, issues pinned to
  versions (BS-PRO-003/004), seal/signature boundary (BS-PRO-005).
- **PermitSphere beyond readiness**: jurisdiction profiles (BS-PERM-001),
  package assembly, correction intake/classification, resubmission rounds,
  inspection tracking.
- **Bid & procurement**: scope packages, invitations, normalization,
  award records, supplier quotes (BS-BID-*).
- **Construction (BuildSphere Pro)**: schedule, daily logs, RFIs,
  submittals, change orders, draws, punch/closeout (BS-CON-*).
- **HomeTwin**: as-built record, asset registry, maintenance plans,
  ownership transfer (BS-TWIN-*).
- **Messaging & notifications** (§14), **analytics/reporting** (§16),
  **admin console** (§5).

## 3. Cross-cutting platform gaps

| Area | Spec asks | Today |
|---|---|---|
| CI/CD (§17/§18) | Tests, scans, migration validation in CI | GitHub Actions runs web (typecheck, tests, build) and Flutter (analyze, test) suites on every PR and on main — added with this document. Missing: security scans, staging, canary. |
| Status model (App. A) | Draft→…→As-Built on every artifact | Disclaimers + review status only; no per-artifact status field, no design freeze (BS-DES-006). |
| Audit events (§11.3) | Append-only audit records | Client error intake only. |
| API standards (§10.1) | OAuth, idempotency keys, rate limits, OpenAPI | Cookie sessions, versioned paths (/api/v1), consistent error envelopes with exact fixes. |
| Storage/files (§9.3) | Object storage, hashes, scanning, signed URLs | None (no file features yet). |
| Search/vector/events/warehouse (§9.1) | Dedicated stores | PostgreSQL only (appropriate at current scale). |
| Accessibility (NFR-007) | WCAG 2.2 AA | Not audited. |
| Security testing (§11.1) | SAST/DAST/pen test | Not performed. |

## 4. Where the build exceeds the spec's MVP

Project export/import with versioned validation; shareable read-only links
(hashed capability tokens, rotation, revocation); revision rollback
timeline; custom jurisdiction setbacks; lessons-register (L1–L12)
enforcement with claims-drift tests; deploy-ready standalone bundle +
Dockerfile; store receipt validation with product-match enforcement.

## 5. Recommended sequence

1. ~~CI pipeline~~ — ships with this document.
2. Appendix A status model + design freeze (BS-DES-006) — the legal backbone.
3. Estimate line provenance: source, date, confidence (§22.3 launch gate).
4. Append-only audit events (§11.3).
5. Email verification + project invitations (BS-ID-001/004).
6. Budget scenarios (BS-COST-004) and concept comparison (BS-DES-005).
7. Document center — needs an object-storage decision (S3/R2 account).
8. WebGL 3-D viewer spike (Three.js + glTF export from the parametric model).
9. Web subscriptions (Stripe) for the §20.1 tiers.

Items 7–9 need founder decisions (storage account, render/3-D budget,
payment processor); 2–6 are buildable now.
