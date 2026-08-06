"use client";

import { useEffect, useState } from "react";

import type { ErrorReport } from "@/lib/server/errors";

/**
 * Deployment error review for admins (ADMIN_EMAILS allowlist). Reads what
 * clients reported to /api/v1/errors; every non-happy path names its exact
 * fix (L4) instead of showing an empty table that could mean anything.
 */
export default function AdminErrorsPage() {
  const [errors, setErrors] = useState<ErrorReport[] | null>(null);
  const [status, setStatus] = useState<string | null>("Loading…");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/v1/errors");
        const body = (await res.json()) as { errors?: ErrorReport[]; error?: string };
        if (!res.ok) {
          setStatus(body.error ?? `Failed to load (${res.status}).`);
          return;
        }
        setErrors(body.errors ?? []);
        setStatus(null);
      } catch {
        setStatus("Could not reach the server — check your connection and reload.");
      }
    })();
  }, []);

  return (
    <main>
      <div className="topbar">
        <h1>Error reports</h1>
        <a href="/app">Back to projects</a>
      </div>

      {status && (
        <div className="card">
          <p>{status}</p>
        </div>
      )}

      {errors && errors.length === 0 && (
        <div className="card">
          <p>No errors reported. That's the goal — leave this page open in a tab if you're skeptical.</p>
        </div>
      )}

      {errors && errors.length > 0 && (
        <div className="card">
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            {errors.length} most recent reports, newest first. Click a row for the stack trace.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)" }}>
                <th style={{ padding: "0.4rem" }}>When (UTC)</th>
                <th style={{ padding: "0.4rem" }}>Kind</th>
                <th style={{ padding: "0.4rem" }}>Message</th>
                <th style={{ padding: "0.4rem" }}>Page</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <>
                  <tr
                    key={e.id}
                    onClick={() => setOpen(open === e.id ? null : e.id)}
                    style={{ borderBottom: "1px solid var(--line)", cursor: "pointer" }}
                  >
                    <td style={{ padding: "0.4rem", whiteSpace: "nowrap" }}>
                      {e.createdAt.replace("T", " ").slice(0, 19)}
                    </td>
                    <td style={{ padding: "0.4rem" }}>{e.kind}</td>
                    <td style={{ padding: "0.4rem" }}>{e.message}</td>
                    <td style={{ padding: "0.4rem" }}>{e.url ?? "—"}</td>
                  </tr>
                  {open === e.id && (
                    <tr key={`${e.id}-detail`}>
                      <td colSpan={4} style={{ padding: "0.6rem", background: "var(--card)" }}>
                        <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.4rem" }}>
                          {e.userAgent ?? "unknown browser"}
                        </p>
                        <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.78rem", overflowX: "auto" }}>
                          {e.stack ?? "No stack trace was captured for this report."}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
