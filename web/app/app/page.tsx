"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/BrandMark";
import { prepareImport, validateExport } from "@/lib/portability";
import { accountEmail, deleteProject, formatUsd, loadProjects, newId, readProjects, saveProject, type StoredProject } from "@/lib/store";

interface AppNotification {
  id: string;
  kind: string;
  message: string;
  projectId: string | null;
  createdAt: string;
  readAt: string | null;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<StoredProject[] | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  // A store that cannot be read is shown, not swallowed: the alternative is
  // a returning customer being told they have no projects.
  const [storeError, setStoreError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const read = readProjects();
    setProjects(read.projects);
    setStoreError(read.error);
    if (accountEmail()) {
      void fetch("/api/v1/notifications")
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { notifications: AppNotification[]; unread: number } | null) => {
          if (data) {
            setNotifications(data.notifications);
            setUnread(data.unread);
          }
        })
        .catch(() => null);
    }
  }, []);

  async function toggleNotifications() {
    const opening = !showNotifications;
    setShowNotifications(opening);
    if (opening && unread > 0) {
      await fetch("/api/v1/notifications", { method: "POST" }).catch(() => null);
      setUnread(0);
    }
  }

  async function handleImport(file: File) {
    setImportMessage(null);
    const validated = validateExport(await file.text());
    if (!validated.ok) {
      setImportMessage(validated.error);
      return;
    }
    const existing = new Set(loadProjects().map((p) => p.project.id));
    const prepared = prepareImport(validated.project, existing, newId);
    const saved = saveProject(prepared);
    if (!saved.ok) {
      setImportMessage(saved.error);
      return;
    }
    setProjects(loadProjects());
    setImportMessage(
      `Imported "${prepared.project.name}".${saved.warning ? ` ${saved.warning}` : ""}`,
    );
  }

  return (
    <main>
      <div className="topbar">
        <h1 style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}><BrandMark size={26} /> Your Projects</h1>
        <span style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {accountEmail() && (
            <button className="btn secondary" type="button" onClick={() => void toggleNotifications()}>
              🔔{unread > 0 ? ` ${unread}` : ""}
            </button>
          )}
          <Link href="/app/account">Account</Link>
          <button className="btn secondary" type="button" onClick={() => importRef.current?.click()}>
            Import
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImport(file);
              e.target.value = "";
            }}
          />
          <Link className="btn" href="/app/new">
            New home design
          </Link>
        </span>
      </div>
      {storeError && <p className="status-warn">{storeError}</p>}
      {importMessage && <p className="status-warn">{importMessage}</p>}
      {showNotifications && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>Notifications</h2>
          {notifications.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>Nothing yet — review updates and invitations land here.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "0.9rem" }}>
              {notifications.slice(0, 20).map((n) => (
                <li key={n.id} style={{ padding: "0.25rem 0", display: "flex", gap: "0.75rem", alignItems: "baseline" }}>
                  <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {new Date(n.createdAt).toLocaleDateString()}
                  </span>
                  <span style={{ fontWeight: n.readAt ? 400 : 600 }}>
                    {n.projectId ? <Link href={`/app/project/${n.projectId}`}>{n.message}</Link> : n.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {projects === null ? null : projects.length === 0 ? (
        <div className="card">
          <h2>Nothing here yet</h2>
          <p>Start the design interview and get three priced concepts in seconds.</p>
          <Link className="btn" href="/app/new">
            Start designing
          </Link>
        </div>
      ) : (
        <section className="grid">
          {projects.map(({ project, packages }) => {
            const best = packages.length
              ? packages.reduce((a, b) => (b.healthScore > a.healthScore ? b : a))
              : null;
            return (
              <div className="card" key={project.id}>
                <h2>{project.name}</h2>
                <p>
                  {best
                    ? `${packages.length} concepts · best health ${best.healthScore} · from ${formatUsd(
                        Math.min(...packages.map((p) => p.estimate.totalCents)),
                      )}`
                    : "Interview not finished"}
                </p>
                <p style={{ display: "flex", gap: "0.75rem" }}>
                  <Link className="btn secondary" href={`/app/project/${project.id}`}>
                    Open
                  </Link>
                  <button
                    className="btn secondary"
                    onClick={() => {
                      const result = deleteProject(project.id);
                      const read = readProjects();
                      setProjects(read.projects);
                      setStoreError(result.ok ? read.error : result.error);
                    }}
                  >
                    Delete
                  </button>
                </p>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
