"use client";

import { useEffect, useState } from "react";

interface MetricRow {
  day: string;
  path: string;
  hits: number;
}

/**
 * Traffic at a glance for admins: 30 days of (day, path, count) rows —
 * the only usage data the platform keeps, per the privacy policy.
 */
export default function AdminMetricsPage() {
  const [rows, setRows] = useState<MetricRow[] | null>(null);
  const [status, setStatus] = useState<string | null>("Loading…");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/v1/metrics");
        const body = (await res.json()) as { metrics?: MetricRow[]; error?: string };
        if (!res.ok) {
          setStatus(body.error ?? `Failed to load (${res.status}).`);
          return;
        }
        setRows(body.metrics ?? []);
        setStatus(null);
      } catch {
        setStatus("Could not reach the server — check your connection and reload.");
      }
    })();
  }, []);

  const totals = new Map<string, number>();
  for (const r of rows ?? []) totals.set(r.path, (totals.get(r.path) ?? 0) + r.hits);
  const days = [...new Set((rows ?? []).map((r) => r.day))].sort().reverse();

  return (
    <main>
      <div className="topbar">
        <h1>Traffic</h1>
        <a href="/app">Back to projects</a>
      </div>

      {status && (
        <div className="card">
          <p>{status}</p>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card">
          <p>No visits counted yet. Counts appear within a minute of the first page view.</p>
        </div>
      )}

      {rows && rows.length > 0 && (
        <>
          <div className="card" style={{ marginBottom: "1rem" }}>
            <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Last 30 days by page</h2>
            <table style={{ borderCollapse: "collapse", fontSize: "0.9rem", minWidth: 320 }}>
              <tbody>
                {[...totals.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([path, hits]) => (
                    <tr key={path} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "0.35rem 1.5rem 0.35rem 0" }}>{path}</td>
                      <td style={{ padding: "0.35rem 0", textAlign: "right" }}>
                        <strong>{hits.toLocaleString()}</strong>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2 style={{ marginTop: 0, fontSize: "1rem" }}>By day</h2>
            {days.map((day) => (
              <p key={day} style={{ margin: "0.3rem 0", fontSize: "0.88rem" }}>
                <strong>{day}</strong>{" "}
                <span style={{ color: "var(--muted)" }}>
                  {rows
                    .filter((r) => r.day === day)
                    .map((r) => `${r.path} ×${r.hits}`)
                    .join(" · ")}
                </span>
              </p>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
