import Link from "next/link";
import type { Metadata } from "next";

import { BrandMark } from "@/components/BrandMark";
import { ADDONS, BUILDER_PACKS, formatCents, TIERS } from "@/lib/catalog/licenses";

export const metadata: Metadata = {
  title: "Pricing — BuildSphere",
  description:
    "One price. One home. No monthly subscription required. Each home project is licensed once — from first concept to build preparation.",
};

/**
 * The pricing page (handoff §37): four one-time project licenses, add-on
 * usage packs, builder packs. No subscription exists to upsell — the page's
 * job is to make "one home = one license" unmistakable, and to keep the
 * legal line between AI-generated work and licensed professionals visible.
 */

export default function PricingPage() {
  return (
    <div className="folio">
      <main>
        <div className="wordmark">
          <strong style={{ display: "inline-flex", alignItems: "center", gap: "0.7rem" }}>
            <BrandMark size={26} /> BUILDSPHERE
          </strong>
          <Link href="/">Home</Link>
        </div>

        <section className="folio-hero" style={{ paddingBottom: "1rem" }}>
          <p className="eyebrow">Pricing</p>
          <h1 className="display">One price. One home.</h1>
          <p style={{ color: "var(--muted)", maxWidth: 640, lineHeight: 1.65 }}>
            No monthly subscription required. Your BuildSphere account is free — explore, design,
            and revise without a card. When a project is ready to go further, license that home
            once and it carries its own renders, revision rounds, and deliverables from first
            concept to build preparation.
          </p>
        </section>

        <hr className="hairline" />

        <section
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            margin: "1.5rem 0",
          }}
        >
          {TIERS.map((t) => (
            <div
              key={t.key}
              className="card"
              style={{
                border: t.mostPopular ? "1.5px solid var(--brass, #9a7b3f)" : undefined,
                position: "relative",
              }}
            >
              {t.mostPopular && (
                <p
                  style={{
                    position: "absolute",
                    top: "-0.7rem",
                    left: "1rem",
                    margin: 0,
                    background: "var(--brass, #9a7b3f)",
                    color: "#fff",
                    fontSize: "0.7rem",
                    letterSpacing: "0.08em",
                    padding: "0.15rem 0.6rem",
                    borderRadius: 4,
                  }}
                >
                  MOST POPULAR
                </p>
              )}
              <h2 style={{ margin: "0 0 0.1rem", fontSize: "1.05rem" }}>{t.label}</h2>
              <p style={{ margin: "0 0 0.5rem", color: "var(--muted)", fontSize: "0.85rem" }}>{t.tagline}</p>
              <p style={{ margin: "0 0 0.75rem", fontSize: "1.6rem" }}>
                {formatCents(t.priceCents)}{" "}
                <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>per project, one-time</span>
              </p>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.85rem", lineHeight: 1.55 }}>
                {t.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <p style={{ color: "var(--muted)", fontSize: "0.9rem", maxWidth: 720 }}>
          A project means one primary residential structure on one property. Minor changes —
          finishes, fixtures, paint, furniture — stay flexible and free within your project. Major
          revisions (moving a staircase, adding a bedroom or a floor, changing the footprint) use
          the revision rounds included with your tier. Licensing is started from your project&apos;s
          page inside <Link href="/app">the app</Link>.
        </p>

        <hr className="hairline" />

        <section style={{ maxWidth: 760 }}>
          <h2>Add-ons, when you want more</h2>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            Every tier includes real allowances — most projects never need a top-up. When you do,
            packs attach to your licensed project from its page:
          </p>
          <ul style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>
            {ADDONS.map((a) => (
              <li key={a.key}>
                {a.label} — {formatCents(a.priceCents)}
              </li>
            ))}
          </ul>
        </section>

        <section style={{ maxWidth: 760 }}>
          <h2>For builders</h2>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
            Building for clients? Project packs price per home, not per seat:{" "}
            {BUILDER_PACKS.map((p, i) => (
              <span key={p.projects}>
                {i > 0 && " · "}
                {p.projects} projects {formatCents(p.priceCents)}
              </span>
            ))}
            . For 50+ projects or production programs, write to{" "}
            <a href="mailto:support@onbuildsphere.com">support@onbuildsphere.com</a>.
          </p>
        </section>

        <section style={{ maxWidth: 760 }}>
          <h2>What licensing never includes</h2>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
            BuildSphere generates preliminary design and planning work. Licensed professional
            services — architects, engineers, surveyors, contractors — are always scoped and
            quoted separately, and final construction documents, seals, permits, and inspections
            follow your jurisdiction&apos;s requirements. BuildSphere helps you arrive at those
            professionals with a developed project, not just an idea.
          </p>
        </section>

        <div className="band" style={{ marginTop: "2rem" }}>
          <h2 className="display">Start free. License when ready.</h2>
          <Link className="btn" href="/app">
            Begin your design
          </Link>
        </div>

        <footer>
          <span>
            BUILDSPHERE — onbuildsphere.com · <Link href="/faq">FAQ</Link> ·{" "}
            <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
          </span>
          <span>Every price is shown again on the secure checkout page before anything is charged.</span>
        </footer>
      </main>
    </div>
  );
}
