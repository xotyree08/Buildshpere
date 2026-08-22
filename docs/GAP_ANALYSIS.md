# Gap Analysis — Build vs. Software Specification Package v1.0

Compares the shipped platform (**110 merged PRs as of 2026-08-22**, 477 tests
across 63 files) against the BuildSphere Software Specification Package v1.0.
Statuses: **Built** (working + tested), **Partial** (a real slice exists, spec
asks for more), **Missing** (not started).

> Refreshed 2026-08-22, twice. The second pass follows PRs #112–#117, which
> closed every item the first pass listed as buildable — organizations, MFA,
> the markup workspace, the marketplace and jurisdiction profiles — plus the
> migration ledger those five needed underneath them. Kept current in the same
> commit as the work, because the whole reason for the first refresh was that
> nobody had.
>
> The previous revision was written at 27 merged PRs and
> had gone badly stale — it listed the WebGL viewer, photoreal renders, render
> credits, the status model, audit events, email verification, budget
> scenarios, estimate provenance, Stripe, the admin console, analytics,
> notifications, the professional directory, bid packages, the construction
> schedule and tracker, maintenance plans, permit readiness and IFC export as
> Missing. All nineteen have since shipped. A stale map is worse than no map:
> it sends people to build what already exists.

## 1. Against the spec's MVP definition (§22.1)

| MVP item | Status | Notes |
|---|---|---|
| Account, organization, project management | Built | Email+password auth, sessions, roles, email verification, password reset, login throttling, data export, account deletion, organizations with three roles (#113), and TOTP two-factor with single-use recovery codes (#114). |
| Property setup, survey upload, confirmed constraints | Partial | Lot dimensions, user-entered setback rules driving site plan and permit readiness, constraint register with severity and resolution. **Missing: survey upload/extraction (BS-LAND-002), parcel lookup (BS-LAND-001).** |
| Design brief + inspiration uploads | Built | Interview + inspiration photo with AI style analysis; degrades honestly without an AI key. |
| Three concept alternatives | Built | Three variants, 28-style catalog with style-true roofs and massing, normalized comparison. |
| Editable room program, guided revisions | Built | Conversational revisions (deterministic parser + AI interpreter, clamped ops), rollback timeline, and direct drag editing of rooms, walls, doors and windows (BS-DES-003). |
| Interactive 2-D/3-D viewer + photoreal renders | Built | Floor plans, isometric massing, orthographic elevations, electrical and plumbing coordination sheets, site plan, WebGL orbit viewer with PBR materials, first-person walkthrough. Photoreal stills, 360° panoramas and rendered walkthroughs ship behind the render-provider seam — **unconfigured until `REPLICATE_API_TOKEN` is set** (see §3). |
| Material selections, curated catalog | Built | Interior and exterior catalogs, live repricing, visual updates across every renderer. |
| Model-linked estimate + budget scenarios | Built | Deterministic takeoff → regional price book → ±15% range, per-line source/date/confidence, VE with exact savings and one-click apply, budget scenarios. |
| Document center, invitations, comments, decisions | **Missing** | No object storage. Blocked on a storage account — see §4. |
| Professional directory, quote request, controlled delivery | Partial | Directed invites, credential profiles, review request → claim → approve/request-changes with role gating and audit trail, opt-in marketplace with sealed proposals (#116), markup workspace with version-pinned issues and an explicit seal boundary (#115). **Missing: licence verification against a board (BS-PRO-006) — credentials remain self-reported, and every listing says so.** |
| Subscriptions, render credits, admin, analytics | Built | Per-project licenses (Concept/Design/Complete/Build+), Stripe seam for web, StoreKit + Play Billing with server receipt validation, render credit metering with refund-on-failure, admin console, cookieless usage metrics, client error intake. |

## 2. Systems since started

Each of these was "not started" at the last revision and now has a tested
engine. None is complete against the full spec, but each produces real output.

| Sphere | Engine | Produces |
|---|---|---|
| Bid & procurement | `bids.ts` | Trade-scoped contractor bid packages, PDF |
| Construction | `schedule.ts`, `buildtrack.ts` | Construction + draw schedule, change orders and paid draws vs contract |
| HomeTwin | `maintenance.ts` | Materials-driven maintenance plan, warranties, equipment registry, punch list |
| PermitSphere | `permit.ts` | Readiness checklist from drawings, site, checks and review |
| Energy | `energy.ts` | Envelope + materials efficiency report with payback |
| Interchange | `lib/export/ifc/` | IFC4 STEP export with structural round-trip testing |

Still not started: **marketplace engagements and payouts** (search, proposals
and awards ship in #116; taking money between the parties does not),
**PermitSphere correction intake and inspections** (jurisdiction profiles and
package assembly ship in #117), **LandSphere** (parcel lookup, survey
extraction, buildability score — blocked, see §4).

## 3. Cross-cutting platform status

| Area | Spec asks | Today |
|---|---|---|
| CI/CD (§17/§18) | Tests, scans, migration validation | GitHub Actions runs web (typecheck, tests, build), Flutter (analyze, test) and Playwright e2e on every PR and on main. Missing: security scans, staging, canary. |
| Status model (App. A) | Draft→…→As-Built on every artifact | Built — status ladder on concepts, immutable design-freeze milestones. |
| Audit events (§11.3) | Append-only audit records | Built — auth, projects, shares, reviews, purchases. |
| Layer order (§157) | Hierarchy not reversed | Built and **enforced as an import constraint** (`layering.test.ts`), after costing was found re-packing geometry. |
| Identity (§3.4) | Persistent identifiers | Built — stable room/wall/opening keys (`ids.ts`) surviving revision. |
| Walls as objects (§12/§13/§28) | Assemblies and topology | Built — wall graph with layered assemblies priced per face. |
| API standards (§10.1) | OAuth, idempotency keys, rate limits, OpenAPI | Cookie sessions, versioned paths, rate limits, consistent error envelopes with exact fixes. Missing: OAuth, idempotency keys, OpenAPI. |
| Storage/files (§9.3) | Object storage, hashes, scanning, signed URLs | None. Blocked — see §4. |
| Units (§3.5) | Millimetres internally | **Not done.** Feet throughout. Deferred deliberately: branding `rect` produces ~205 compile errors and ~1,000 bare decimals with no type to catch them, and the shipped Flutter client reads `rect` with no version check, so a partial migration renders a house 305× oversized on phones. Needs a mobile release with a version gate first. |
| Command/event bus (§92/§93) | Command bus, event bus | Not done. |
| Dependency graph (§36/§37) | Change propagation | Not done — revisions re-derive rather than propagate. |
| Rule packages (§30/§31) | Data-driven rules | Partial — setback rules are data; code rules are in TypeScript. |
| Accessibility (NFR-007) | WCAG 2.2 AA | Not audited. |
| Security testing (§11.1) | SAST/DAST/pen test | Not performed. |

## 4. Blocked on a decision or an account

Nothing in this section can be built without something only the founder can
supply. Each names exactly what is needed.

1. **Photoreal rendering** — the pipeline, the UI, the credit metering and the
   prompts are built and tested. It has never run, because it has never had a
   token. Set `REPLICATE_API_TOKEN` (replicate.com → Account → API tokens) in
   the deployment env and redeploy. `GET /api/health` reports whether it has
   landed.
2. **Document center** — needs an object-storage account (S3 or R2) and
   `S3_BUCKET` plus credentials. Everything downstream (versions, comments,
   decisions, survey upload) waits on this one choice.
3. **LandSphere parcel lookup** — needs a parcel/GIS data source, which is
   per-jurisdiction and usually paid. Survey *extraction* additionally needs
   the storage above.
4. **Millimetres (§3.5)** — needs a mobile release carrying a schema version
   gate before the web side can migrate, or the two clients disagree about
   the size of the house by a factor of 305.

## 5. Buildable now

**Nothing.** Every item this section listed has shipped:

| Item | PR |
|---|---|
| Migration ledger (prerequisite for the rest) | #112 |
| Organizations/teams (BS-ID-002) | #113 |
| MFA | #114 |
| Markup workspace (BS-PRO-003/004/005) | #115 |
| Marketplace search + proposals (BS-PRO-001/002) | #116 |
| Jurisdiction profiles (BS-PERM-001) | #117 |

What remains is in §4 — four items, each waiting on a decision or an account
that only the founder can supply. That is the honest state: not "more work to
do", but "four answers needed before more work is possible".

The next tier of product work, once those unblock, is marketplace engagements
and payouts, permit correction intake and inspection tracking, and the
cross-cutting platform gaps in §3 that nobody has scheduled — OAuth,
idempotency keys, OpenAPI, an accessibility audit, and security testing.

## 6. Where the build exceeds the spec

Project export/import with versioned validation; shareable read-only links
(hashed capability tokens, rotation, revocation); revision rollback timeline;
custom jurisdiction setbacks; the lessons register (L1–L12) enforced by
claims-drift tests; the §157 layer order enforced as an import constraint;
IFC4 export with round-trip testing; deterministic design-health scoring frozen
against eight literal fixture plans; deploy-ready standalone bundle and
Dockerfile; store receipt validation with product-match enforcement.
