"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Password reset, both halves: request a link (no token in the URL) and
 * set a new password (arrived from the email link). The token is read
 * from location on the client so this page can stay statically rendered.
 */
export default function ResetPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
    setLoaded(true);
  }, []);

  async function request(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/auth/reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      setMessage(data.message ?? data.error ?? "Something went wrong.");
      if (res.ok) setDone(true);
    } catch {
      setMessage("Could not reach the server — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/auth/reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      setMessage(data.message ?? data.error ?? "Something went wrong.");
      if (res.ok) setDone(true);
    } catch {
      setMessage("Could not reach the server — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;

  return (
    <main style={{ maxWidth: 520 }}>
      <div className="topbar">
        <h1>{token ? "Choose a new password" : "Reset your password"}</h1>
        <Link href="/app/account">Back to sign in</Link>
      </div>

      {token ? (
        <form className="card" onSubmit={confirm}>
          <label className="field">
            <span>New password (8+ characters)</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              autoFocus
            />
          </label>
          <p>
            <button className="btn" type="submit" disabled={busy || done}>
              {busy ? "Working…" : "Set new password"}
            </button>
          </p>
        </form>
      ) : (
        <form className="card" onSubmit={request}>
          <p>Enter your account email and we&apos;ll send a reset link that works for one hour.</p>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <p>
            <button className="btn" type="submit" disabled={busy || done}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </p>
        </form>
      )}
      {message && <p className={done ? "" : "status-warn"}>{message}</p>}
      {done && token && (
        <p>
          <Link className="btn secondary" href="/app/account">
            Go sign in
          </Link>
        </p>
      )}
    </main>
  );
}
