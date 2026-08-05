"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { accountEmail } from "@/lib/store";

interface Review {
  id: string;
  projectId: string;
  status: "requested" | "claimed" | "approved" | "changes_requested";
  note: string | null;
  professionalEmail: string | null;
}

const STATUS_LABEL: Record<Review["status"], string> = {
  requested: "Requested — waiting for a professional",
  claimed: "In review",
  approved: "Approved",
  changes_requested: "Changes requested",
};

/** Owner-facing professional-review status + request CTA (Phase 2 seam, now real). */
export function ReviewSection({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [review, setReview] = useState<Review | null>(null);
  const [signedIn] = useState<boolean>(() => Boolean(accountEmail()));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    void fetch("/api/v1/reviews")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { reviews: Review[] } | null) => {
        const mine = data?.reviews.find((rv) => rv.projectId === projectId) ?? null;
        setReview(mine);
      })
      .catch(() => null);
  }, [projectId, signedIn]);

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
      setReview(body.review);
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
            Have a licensed professional review this design before it goes further. Reviews are
            advisory until stamped drawings arrive with full Phase 2.
          </p>
          <button className="btn" onClick={request} disabled={busy}>
            {busy ? "Working…" : "Request professional review"}
          </button>
        </>
      )}
      {message && <p className="status-warn">{message}</p>}
    </div>
  );
}
