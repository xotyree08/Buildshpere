/**
 * Client-side project store (ADR-009): localStorage until DATABASE_URL lands.
 * The shape mirrors the Postgres schema in docs/MVP_PHASE1.md so the swap to
 * a server store is mechanical.
 */

import type { DesignBrief, Project, SiteConstraint } from "./types";
import type { ConceptPackage } from "./engine/loop";
import type { FinishSelections } from "./catalog/materials";
import type { InspirationAnalysis } from "./engine/inspiration";
import type { SetbackRules } from "./engine/site";

export interface StoredProject {
  project: Project;
  brief: DesignBrief | null;
  packages: ConceptPackage[];
  regionCode: string;
  /** Interior finish selections; absent on pre-catalog stored data. */
  finishes?: FinishSelections;
  /** Interior design scheme key; absent means the style's natural scheme. */
  interiorScheme?: string;
  /** Change orders + draw payments recorded during construction. */
  construction?: import("./engine/buildtrack").ConstructionLog;
  /** Ownership records: warranties, equipment registry, punch list. */
  records?: import("./records").OwnershipRecords;
  /** User-entered jurisdiction setback rules; absent means generic defaults. */
  setbacks?: SetbackRules;
  /** Site constraint register (BS-LAND-004); absent means none recorded. */
  constraints?: SiteConstraint[];
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

/**
 * What came back from storage, including what did not.
 *
 * `error` is set when the store could not be read at all. `unreadable` holds
 * entries that parsed as JSON but are not projects — kept, not discarded, so a
 * later write can put them back exactly as they were found.
 */
export interface StoredRead {
  projects: StoredProject[];
  unreadable: unknown[];
  error: string | null;
}

/** The least that has to be true for an entry to be a project we can act on. */
function isStoredProject(value: unknown): value is StoredProject {
  if (typeof value !== "object" || value === null) return false;
  const project = (value as { project?: unknown }).project;
  if (typeof project !== "object" || project === null) return false;
  return typeof (project as { id?: unknown }).id === "string";
}

/**
 * Read the store, and say so when it cannot be read.
 *
 * This used to be a cast inside a catch that returned an empty array, which
 * made a corrupt store indistinguishable from a new user. That would be merely
 * confusing if reading were all it did — but saveProject and deleteProject are
 * read-modify-write on top of this, so a failed read made saveProject overwrite
 * every project with the one being saved, and made deleting one project write
 * an empty array over all of them. Both reported success. LESSONS_LEARNED L2
 * says a failed write must never look like a successful one, and cites this
 * file; the failure was arriving through the read.
 */
export function readProjects(): StoredRead {
  const empty: StoredRead = { projects: [], unreadable: [], error: null };
  if (!isBrowser()) return empty;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return { ...empty, error: "This browser blocked access to local storage." };
  }
  if (!raw) return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...empty, error: "Saved projects could not be read — the stored data is damaged." };
  }
  if (!Array.isArray(parsed)) {
    return { ...empty, error: "Saved projects could not be read — the stored data is not a project list." };
  }

  // One bad entry loses one entry, not the whole store, and the bad entry is
  // carried rather than dropped: bytes nobody can read today may still be
  // readable by someone tomorrow, and they are not ours to throw away.
  const projects: StoredProject[] = [];
  const unreadable: unknown[] = [];
  for (const entry of parsed) {
    if (isStoredProject(entry)) projects.push(entry);
    else unreadable.push(entry);
  }
  return { projects, unreadable, error: null };
}

export function loadProjects(): StoredProject[] {
  return readProjects().projects;
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
  // Refuse rather than clobber. This is a read-modify-write, and if the read
  // failed the modify half is built on nothing — writing it would replace every
  // stored project with this one.
  const read = readProjects();
  if (read.error) return { ok: false, error: `${read.error} Nothing was overwritten.` };
  entry.savedAt = Date.now();
  const all = read.projects.filter((p) => p.project.id !== entry.project.id);
  all.unshift(entry);
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...all, ...read.unreadable]));
    return { ok: true };
  } catch {
    // Quota exceeded — retry without the heavy photo payloads.
    try {
      window.localStorage.setItem(KEY, JSON.stringify([...shedPhotos(all), ...read.unreadable]));
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

export function deleteProject(id: string): SaveResult {
  if (!isBrowser()) return { ok: false, error: "Storage is unavailable outside the browser." };
  // The most destructive path in the file: deleting one project on top of a
  // failed read wrote an empty array over every project the user had.
  const read = readProjects();
  if (read.error) return { ok: false, error: `${read.error} Nothing was deleted.` };
  const kept = read.projects.filter((p) => p.project.id !== id);
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...kept, ...read.unreadable]));
    return { ok: true };
  } catch {
    return { ok: false, error: "This browser's local storage could not be written — the project was not deleted." };
  }
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
