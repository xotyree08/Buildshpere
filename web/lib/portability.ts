/**
 * Project export/import — the data-portability trust commitment from the
 * platform specs: a customer's work is theirs, exportable as one JSON file
 * and importable anywhere, with or without an account. Validation is
 * structural and strict on what matters (a parseable parametric model),
 * lenient on what doesn't (optional fields from any app version).
 */

import type { StoredProject } from "./store";

export const EXPORT_FORMAT_VERSION = 1;

export interface ProjectExport {
  format: "buildsphere-project";
  formatVersion: number;
  exportedAt: string;
  project: StoredProject;
}

export function exportProject(entry: StoredProject): ProjectExport {
  return {
    format: "buildsphere-project",
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    project: entry,
  };
}

export function exportFilename(entry: StoredProject): string {
  const slug = entry.project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `buildsphere-${slug || "project"}.json`;
}

export type ImportResult = { ok: true; project: StoredProject } | { ok: false; error: string };

/** Structural validation of untrusted import data. Never throws. */
export function validateExport(raw: unknown): ImportResult {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, error: "That file isn't valid JSON." };
    }
  }
  const d = data as Partial<ProjectExport> | null;
  if (!d || d.format !== "buildsphere-project") {
    return { ok: false, error: "That file isn't a BuildSphere project export." };
  }
  if (typeof d.formatVersion !== "number" || d.formatVersion > EXPORT_FORMAT_VERSION) {
    return { ok: false, error: "This export came from a newer BuildSphere — update the app to import it." };
  }
  const p = d.project as StoredProject | undefined;
  if (!p || typeof p !== "object") return { ok: false, error: "The export contains no project." };
  if (typeof p.project?.id !== "string" || typeof p.project?.name !== "string") {
    return { ok: false, error: "The export's project record is malformed." };
  }
  if (!Array.isArray(p.packages)) return { ok: false, error: "The export's concepts are malformed." };
  for (const pkg of p.packages) {
    const model = pkg?.concept?.model;
    if (
      !model ||
      model.schemaVersion !== 1 ||
      !Array.isArray(model.rooms) ||
      !Array.isArray(model.openings)
    ) {
      return { ok: false, error: "A concept in the export has an unreadable plan model." };
    }
  }
  if (typeof p.regionCode !== "string") return { ok: false, error: "The export's region is malformed." };
  return { ok: true, project: p };
}

/**
 * Prepare a validated import for saving: fresh savedAt, and a new id +
 * "(imported)" name when the id already exists locally — an import must
 * never silently overwrite work.
 */
export function prepareImport(
  project: StoredProject,
  existingIds: ReadonlySet<string>,
  newId: () => string,
): StoredProject {
  const prepared: StoredProject = { ...project, savedAt: Date.now() };
  if (existingIds.has(project.project.id)) {
    prepared.project = {
      ...project.project,
      id: newId(),
      name: `${project.project.name} (imported)`,
    };
  }
  return prepared;
}
