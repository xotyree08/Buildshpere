import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";
import { ElevationView } from "@/components/ElevationView";
import { FloorPlan } from "@/components/FloorPlan";
import { SitePlanView } from "@/components/SitePlanView";
import { ESTIMATE_RANGE_CLAIM } from "@/lib/claims";
import { generateConcepts } from "@/lib/engine/generate";
import { buildableDepthFt, buildableWidthFt } from "@/lib/engine/site";
import { SPHERES } from "@/lib/spheres";
import type { DesignBrief } from "@/lib/types";

/**
 * The public face. Luxury is restraint: ink on ivory, editorial serif,
 * and the platform's OWN architectural drawings framed as the hero art —
 * no stock photography, no invented testimonials (L8), nothing we can't
 * actually produce. The drawings below are generated at build time by the
 * same engines every customer uses.
 */

const SAMPLE_BRIEF: DesignBrief = {
  id: "folio",
  projectId: "folio",
  version: 1,
  program: {
    familySize: 4,
    bedrooms: 4,
    bathrooms: 3,
    office: true,
    gym: false,
    theater: false,
    outdoorKitchen: false,
    garageBays: 2,
  },
  style: "craftsman",
  interiors: {},
  lifestyleNotes: "",
};

export default function Home() {
  const sample = generateConcepts(SAMPLE_BRIEF, buildableWidthFt(90), buildableDepthFt(140))[0];
  const model = sample.model;

  return (
    <div className="folio">
      <main>
        <div className="wordmark" style={{ flexWrap: "wrap", gap: "0.35rem 1rem" }}>
          <strong style={{ display: "inline-flex", alignItems: "center", gap: "0.7rem" }}><BrandMark size={26} /> BUILDSPHERE</strong>
          <span style={{ display: "inline-flex", gap: "1.25rem", flexWrap: "wrap" }}>
            <Link href="/pricing">Pricing</Link>
            <Link href="/pro">For professionals</Link>
          </span>
        </div>

        <section className="folio-hero">
          <p className="eyebrow">Design · Engineering · Construction · Ownership</p>
          <h1 className="display">A home of your own, drawn to the last detail.</h1>
          <p className="lead">
            Tell BuildSphere how your family lives. In moments you hold three architect-quality
            concepts — floor plans, elevations, a furnished 3D interior you can walk through —
            each priced line by line, each refined by conversation, and carried from first sketch
            through bids, construction draws, and decades of ownership.
          </p>
          <p style={{ display: "flex", gap: "1.25rem", alignItems: "center", flexWrap: "wrap" }}>
            <Link className="btn" href="/app">
              Begin your design
            </Link>
            <Link className="btn secondary" href="/sample">
              Tour a sample project
            </Link>
          </p>
          <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
            Designing is free. One price, one home when you&apos;re ready —{" "}
            <Link href="/pricing">see pricing</Link>. No monthly subscription.
          </p>
        </section>

        <hr className="hairline" />

        <section>
          <p className="eyebrow">From the drawing set</p>
          <div className="frames">
            <figure className="frame" style={{ margin: 0 }}>
              <div className="plate">
                <ElevationView model={model} style="craftsman" direction="north" />
              </div>
              <figcaption>
                <span>Front elevation</span>
                <em>Craftsman</em>
              </figcaption>
            </figure>
            <figure className="frame" style={{ margin: 0 }}>
              <div className="plate">
                <FloorPlan model={model} level={0} />
              </div>
              <figcaption>
                <span>Ground floor plan</span>
                <em>{sample.sqft.toLocaleString()} sqft</em>
              </figcaption>
            </figure>
            <figure className="frame" style={{ margin: 0 }}>
              <div className="plate">
                <SitePlanView model={model} lotWidthFt={100} lotDepthFt={150} />
              </div>
              <figcaption>
                <span>Site placement</span>
                <em>100 × 150 ft lot</em>
              </figcaption>
            </figure>
          </div>
        </section>

        <hr className="hairline" />

        <section className="stat-row">
          <div>
            <strong>28</strong>
            <span>architectural styles, Craftsman to Modern</span>
          </div>
          <div>
            <strong>3</strong>
            <span>distinct concepts, generated and priced in moments</span>
          </div>
          <div>
            <strong>12</strong>
            <span>interior design schemes, staged room by room</span>
          </div>
          <div>
            <strong>±15%</strong>
            <span>honest concept-stage estimates, line by line</span>
          </div>
        </section>

        <hr className="hairline" />

        <section>
          <p className="eyebrow">What you walk away with</p>
          <ul className="sphere-list">
            {[
              ["Contractor bid package", "Eleven trade-scoped sheets with measured quantities — unpriced, so every bid you collect is unanchored."],
              ["Construction schedule & draws", "A milestone timeline sized to your design, with a payment plan tied to inspected work."],
              ["Electrical & lighting plan", "Receptacles, switches, fixtures, and smoke/CO drawn to code minimums in standard symbols."],
              ["Energy report", "Where the heat goes, what it costs each year, and which upgrades genuinely pay back."],
              ["30-year maintenance plan", "A care calendar generated from your exact materials — slate and shingle age differently, and your plan knows it."],
              ["The Design Report, as a real PDF", "Vector floor plans, elevations, health checks, and the full estimate — small enough to email, crisp at any zoom."],
            ].map(([title, blurb], i) => (
              <li key={title}>
                <span className="no">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{blurb}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <hr className="hairline" />

        <section>
          <p className="eyebrow">How it works</p>
          <div className="steps">
            <div>
              <span className="eyebrow" style={{ letterSpacing: "0.2em" }}>I</span>
              <h3>A conversation, not a questionnaire</h3>
              <p>
                Your rooms, your budget, your lot, your style — or simply a photograph of a home
                you love, and the design brief writes itself.
              </p>
            </div>
            <div>
              <span className="eyebrow" style={{ letterSpacing: "0.2em" }}>II</span>
              <h3>Three concepts, honestly priced</h3>
              <p>
                Plans, elevations, and a line-by-line estimate with its sources shown. Walk the
                furnished interior in 3D, restyle it in twelve schemes, and watch the price answer
                every change.
              </p>
            </div>
            <div>
              <span className="eyebrow" style={{ letterSpacing: "0.2em" }}>III</span>
              <h3>Your architect, on the record</h3>
              <p>
                Invite your own architect or engineer with a private link. Reviews, credentials,
                and approvals are recorded on your drawings — ready for the road to permits.
              </p>
            </div>
          </div>
        </section>

        <hr className="hairline" />

        <section>
          <p className="eyebrow">Eight systems, one source of truth</p>
          <ul className="sphere-list">
            {SPHERES.map((s, i) => (
              <li key={s.key}>
                <span className="no">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>
                    {s.name}{" "}
                    <span className="phase-tag">Phase {s.phase}</span>
                  </h3>
                  <p>{s.tagline}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <div className="band">
        <h2 className="display">Begin with the home you have always meant to build.</h2>
        <Link className="btn" href="/app">
          Start the design interview
        </Link>
      </div>

      <main style={{ paddingTop: 0 }}>
        <footer>
          <span>
            BUILDSPHERE — onbuildsphere.com · <Link href="/pricing">Pricing</Link> · <Link href="/faq">FAQ</Link> · <Link href="/privacy">Privacy</Link> ·{" "}
            <Link href="/terms">Terms</Link>
          </span>
          <span>{ESTIMATE_RANGE_CLAIM}</span>
        </footer>
      </main>
    </div>
  );
}
