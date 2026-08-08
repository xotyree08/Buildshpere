"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LicensesCard } from "@/components/LicensesCard";
import { fetchMe, login, logout, signup, syncNow, type AuthUser } from "@/lib/sync";
import { setAccountEmail } from "@/lib/store";

interface AuditEvent {
  id: string;
  event: string;
  subject: string | null;
  detail: string | null;
  createdAt: string;
}

export default function AccountPage() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);

  useEffect(() => {
    void fetchMe().then((me) => {
      setUser(me);
      setAccountEmail(me?.email ?? null);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    void fetch("/api/v1/audit")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { events: AuditEvent[] } | null) => setEvents(data?.events ?? null))
      .catch(() => null);
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = mode === "signup" ? await signup(email, password) : await login(email, password);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setUser(result.user);
      setPassword("");
      const sync = await syncNow();
      setMessage(
        sync.ok
          ? `Signed in. ${sync.summary.merged} project${sync.summary.merged === 1 ? "" : "s"} in sync${
              sync.summary.failures > 0 ? ` (${sync.summary.failures} failed to upload)` : ""
            }.${sync.summary.warning ? ` ${sync.summary.warning}` : ""}`
          : `Signed in, but sync failed: ${sync.error}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSync() {
    setBusy(true);
    setMessage(null);
    try {
      const sync = await syncNow();
      setMessage(
        sync.ok
          ? `Synced ${sync.summary.merged} project${sync.summary.merged === 1 ? "" : "s"}${
              sync.summary.failures > 0 ? ` (${sync.summary.failures} failed to upload)` : ""
            }.${sync.summary.warning ? ` ${sync.summary.warning}` : ""}`
          : sync.error,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await logout();
      setUser(null);
      setMessage("Signed out. Projects remain in this browser.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <div className="topbar">
        <h1>Account</h1>
        <Link href="/app">All projects</Link>
      </div>

      {user === undefined ? null : user ? (
        <>
        <div className="card" style={{ maxWidth: 520 }}>
          <p>
            Signed in as <strong>{user.email}</strong>. Projects sync to your account and follow
            you across devices.
          </p>
          {user.emailConfirmedAt ? (
            <p className="status-pass" style={{ fontSize: "0.85rem" }}>Email verified.</p>
          ) : (
            <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              Email not verified yet.{" "}
              <button
                type="button"
                disabled={busy}
                style={{ font: "inherit", background: "none", border: "none", padding: 0, color: "var(--fg)", textDecoration: "underline", cursor: "pointer" }}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const res = await fetch("/api/v1/auth/verify/resend", { method: "POST" });
                    const body = (await res.json()) as { message?: string; error?: string };
                    setMessage(body.message ?? body.error ?? "Something went wrong — try again.");
                  } catch {
                    setMessage("Could not reach the server — try again.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Send verification email
              </button>
            </p>
          )}
          <p style={{ display: "flex", gap: "0.75rem" }}>
            <button className="btn" onClick={handleSync} disabled={busy}>
              {busy ? "Working…" : "Sync now"}
            </button>
            <button className="btn secondary" onClick={handleSignOut} disabled={busy}>
              Sign out
            </button>
          </p>
          {message && <p className="status-warn">{message}</p>}
          <p style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <a className="btn secondary" href="/api/v1/account/export" download>
              Download my data
            </a>
            <button
              className="btn secondary"
              disabled={busy}
              onClick={async () => {
                const password = window.prompt(
                  "Deleting your account removes every synced project, share link, and profile permanently. Local copies in this browser stay. Enter your password to confirm:",
                );
                if (password === null) return;
                setBusy(true);
                try {
                  const res = await fetch("/api/v1/account/delete", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ password }),
                  });
                  const body = (await res.json().catch(() => null)) as { error?: string } | null;
                  if (!res.ok) {
                    setMessage(body?.error ?? "Deletion failed.");
                    return;
                  }
                  setAccountEmail(null);
                  setUser(null);
                  setMessage("Account deleted. Projects in this browser are untouched.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete account…
            </button>
          </p>
          {events && events.length > 0 && (
            <>
              <h2 style={{ fontSize: "1rem", marginBottom: "0.25rem" }}>Recent account activity</h2>
              <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0 0 0.5rem" }}>
                The append-only audit trail — every sign-in, sync, share, review, and purchase on
                this account.
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "0.85rem" }}>
                {events.slice(0, 15).map((ev) => (
                  <li key={ev.id} style={{ padding: "0.15rem 0", display: "flex", gap: "0.75rem" }}>
                    <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {new Date(ev.createdAt).toLocaleString()}
                    </span>
                    <span>
                      {ev.event.replace(/[._]/g, " ")}
                      {ev.subject ? ` · ${ev.subject}` : ""}
                      {ev.detail ? ` (${ev.detail})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <LicensesCard />
        </>
      ) : (
        <form className="card" style={{ maxWidth: 520 }} onSubmit={submit}>
          <p>
            {mode === "signup"
              ? "Create an account to sync projects across devices."
              : "Sign in to sync your projects."}{" "}
            Without an account, everything keeps working in this browser.
          </p>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Password {mode === "signup" && "(at least 8 characters)"}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <p style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setMode(mode === "signup" ? "signin" : "signup");
                setMessage(null);
              }}
            >
              {mode === "signup" ? "I have an account" : "Create an account"}
            </button>
            {mode === "signin" && (
              <a href="/reset" style={{ fontSize: "0.85rem" }}>
                Forgot password?
              </a>
            )}
          </p>
          {message && <p className="status-warn">{message}</p>}
        </form>
      )}
    </main>
  );
}
