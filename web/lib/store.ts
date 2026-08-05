/**
 * Client-side project store (ADR-009): localStorage until DATABASE_URL lands.
 * The shape mirrors the Postgres schema in docs/MVP_PHASE1.md so the swap to
 * a server store is mechanical.
 */

import type { DesignBrief, Project } from "./types";
import type { ConceptPackage } from "./engine/loop";
import type { FinishSelections } from "./catalog/materials";
import type { InspirationAnalysis } from "./engine/inspiration";

export interface StoredProject {
  project: Project;
  brief: DesignBrief | null;
  packages: ConceptPackage[];
  regionCode: string;
  /** Interior finish selections; absent on pre-catalog stored data. */
  finishes?: FinishSelections;
  /** Inspiration photo + detected attributes; absent when none uploaded. */
  inspiration?: {
    photoDataUrl: string;
    analysis: InspirationAnalysis | null;
  };
  /** Last local save, ms epoch — drives newest-wins sync merge. */
  savedAt?: number;
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

export type SaveResult =
  | { ok: true; warning?: string }
  | { ok: false; error: string };

/** Strip inspiration photos (the large payloads) but keep their analyses. */
export function shedPhotos(projects: StoredProject[]): StoredProject[] {
  return projects.map((p) =>
    p.inspiration?.photoDataUrl
      ? { ...p, inspiration: { ...p.inspiration, photoDataUrl: "" } }
      : p,
  );
}

/**
 * Persist a project, never silently (LESSONS_LEARNED.md L2). A full
 * localStorage — reachable now that inspiration photos are stored — degrades
 * by shedding photos before it ever loses a project, and says so.
 */
export function saveProject(entry: StoredProject): SaveResult {
  if (!isBrowser()) return { ok: false, error: "Storage is unavailable outside the browser." };
  entry.savedAt = Date.now();
  const all = loadProjects().filter((p) => p.project.id !== entry.project.id);
  all.unshift(entry);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
    return { ok: true };
  } catch {
    // Quota exceeded — retry without the heavy photo payloads.
    try {
      window.localStorage.setItem(KEY, JSON.stringify(shedPhotos(all)));
      return {
        ok: true,
        warning:
          "Local storage was full, so inspiration photos were removed to keep your projects. Detected styles are preserved.",
      };
    } catch {
      return {
        ok: false,
        error:
          "This browser's local storage is full — the project could not be saved. Delete an old project and try again.",
      };
    }
  }
}

export function deleteProject(id: string): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(KEY, JSON.stringify(loadProjects().filter((p) => p.project.id !== id)));
}

/** Replace the whole local set (used by sync after a merge). */
export function replaceAllProjects(projects: StoredProject[]): SaveResult {
  if (!isBrowser()) return { ok: false, error: "Storage is unavailable outside the browser." };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(projects));
    return { ok: true };
  } catch {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(shedPhotos(projects)));
      return { ok: true, warning: "Local storage was full; inspiration photos were removed to fit the synced projects." };
    } catch {
      return { ok: false, error: "This browser's local storage is full — synced projects could not be written." };
    }
  }
}

const ACCOUNT_KEY = "buildsphere.account.v1";

/** Signed-in marker for the auto-sync save path (source of truth is the cookie). */
export function accountEmail(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(ACCOUNT_KEY);
}

export function setAccountEmail(email: string | null): void {
  if (!isBrowser()) return;
  if (email) window.localStorage.setItem(ACCOUNT_KEY, email);
  else window.localStorage.removeItem(ACCOUNT_KEY);
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
