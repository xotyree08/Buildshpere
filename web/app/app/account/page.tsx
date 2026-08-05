"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { fetchMe, login, logout, signup, syncNow, type AuthUser } from "@/lib/sync";
import { setAccountEmail } from "@/lib/store";

export default function AccountPage() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetchMe().then((me) => {
      setUser(me);
      setAccountEmail(me?.email ?? null);
    });
  }, []);

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
        <div className="card" style={{ maxWidth: 520 }}>
          <p>
            Signed in as <strong>{user.email}</strong>. Projects sync to your account and follow
            you across devices.
          </p>
          <p style={{ display: "flex", gap: "0.75rem" }}>
            <button className="btn" onClick={handleSync} disabled={busy}>
              {busy ? "Working…" : "Sync now"}
            </button>
            <button className="btn secondary" onClick={handleSignOut} disabled={busy}>
              Sign out
            </button>
          </p>
          {message && <p className="status-warn">{message}</p>}
        </div>
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
          </p>
          {message && <p className="status-warn">{message}</p>}
        </form>
      )}
    </main>
  );
}
