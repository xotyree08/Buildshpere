# BuildSphere Web

Next.js (App Router, TypeScript) — the Phase 1 MVP surface and, per [ADR-003](../docs/DECISIONS.md), the initial home of the Node backend as API routes.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck
```

- `lib/types.ts` — MVP domain model (contract lives in [docs/MVP_PHASE1.md](../docs/MVP_PHASE1.md))
- `lib/spheres.ts` — the eight systems, used by the landing page
- `app/api/health` — liveness + config-presence endpoint (no secrets)

Environment (all optional until the corresponding feature lands): `DATABASE_URL`, `REDIS_URL`, `AI_API_KEY` (or `ANTHROPIC_API_KEY` — enables inspiration-photo analysis), `S3_BUCKET`.

> **`NEXT_PUBLIC_*` vars are inlined at build time** — changing one in the
> deployment requires a redeploy to take effect
> ([LESSONS_LEARNED.md](../docs/LESSONS_LEARNED.md) L10). `/api/health`
> reports every integration with the exact fix when unconfigured.

### Enabling accounts & sync (production database)

The auth + sync stack is verified against PostgreSQL 16; any plain Postgres
works. **Recommended host: [Neon](https://neon.tech)** — serverless Postgres
with a free tier, nothing beyond plain Postgres needed (we ship our own auth),
and it's what Vercel Postgres uses under the hood. Per
[LESSONS_LEARNED.md](../docs/LESSONS_LEARNED.md) L11, create it under a
**BuildSphere-only** account.

1. Create a Neon project named `buildsphere` → copy the connection string.
2. Set `DATABASE_URL` in the deployment env and redeploy.
3. Verify: `/api/health` shows `database: ok`, then create an account at
   `/app/account` and complete one sign-out/sign-in (L7: verify auth by
   using it, not by reading config).

The schema applies itself on first connection. Until then the app runs
localStorage-only and `/app/account` says so honestly.
