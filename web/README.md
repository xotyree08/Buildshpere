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

Environment (all optional until the corresponding feature lands): `DATABASE_URL`, `REDIS_URL`, `AI_API_KEY` (or `ANTHROPIC_API_KEY` — enables inspiration-photo analysis, AI revision interpretation, and the interior stylist), `RESEND_API_KEY` + `EMAIL_FROM` (password-reset email), `APPLE_SHARED_SECRET` / `GOOGLE_SERVICE_ACCOUNT_JSON` + `ANDROID_PACKAGE_NAME` (store receipt validation), `S3_BUCKET`.

> **`NEXT_PUBLIC_*` vars are inlined at build time** — changing one in the
> deployment requires a redeploy to take effect
> ([LESSONS_LEARNED.md](../docs/LESSONS_LEARNED.md) L10). `/api/health`
> reports every integration with the exact fix when unconfigured.

### Deploying

Two equally supported paths — pick whichever host you already have:

The production domain is **onbuildsphere.com** (ADR-013). After deploying
by either path, add the custom domain in the host's dashboard and point
the domain's DNS at it (for Vercel: an A record to `76.76.21.21` or a
CNAME to `cname.vercel-dns.com` — the dashboard shows the exact records).

**Vercel (fastest):** import the repo, set the root directory to `web/`,
add the env vars below, deploy. Vercel builds and runs Next natively
(it ignores the standalone setting).

**Any Node host or container platform (Fly, Railway, Render, a VPS):**
the build produces a self-contained bundle (`output: "standalone"`), and
`web/Dockerfile` packages it (multi-stage, non-root). Without Docker, the
same bundle runs directly on any machine with Node:

```bash
npm run build
node .next/standalone/server.js   # PORT=3000 by default
```

Set in the deployment environment: `DATABASE_URL` (enables accounts,
sync, professional reviews, and share links — see below), `AI_API_KEY`
(enables inspiration-photo analysis, AI revision interpretation, and the
interior stylist), `RESEND_API_KEY` + `EMAIL_FROM` (password-reset
email), and `PROFESSIONAL_ACCESS_CODE` (enables professional role
upgrades). All are optional; every feature degrades honestly without its
var, and `/api/health` names the exact fix for anything unconfigured.
**Adding or changing any env var requires a redeploy to take effect.**

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
