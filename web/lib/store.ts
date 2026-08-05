/**
 * Client-side project store (ADR-009): localStorage until DATABASE_URL lands.
 * The shape mirrors the Postgres schema in docs/MVP_PHASE1.md so the swap to
 * a server store is mechanical.
 */

import type { DesignBrief, Project } from "./types";
import type { ConceptPackage } from "./engine/loop";

export interface StoredProject {
  project: Project;
  brief: DesignBrief | null;
  packages: ConceptPackage[];
  regionCode: string;
}

const KEY = "buildsphere.projects.v1";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadProjects(): StoredProject[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredProject[]) : [];
  } catch {
    return [];
  }
}

export function loadProject(id: string): StoredProject | null {
  return loadProjects().find((p) => p.project.id === id) ?? null;
}

export function saveProject(entry: StoredProject): void {
  if (!isBrowser()) return;
  const all = loadProjects().filter((p) => p.project.id !== entry.project.id);
  all.unshift(entry);
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

export function deleteProject(id: string): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(KEY, JSON.stringify(loadProjects().filter((p) => p.project.id !== id)));
}

export function newId(): string {
  return `p-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
