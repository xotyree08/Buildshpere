"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { fetchMe, type AuthUser } from "@/lib/sync";

/**
 * Landing page for a homeowner's professional invite. Accepting grants the
 * professional role and assigns the review — then onboarding continues in
 * the portal (credentials before any approval authority).
 */
export default function ProJoinPage() {
  const params = useParams<{ token: string }>();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);

  useEffect(() => {
    void fetchMe().then(setUser);
  }, []);

  async function accept() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/pro/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: params.token }),
      }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as
        | { review?: { projectName: string }; error?: string }
        | null;
      if (!res?.ok || !body?.review) {
        setMessage(body?.error ?? "Accepting the invite failed — try again.");
        return;
      }
      setAccepted(body.review.projectName);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="topbar">
        <h1>Professional invitation</h1>
        <Link href="/">BuildSphere</Link>
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        {accepted ? (
          <>
            <p>
              You now hold the review for <strong>{accepted}</strong>. Next step: complete your
              professional profile — approvals are recorded with your credentials.
            </p>
            <Link className="btn" href="/pro">
              Open the professional portal
            </Link>
          </>
        ) : (
          <>
            <p>
              A homeowner invited you to review their BuildSphere project as their architect,
              engineer, or designer. Accepting assigns their review to you and opens the
              professional portal.
            </p>
            {user === undefined ? null : user ? (
              <p style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <button className="btn" onClick={() => void accept()} disabled={busy}>
                  {busy ? "Accepting…" : `Accept as ${user.email}`}
                </button>
              </p>
            ) : (
              <p>
                First{" "}
                <Link href="/app/account">sign in or create a free account</Link> in this browser,
                then return to this link to accept.
              </p>
            )}
            {message && <p className="status-warn">{message}</p>}
          </>
        )}
      </div>
    </main>
  );
}
