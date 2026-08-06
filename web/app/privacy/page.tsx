import Link from "next/link";
import type { Metadata } from "next";

import { BrandMark } from "@/components/BrandMark";

export const metadata: Metadata = {
  title: "Privacy Policy — BuildSphere",
  description: "What BuildSphere collects, where it lives, who sees it, and how to take it with you or delete it.",
};

/**
 * The privacy policy, in plain language and specific to what the product
 * actually does (L8: no boilerplate claims we can't keep). Update this
 * page in the same PR as any change to data handling.
 */

const UPDATED = "August 6, 2026";

const SECTIONS: [string, string[]][] = [
  [
    "The short version",
    [
      "Your design projects live in your browser by default. Creating an account is optional; it syncs projects to your private account so you can reach them from other devices. We don't sell data, we don't run ads, and we don't use third-party analytics or tracking cookies.",
    ],
  ],
  [
    "What we collect, and where it lives",
    [
      "Projects — floor plans, estimates, revisions, documents — are created on your device and stored in your browser's localStorage. Until you create an account, they never leave it.",
      "If you create an account, we store your email address and a hash of your password (never the password itself), and your projects sync to our database so you can access them from other devices. Signing in sets one session cookie; its token is also stored hashed on our side, so a leaked database yields no usable session.",
      "If you invite a professional to review a plan, we store the review record: their self-reported name, discipline, license details, and their comments, attached to your project.",
      "If you subscribe through the mobile apps, Apple or Google processes the payment. We receive and store the purchase receipt to activate your subscription — never your card number.",
      "We keep an append-only audit log of security-relevant events (sign-ins, shares, deletions, purchases) to protect your account, and technical error reports (what broke and in which browser) to fix failures. Error reports are not tied to your projects' contents.",
    ],
  ],
  [
    "Inspiration photos and AI",
    [
      "When you upload an inspiration photo or use a conversational feature, that photo or text is sent to Anthropic (our AI provider) to be interpreted, and the interpretation comes back. We do not store your photos on our servers; on your device they are kept with your project in your browser. Per Anthropic's API terms, API inputs are not used to train their models.",
    ],
  ],
  [
    "Who else touches the data",
    [
      "Vercel hosts the site. Neon hosts the database. Anthropic processes AI requests. If email delivery is enabled, Resend sends password-reset messages. Apple and Google process mobile payments. Each receives only what its job requires — none of them receives your projects except the database that stores them.",
      "We disclose data beyond this only if the law requires it. We do not sell or rent personal information to anyone.",
    ],
  ],
  [
    "Sharing you control",
    [
      "Projects are private. A project becomes visible to someone else only through a share link you create — which you can revoke at any time — or a professional invite you send. Deleting a share ends access immediately.",
    ],
  ],
  [
    "Your rights: export and delete",
    [
      "Every project exports to a single JSON file from its project page, and imports back losslessly — your data is portable by design, not by request form.",
      "Your account page can export everything we hold about you, and can delete your account entirely. Deletion removes your account, projects, sessions, and shares from our database. Audit log entries are retained without your content, as a security record.",
    ],
  ],
  [
    "Children",
    [
      "BuildSphere is for adults planning real construction projects and is not directed at children under 13. We do not knowingly collect information from children.",
    ],
  ],
  [
    "Changes and contact",
    [
      "If this policy changes, the date above changes with it, and material changes will be announced on the site before they take effect. Questions or requests: support@onbuildsphere.com.",
    ],
  ],
];

export default function PrivacyPage() {
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
          <h1 className="display">Privacy, plainly.</h1>
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
            BUILDSPHERE — onbuildsphere.com · <Link href="/terms">Terms of Service</Link> · <Link href="/faq">FAQ</Link>
          </span>
          <span>support@onbuildsphere.com</span>
        </footer>
      </main>
    </div>
  );
}
