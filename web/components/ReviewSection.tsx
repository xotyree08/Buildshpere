"use client";

import Link from "next/link";
import { useState } from "react";

export interface Review {
  id: string;
  projectId: string;
  status: "requested" | "claimed" | "approved" | "changes_requested";
  note: string | null;
  professionalEmail: string | null;
  /** ISO timestamp of the last review transition — edits after it invalidate approval. */
  updatedAt: string;
}

const STATUS_LABEL: Record<Review["status"], string> = {
  requested: "Requested — waiting for a professional",
  claimed: "In review",
  approved: "Approved",
  changes_requested: "Changes requested",
};

/**
 * Owner-facing professional-review status + request CTA. Review state is
 * owned by the project page (single fetch, shared with permit readiness).
 */
export function ReviewSection({
  projectId,
  projectName,
  signedIn,
  review,
  onReviewChange,
}: {
  projectId: string;
  projectName: string;
  signedIn: boolean;
  review: Review | null;
  onReviewChange: (review: Review) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function invite() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/pro/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, projectName }),
      }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { token?: string; error?: string } | null;
      if (!res?.ok || !body?.token) {
        setMessage(body?.error ?? "Creating the invite failed — try again.");
        return;
      }
      setInviteUrl(`${window.location.origin}/pro/join/${body.token}`);
      // The review now exists (directed) — refresh the parent's view of it.
      const refreshed = await fetch("/api/v1/reviews").catch(() => null);
      const data = (await refreshed?.json().catch(() => null)) as { reviews?: Review[] } | null;
      const mine = data?.reviews?.find((r) => r.projectId === projectId);
      if (mine) onReviewChange(mine);
    } finally {
      setBusy(false);
    }
  }

  async function request() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, projectName }),
      });
      const body = (await res.json().catch(() => null)) as { review?: Review; error?: string } | null;
      if (!res.ok || !body?.review) {
        setMessage(body?.error ?? "Requesting a review failed — try again.");
        return;
      }
      onReviewChange(body.review);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <h2>Professional review</h2>
      {!signedIn ? (
        <p>
          <Link href="/app/account">Sign in</Link> to request a professional review of this design.
        </p>
      ) : review ? (
        <>
          <p>
            <span className="scorepill" style={{ marginRight: "0.5rem" }}>
              {STATUS_LABEL[review.status]}
            </span>
            {review.professionalEmail && <>with {review.professionalEmail}</>}
          </p>
          {review.note && (
            <p>
              <strong>Reviewer&apos;s note:</strong> {review.note}
            </p>
          )}
          {review.status === "changes_requested" && (
            <p>
              <button className="btn" onClick={request} disabled={busy}>
                {busy ? "Working…" : "Request re-review"}
              </button>
            </p>
          )}
        </>
      ) : (
        <>
          <p>
            Have a licensed professional review this design before it goes further. Post it to the
            open queue, or invite <em>your own</em> architect or designer with a private link.
            Reviews are advisory until stamped drawings arrive with full Phase 2.
          </p>
          <p style={{ display: "flex", gap: "0.75rem" }}>
            <button className="btn" onClick={request} disabled={busy}>
              {busy ? "Working…" : "Request professional review"}
            </button>
            <button className="btn secondary" onClick={invite} disabled={busy}>
              Invite my architect/designer
            </button>
          </p>
        </>
      )}
      {signedIn && review && review.status !== "approved" && !inviteUrl && (
        <p>
          <button className="btn secondary" onClick={invite} disabled={busy}>
            Invite my architect/designer
          </button>
        </p>
      )}
      {inviteUrl && (
        <>
          <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
            Send this single-use link to your professional. It assigns the review to them
            privately — it will not appear in the open queue. Creating a new link replaces this
            one.
          </p>
          <p style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <input readOnly value={inviteUrl} style={{ flex: 1, minWidth: "16rem" }} onFocus={(e) => e.target.select()} />
            <button className="btn secondary" type="button" onClick={() => void navigator.clipboard?.writeText(inviteUrl)}>
              Copy
            </button>
          </p>
        </>
      )}
      {message && <p className="status-warn">{message}</p>}
    </div>
  );
}
