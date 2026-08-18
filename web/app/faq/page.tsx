import Link from "next/link";
import type { Metadata } from "next";

import { BrandMark } from "@/components/BrandMark";
import { CONCEPT_DISCLAIMER, ESTIMATE_RANGE_CLAIM } from "@/lib/claims";

export const metadata: Metadata = {
  title: "FAQ — BuildSphere",
  description: "Honest answers about what BuildSphere does, what it costs, and where the licensed professionals come in.",
};

/**
 * The FAQ, in the folio voice. Every answer is honest about the line
 * between what the platform generates and what licensed professionals
 * stamp (L8) — overselling here is how trust dies.
 */

const FAQS: [string, string][] = [
  [
    "What exactly do I get?",
    "Three architect-quality design concepts generated from a conversation about how you live — floor plans, elevations, a furnished 3D interior you can walk through, a line-by-line estimate with its sources shown, and a working document set: contractor bid package, construction schedule with a draw plan, electrical and plumbing coordination drawings, an energy report, a 30-year maintenance plan, and a PDF design report you can email.",
  ],
  [
    "Are these construction documents? Can I get a permit with them?",
    CONCEPT_DISCLAIMER +
      " Permits need stamped drawings from a licensed architect or engineer in your jurisdiction. BuildSphere gets you to that conversation with a complete, priced, reviewable design — and lets you invite your own architect to review and approve the concept on the record.",
  ],
  [
    "How accurate are the prices?",
    ESTIMATE_RANGE_CLAIM +
      " Every line shows its quantity source and confidence. Measured quantities price at medium confidence, allowances at low, and nothing claims high confidence until a real vendor quote exists.",
  ],
  [
    "Does AI design my house?",
    "AI helps you describe what you want — it interprets your words, your inspiration photos, and how you want rooms to feel. The plans, prices, schedules, and drawings come from deterministic engines that produce the same result for the same input every time. AI proposes; the engines decide.",
  ],
  [
    "Who verifies the professionals?",
    "Professionals joining through your invite submit their own license details, which appear on the review record exactly as self-reported. BuildSphere does not verify licenses automatically and says so — you can check any license with your state board in about a minute, and the review record links the discipline, number, and state to make that easy.",
  ],
  [
    "What does BuildSphere cost?",
    "Your account is free, and designing and revising concepts costs nothing — this browser keeps unlimited local projects, and a free account syncs three to the cloud. When one project is ready to go further, you license that home once: one price, one home, no monthly subscription. Tiers run from BuildSphere Concept at $695 to BuildSphere Build+ at $3,495 per project, each with real included allowances of renders and revision rounds — see onbuildsphere.com/pricing. The exact price is always shown on the secure checkout page before anything is charged, and anything you already synced stays yours.",
  ],
  [
    "What counts as a \u201cmajor\u201d revision?",
    "The plan itself decides, not the wording of your request. Changing finishes, fixtures, paint, furniture, tile or lighting is minor and always free and unlimited \u2014 those don\u2019t alter the plan. So are small adjustments: sliding a window, nudging a wall a few inches, moving a door. A revision counts as major when it changes the home in a way a builder would notice: adding or removing a room or a floor, relocating a room across the plan, changing the footprint, or a real change in living area. Those use one of the revision rounds included with your project license, and you\u2019re told which rule applied and how many rounds remain before anything is spent. One exception: accepting a value-engineering suggestion never costs a round, however much it changes \u2014 those are our own recommendations for getting back inside your budget, and charging you for taking them would be perverse. A project you haven\u2019t licensed yet includes two major revisions so you can try the real thing; licensing it starts your tier\u2019s rounds fresh, so paying never leaves you with less than you had.",
  ],
  [
    "Can I take my data and leave?",
    "Always. Every project exports to a single JSON file from the project page — plans, revisions, estimates, records, everything — and imports back losslessly. Your account page can also export all server data, or delete the account entirely.",
  ],
  [
    "Is my project private?",
    "Yes. Projects live in your browser and, when you create an account, sync to your private account. Sharing happens only through links you create and can revoke; professionals see a project only when you invite them.",
  ],
];

export default function FaqPage() {
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
          <p className="eyebrow">Plain answers</p>
          <h1 className="display">Questions worth asking.</h1>
        </section>

        <hr className="hairline" />

        {FAQS.map(([q, a]) => (
          <section key={q} style={{ maxWidth: 760 }}>
            <h3 style={{ marginBottom: "0.35rem" }}>{q}</h3>
            <p style={{ color: "var(--muted)", lineHeight: 1.65 }}>{a}</p>
          </section>
        ))}

        <div className="band" style={{ marginTop: "2rem" }}>
          <h2 className="display">Ready to see your home?</h2>
          <Link className="btn" href="/app">
            Begin your design
          </Link>
        </div>

        <footer>
          <span>
            BUILDSPHERE — onbuildsphere.com · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
          </span>
          <span>{ESTIMATE_RANGE_CLAIM}</span>
        </footer>
      </main>
    </div>
  );
}
