# Architecture Decision Record

Short-form ADRs. Newest last. Statuses: **accepted** · proposed · superseded.

## ADR-001: Monorepo with `web/` and `mobile/` — accepted

One repo for docs, web, and mobile keeps the spec and the code that implements it in one review stream at this stage. Split later only if CI or team boundaries force it.

## ADR-002: Web is Next.js (App Router, TypeScript) — accepted

The overview names React for web. Next.js gives us React plus routing, server components, and API routes in one deployable — and Vercel-style preview deployments for every PR.

## ADR-003: Backend starts as Node inside Next.js API routes — accepted

The overview allows .NET Core **or** Node.js. MVP backend logic (interview, generation orchestration, checks, takeoff, estimates) starts as TypeScript in Next.js API routes sharing types with the UI. Long-running work (generation, rendering) goes to a queue + worker from day one; the worker is the natural first thing to extract into a standalone service when scale demands it. Revisit .NET only if a team constraint appears.

## ADR-004: PostgreSQL as system of record, Redis for queue/cache — accepted

Straight from the overview. The parametric design model lives in `jsonb` for MVP (ADR-006), so Postgres alone covers relational + document needs initially. Redis backs the job queue and hot caches.

## ADR-005: Mobile is Flutter, shipped after web MVP — accepted

The overview names Flutter. Web proves the design loop first (fastest iteration); `mobile/` carries the app shell and domain models from day one so mobile work starts warm, targeting Phase 1.x for the homeowner app (3D viewer, walkthrough, budget).

## ADR-006: Parametric design model as versioned JSON — accepted

Concepts/revisions store a parametric model (levels, rooms, walls, openings) as versioned JSON, not raster images and not full BIM. Rationale: everything downstream (health checks, takeoff, rendering) needs quantities, and full IFC/BIM is Phase-2 weight. The JSON schema is the contract; BIM export becomes a projection of it later.

## ADR-007: AI proposes, deterministic engines validate and price — accepted

LLMs handle conversation and concept generation. Design health checks, takeoffs, and estimates are deterministic TypeScript — reproducible, testable, and never overridden by model output. Model unavailability degrades generation, never correctness of scores or prices.

## ADR-008: Async jobs with 202 + polling — accepted

Generation, revision, and rendering are queue-backed jobs surfaced through a uniform `/jobs/:id` API. No synchronous long requests; the UI is built around progressive results from the start.

## ADR-009: Client-side persistence until a database lands — accepted

The design loop ships with projects persisted in localStorage, shaped exactly
like the Postgres schema in docs/MVP_PHASE1.md. The engines are pure and the
API routes stateless, so introducing `DATABASE_URL` + a server store swaps the
persistence layer without touching engine or UI logic. Accounts arrive with
that swap; until then the app is single-device and honest about it.

## ADR-010: Inspiration photos — vision model proposes, catalogs clamp — accepted

Customers can upload a photo of a home they love. A vision-capable Claude model
(via the official Anthropic SDK, structured JSON output) proposes architectural
attributes: best-match style from our 28-style catalog, stories, visible
exterior features, confidence. Deterministic validation clamps every field to
our domain before anything downstream sees it — an unknown style becomes null,
never a new style. The analysis seeds the design brief (style pre-selected,
editable); geometry, checks, and pricing remain exclusively deterministic
(ADR-007). Without an API key the feature degrades gracefully: the photo is
kept as project inspiration and the customer picks a style manually.

## ADR-011: The WHOLE failure register binds this codebase — accepted

docs/LESSONS_LEARNED.md distills the previous product's documented failures
(client-writable entitlements, silent write failures, zero error monitoring,
blind store rejections, mid-review auth replacement) into twelve rules.
Rules with a present-tense surface are enforced in code today: surfaced save
failures with quota degradation (store.ts), a crash-reporting error boundary,
a health endpoint that names the exact fix per integration, and claims-drift
tests. Phase-gated rules (server-only entitlements, auth checklist, store
submission checklist, pre-launch audits) bind the phases that introduce them.
New code that contradicts a rule needs this ADR amended first.

## ADR-012: Server store & auth — scrypt, hashed session tokens, jsonb payload parity — accepted

Accounts and the server store activate when DATABASE_URL is set; without it
every route degrades to 503 with the exact fix and the app keeps its
localStorage behavior (ADR-009). Choices, per the lessons register:
email+password only (L7 — no OTP flows), scrypt with per-user salt via node
crypto (no dependency), session cookies backed by SHA-256-hashed random
tokens so a leaked database yields no usable cookie, ownership enforced in
every SQL WHERE (L1 discipline ahead of entitlements), and writes that
report failure (L2). Projects persist as a jsonb payload mirroring the
client's StoredProject shape — the mechanical swap ADR-009 promised; the
full relational breakdown arrives with Phase 2 professional workflows.
Email confirmation requires an email provider and is a deploy-time gate
(L7) tracked in LESSONS_LEARNED — the schema carries email_confirmed_at
from day one. Verified against an in-memory Postgres engine (pg-mem) in CI;
first deploy against a real host re-runs the same suite via DATABASE_URL.

## ADR-013: Canonical domain and application identifiers — accepted

The production domain is **onbuildsphere.com** (founder decision,
2026-08-05). Everything that derives from the domain is now locked:

- Web canonical URL and metadata base: `https://onbuildsphere.com`.
- Mobile application id / bundle id: **`com.onbuildsphere.app`** for both
  stores. Per LESSONS_LEARNED.md L6 this can never change after the first
  store upload — platform folders must be generated with
  `--org com.onbuildsphere`, and the L6 "no upload until the domain is
  final" gate is now SATISFIED.
- Server payment env: `ANDROID_PACKAGE_NAME=com.onbuildsphere.app`.
- Mobile builds point at the deployment with
  `--dart-define=BUILDSPHERE_API=https://onbuildsphere.com`.

No code hardcodes the domain for request handling (share links use the
request origin; the API base is injected at build time), so staging
deployments keep working unchanged.
