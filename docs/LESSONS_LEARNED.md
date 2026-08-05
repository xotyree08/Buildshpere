# Lessons Learned — the WHOLE Performance failure register

WHOLE Performance (the previous product) documented its failures honestly:
a launch audit, two Apple rejections, an auth flow replaced mid-review, and
several operational traps. Each lesson below names the original failure and
the **binding rule** BuildSphere follows so it never repeats. Rules marked
**(enforced now)** have code or tests behind them today; the rest bind the
phase where they become relevant.

---

## L1. Entitlements are never client-writable

**What happened:** WHOLE's row-level security let any signed-in user upsert
`{"tier":"immersive"}` from the browser console — a paid-product bypass
needing no exploit, live the moment real Stripe keys went in. The fix had to
untangle usage metering (legitimately client-written) from entitlements
(never client-written) after the fact.

**Rule:** When BuildSphere adds subscriptions/credits (rendering credits,
premium AI features): entitlement fields are written **only** by payment
webhooks via a service role. Client-visible rows may carry usage counters
only, and the schema separates the two from day one. Every paid surface
re-verifies entitlement **server-side** per request — no gate ever trusts a
client-readable row. No client code path may grant trials or tiers, even
behind a "payments off" flag (WHOLE's `startLocalTrial` became a silent
landmine).

## L2. A failed write must never look like a successful one **(enforced now)**

**What happened:** WHOLE's `write()` upserted and ignored the result. Any
RLS denial, expired JWT, or 5xx silently discarded the user's data — and the
entitlement fix made one such rejection *reachable by design*.

**Rule:** Every persistence write checks its result and surfaces failure to
the user. Enforced today in `web/lib/store.ts`: `saveProject` reports
success/degraded/failure; a full localStorage (reachable now that inspiration
photos are stored) degrades by shedding photos — loudly — before ever losing
a project silently. When the server store lands, the same contract applies to
every API write.

## L3. Ship error monitoring before shipping anything that matters **(enforced now)**

**What happened:** WHOLE took real card payments with zero runtime
visibility — no Sentry, no equivalent; a broken checkout would surface only
if a customer emailed support.

**Rule:** BuildSphere has a client error boundary that reports crashes to
`/api/v1/errors` (visible in deployment logs) from day one. Before payments
launch, graduate to a real error tracker — that upgrade is a launch gate,
not a nice-to-have.

## L4. Health endpoints name the exact fix **(enforced now)**

**What worked (copy it):** WHOLE's `/api/stripe/health` turned two blind
Apple rejections into a checkable URL — `appleKey: false` plus the exact env
var and where to set it. Configuration failures nobody can see are the most
expensive kind.

**Rule:** `/api/health` reports every integration with, when unconfigured,
the exact env var and remediation — not a bare boolean. Every future
integration (database, queue, storage, payments) gets a health entry the day
it's added.

## L5. Store rejections are usually configuration — build the checklist before the upload

**What happened:** Apple rejected WHOLE twice for guideline 2.1(b). The
second was pure store config: a Paid Apps Agreement stuck at "Pending User
Info" means Apple serves no products to *any* device, and the offering
lacked App Store products. A third blind resubmission was avoided only by
writing an ordered checklist and proving prices rendered on a real iPhone
first.

**Rule:** Before BuildSphere's first store submission (Phase 1.x mobile):
verify agreements are **Active**, products exist on both stores, and the
purchase surface renders on a physical device — in that order, before
uploading. Never resubmit after a rejection until the full checklist passes.
Reviewer sign-in must work on the normal auth path with zero special
configuration.

## L6. The bundle id is forever — pick the domain first

**What happened:** WHOLE's runbook had to warn that the bundle id derives
from the domain and can never change after the first store upload.

**Rule:** BuildSphere's mobile app gets no store upload — TestFlight
included — until the production domain is final. Recorded in
`mobile/README.md`.

## L7. Auth: boring, complete, and verified end to end

**What happened:** WHOLE launched with email-code (OTP) sign-in, which broke
and had to be replaced with email+password *during* App Review. Separately,
default auth-redirect config (wrong site URL, empty allow-list) would have
sent every password-reset link to an error page — every locked-out customer
staying locked out. Email confirmation being off let anyone register an
address they didn't own.

**Rule:** When accounts land: email+password from day one; email
confirmation ON before the first real user; redirect allow-list configured
and verified by *completing* one password reset, not by reading the config.
Auth state handling (unconfirmed, reset, expired) built and tested before
launch, not patched during review.

## L8. Never sell or list what isn't built **(enforced now)**

**What worked (copy it):** WHOLE priced unbuilt features into a tier but
had a hard rule — never sold or listed until shipped — backed by
claims-level tests that failed the build if store copy drifted from code.

**Rule:** BuildSphere's UI labels every sphere with its roadmap phase and
labels concepts "not construction documents"; `web/lib/claims.ts` holds the
canonical claim strings and `claims.test.ts` fails the build if the pages
stop using them or estimates stop carrying honest ranges. Marketing pages,
store listings, and tier tables may only claim shipped behavior.

## L9. Fail toward the customer

**What worked (copy it):** WHOLE's reads failed open deliberately — a paying
subscriber is never paywalled by a transient error — with the reasoning
written down. Its account deletion cancelled billing first and refused to
report a delete that didn't happen.

**Rule:** Transient failures degrade toward the customer, never toward
revenue: an entitlement read that errors grants access; a metering write
that errors loses the increment, not the customer's work. Destructive flows
(account deletion) do the irreversible external step first and abort
honestly on any failure.

## L10. Operational gotchas go in the runbook the day they cost time

**What happened:** Stripe's CLI webhook secret vs. Dashboard endpoint secret
(different values, same-looking var) cost an afternoon of signature
failures. `NEXT_PUBLIC_*` vars silently require a redeploy to take effect.

**Rule:** Every trap that costs more than an hour gets written into the
relevant runbook/README immediately, with the exact symptom it produces.
The `NEXT_PUBLIC_*` redeploy rule is recorded in `web/README.md` now, ahead
of need.

## L11. One product, one account, everywhere

**What worked (copy it):** WHOLE kept its own Supabase project, Stripe
account, and RevenueCat project, separate from sibling products.

**Rule:** BuildSphere gets its own accounts for every service — database,
payments, storage, AI keys — never shared with another product. Cross-.
product credential reuse is how one product's incident becomes every
product's incident.

## L12. Audit before launch, in cost order, and record what's healthy

**What worked (copy it):** WHOLE's launch audit ordered findings by cost of
leaving them, marked what only the founder could verify, and recorded what
was genuinely healthy so the audit itself could be trusted.

**Rule:** BuildSphere runs the same audit before each phase gate (first
accounts, first payments, first store submission), in the same format, and
the findings become PRs, not a document that rots.
