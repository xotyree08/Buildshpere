import Link from "next/link";
import type { Metadata } from "next";

import { BrandMark } from "@/components/BrandMark";
import { CONCEPT_DISCLAIMER, ESTIMATE_RANGE_CLAIM } from "@/lib/claims";

export const metadata: Metadata = {
  title: "Terms of Service — BuildSphere",
  description: "The agreement for using BuildSphere: what the platform provides, what it doesn't, and what we each promise.",
};

/**
 * Terms in the same honest register as the product. The load-bearing
 * sections are the ones about what concepts are NOT (L8) — they repeat
 * the in-product disclaimers verbatim so the terms and the UI can never
 * drift apart.
 */

const UPDATED = "August 6, 2026";

const SECTIONS: [string, string[]][] = [
  [
    "The agreement",
    [
      "These terms are a contract between you and BuildSphere covering the website at onbuildsphere.com and the BuildSphere mobile apps. By creating an account or using the service you accept them. If you don't accept them, don't use the service.",
    ],
  ],
  [
    "What BuildSphere provides",
    [
      "BuildSphere generates residential design concepts and planning documents from your input: floor plans, elevations, 3D visualizations, cost estimates, bid packages, schedules, coordination drawings, energy reports, and maintenance plans. You own your project data and the documents generated from it, and you can export everything at any time.",
    ],
  ],
  [
    "What BuildSphere is not — read this one",
    [
      CONCEPT_DISCLAIMER,
      "Concepts and documents are planning tools, not construction documents. They are not stamped by a licensed architect or engineer, are not permit submittals, and are not a substitute for professional advice. Building anything requires licensed professionals in your jurisdiction; BuildSphere is how you arrive at that conversation prepared.",
      ESTIMATE_RANGE_CLAIM +
        " Estimates are informed planning ranges, not quotes or guarantees. Actual costs depend on your site, your market, your builder, and decisions not yet made.",
      "Professionals you invite through the platform self-report their credentials. BuildSphere does not verify licenses and is not a party to any agreement between you and a professional or contractor.",
    ],
  ],
  [
    "Your account and conduct",
    [
      "Keep your password secret; you are responsible for activity under your account. Use the service only for lawful purposes and only for real design work — not to probe, overload, or reverse the service, and not to upload content you have no right to use.",
      "Inspiration photos must be images you are entitled to use as inspiration. The platform reads a photo's style; it does not and will not reproduce someone else's copyrighted plans.",
    ],
  ],
  [
    "Subscriptions",
    [
      "Core design features are free during the platform's early phase. BuildSphere Plus is one subscription that covers the website and the mobile apps, however you purchase it.",
      "Purchased through the Apple App Store or Google Play, it renews and cancels through your store account and is governed additionally by that store's terms. Purchased on the web, payment is processed by Stripe and you can manage or cancel it from your account page. Prices are shown before any charge; cancellation stops future renewals and leaves already-paid periods active.",
    ],
  ],
  [
    "Intellectual property",
    [
      "You keep all rights to your input and your projects. BuildSphere keeps all rights to the platform itself — its engines, catalogs, designs of the service, and branding. Generated documents are yours to use for your project, including with your architect, engineer, or builder.",
    ],
  ],
  [
    "Warranties and liability",
    [
      "The service is provided as-is, without warranties of any kind, express or implied, including fitness for a particular purpose. To the maximum extent the law allows, BuildSphere's total liability for any claim arising from the service is limited to the amount you paid for the service in the twelve months before the claim — and BuildSphere is not liable for indirect, incidental, or consequential damages, including construction costs, delays, or decisions made in reliance on generated documents.",
      "Nothing in these terms limits liability that cannot lawfully be limited.",
    ],
  ],
  [
    "Termination",
    [
      "You can delete your account at any time from the account page, which removes your data as described in the Privacy Policy. We may suspend or end access for breach of these terms; you keep the right to export your data first except where the breach makes that impossible to offer safely.",
    ],
  ],
  [
    "Changes and contact",
    [
      "If these terms change materially, the change will be announced on the site before it takes effect, and the date above updates. Continued use after the effective date is acceptance. Questions: support@onbuildsphere.com.",
    ],
  ],
];

export default function TermsPage() {
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
          <p className="eyebrow">Updated {UPDATED}</p>
          <h1 className="display">Terms, without the fog.</h1>
        </section>

        <hr className="hairline" />

        {SECTIONS.map(([heading, paragraphs]) => (
          <section key={heading} style={{ maxWidth: 760 }}>
            <h3 style={{ marginBottom: "0.35rem" }}>{heading}</h3>
            {paragraphs.map((p) => (
              <p key={p.slice(0, 40)} style={{ color: "var(--muted)", lineHeight: 1.65 }}>
                {p}
              </p>
            ))}
          </section>
        ))}

        <footer>
          <span>
            BUILDSPHERE — onbuildsphere.com · <Link href="/privacy">Privacy Policy</Link> · <Link href="/faq">FAQ</Link>
          </span>
          <span>support@onbuildsphere.com</span>
        </footer>
      </main>
    </div>
  );
}
