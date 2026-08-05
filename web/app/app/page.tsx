"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { prepareImport, validateExport } from "@/lib/portability";
import { deleteProject, formatUsd, loadProjects, newId, saveProject, type StoredProject } from "@/lib/store";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<StoredProject[] | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProjects(loadProjects());
  }, []);

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
        <h1>Your Projects</h1>
        <span style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
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
      {importMessage && <p className="status-warn">{importMessage}</p>}
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
                      deleteProject(project.id);
                      setProjects(loadProjects());
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
