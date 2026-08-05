"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { fetchMe, type AuthUser } from "@/lib/sync";

interface Review {
  id: string;
  projectId: string;
  projectName: string;
  status: "requested" | "claimed" | "approved" | "changes_requested";
  note: string | null;
  professionalId: string | null;
  professionalEmail: string | null;
  updatedAt: string;
}

interface Profile {
  fullName: string;
  discipline: string;
  licenseNumber: string;
  licenseState: string;
  status: string;
}

const DISCIPLINES = ["architect", "engineer", "designer", "surveyor"];

/** The Professional Portal's first slice: the review queue (EngineerSphere, Phase 2). */
export default function ProPage() {
  const [me, setMe] = useState<AuthUser | null | undefined>(undefined);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [editingProfile, setEditingProfile] = useState(false);
  const [draft, setDraft] = useState({ fullName: "", discipline: "architect", licenseNumber: "", licenseState: "" });

  const refresh = useCallback(async () => {
    const res = await fetch("/api/v1/reviews").catch(() => null);
    if (res?.ok) {
      const data = (await res.json()) as { reviews: Review[] };
      setReviews(data.reviews);
    }
    const prof = await fetch("/api/v1/pro/profile").catch(() => null);
    if (prof?.ok) {
      const data = (await prof.json()) as { profile: Profile | null };
      setProfile(data.profile);
    }
  }, []);

  useEffect(() => {
    void fetchMe().then(async (user) => {
      setMe(user);
      if (user?.role === "professional") await refresh();
    });
  }, [refresh]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/pro/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = (await res.json().catch(() => null)) as { profile?: Profile; error?: string } | null;
      if (!res.ok || !body?.profile) {
        setMessage(body?.error ?? "Saving the profile failed.");
        return;
      }
      setProfile(body.profile);
      setEditingProfile(false);
    } finally {
      setBusy(false);
    }
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/auth/professional", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Access code check failed.");
        return;
      }
      const user = await fetchMe();
      setMe(user);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function act(review: Review, action: "claim" | "approve" | "request_changes") {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/reviews/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reviewId: review.id, action, note: notes[review.id] ?? "" }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) setMessage(body?.error ?? "Action failed.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="topbar">
        <h1>Professional Portal</h1>
        <Link href="/app">Homeowner app</Link>
      </div>

      {me === undefined ? null : me === null ? (
        <div className="card" style={{ maxWidth: 520 }}>
          <p>
            <Link href="/app/account">Sign in</Link> first, then return here to unlock
            professional access.
          </p>
        </div>
      ) : me.role !== "professional" ? (
        <form className="card" style={{ maxWidth: 520 }} onSubmit={unlock}>
          <p>
            Enter your professional access code. Access codes are issued per deployment; licensed-
            professional verification arrives with full Phase 2.
          </p>
          <label className="field">
            <span>Access code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Checking…" : "Unlock professional access"}
          </button>
          {message && <p className="status-warn">{message}</p>}
        </form>
      ) : (
        <>
          <p style={{ color: "var(--muted)" }}>
            Signed in as {me.email} (professional). Reviews are advisory until stamped drawings
            arrive with full Phase 2.
          </p>
          {message && <p className="status-warn">{message}</p>}

          {profile !== undefined && (profile === null || editingProfile) && (
            <form className="card" style={{ maxWidth: 620, marginBottom: "1rem" }} onSubmit={saveProfile}>
              <h2 style={{ marginTop: 0 }}>Complete your professional profile</h2>
              <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
                Approvals are recorded with these credentials, so they come before any review
                authority. Credentials are stored as <strong>self-reported</strong> — automated
                licensing-board verification is not available yet, and BuildSphere never applies a
                seal on a professional&apos;s behalf.
              </p>
              <label className="field">
                <span>Full name (as licensed)</span>
                <input value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} required />
              </label>
              <div className="field-row">
                <label className="field">
                  <span>Discipline</span>
                  <select value={draft.discipline} onChange={(e) => setDraft({ ...draft, discipline: e.target.value })}>
                    {DISCIPLINES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>License number</span>
                  <input value={draft.licenseNumber} onChange={(e) => setDraft({ ...draft, licenseNumber: e.target.value })} required />
                </label>
                <label className="field">
                  <span>License state</span>
                  <input value={draft.licenseState} maxLength={2} placeholder="TX" onChange={(e) => setDraft({ ...draft, licenseState: e.target.value })} required />
                </label>
              </div>
              <p style={{ display: "flex", gap: "0.75rem" }}>
                <button className="btn" type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save profile"}
                </button>
                {editingProfile && (
                  <button className="btn secondary" type="button" onClick={() => setEditingProfile(false)}>
                    Cancel
                  </button>
                )}
              </p>
            </form>
          )}
          {profile && !editingProfile && (
            <p style={{ fontSize: "0.9rem" }}>
              <strong>{profile.fullName}</strong> · {profile.discipline} · License {profile.licenseNumber} (
              {profile.licenseState}) ·{" "}
              <span className="status-warn" title="Automated licensing-board verification arrives with the jurisdiction integrations.">
                self-reported
              </span>{" "}
              <button
                className="btn secondary"
                style={{ padding: "0.1rem 0.6rem", fontSize: "0.8rem" }}
                type="button"
                onClick={() => {
                  setDraft({
                    fullName: profile.fullName,
                    discipline: profile.discipline,
                    licenseNumber: profile.licenseNumber,
                    licenseState: profile.licenseState,
                  });
                  setEditingProfile(true);
                }}
              >
                Edit
              </button>
            </p>
          )}
          {reviews.length === 0 ? (
            <div className="card">
              <p>No open reviews. Approved work leaves the queue.</p>
            </div>
          ) : (
            reviews.map((review) => {
              const mine = review.professionalId === me.id;
              return (
                <div className="card" key={review.id} style={{ marginBottom: "1rem" }}>
                  <div className="topbar" style={{ marginBottom: "0.25rem" }}>
                    <h2 style={{ margin: 0 }}>{review.projectName}</h2>
                    <span className="scorepill">{review.status.replace("_", " ")}</span>
                  </div>
                  {review.note && (
                    <p style={{ color: "var(--muted)" }}>Last note: {review.note}</p>
                  )}
                  {!review.professionalId && (
                    <button className="btn" onClick={() => act(review, "claim")} disabled={busy}>
                      Claim
                    </button>
                  )}
                  {mine && (review.status === "claimed" || review.status === "requested") && (
                    <>
                      <label className="field">
                        <span>Note to the owner</span>
                        <textarea
                          rows={2}
                          value={notes[review.id] ?? ""}
                          onChange={(e) => setNotes({ ...notes, [review.id]: e.target.value })}
                        />
                      </label>
                      <p style={{ display: "flex", gap: "0.75rem" }}>
                        <button className="btn" onClick={() => act(review, "approve")} disabled={busy}>
                          Approve
                        </button>
                        <button
                          className="btn secondary"
                          onClick={() => act(review, "request_changes")}
                          disabled={busy}
                        >
                          Request changes
                        </button>
                      </p>
                    </>
                  )}
                  {review.professionalId && !mine && (
                    <p style={{ color: "var(--muted)" }}>Claimed by {review.professionalEmail}</p>
                  )}
                </div>
              );
            })
          )}
        </>
      )}
    </main>
  );
}
