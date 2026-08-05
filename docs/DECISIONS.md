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
