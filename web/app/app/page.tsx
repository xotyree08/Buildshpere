"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { deleteProject, formatUsd, loadProjects, type StoredProject } from "@/lib/store";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<StoredProject[] | null>(null);

  useEffect(() => {
    setProjects(loadProjects());
  }, []);

  return (
    <main>
      <div className="topbar">
        <h1>Your Projects</h1>
        <Link className="btn" href="/app/new">
          New home design
        </Link>
      </div>
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
