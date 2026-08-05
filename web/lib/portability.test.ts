import { describe, expect, it } from "vitest";

import type { DesignBrief } from "./types";
import { runDesignLoop } from "./engine/loop";
import {
  EXPORT_FORMAT_VERSION,
  exportFilename,
  exportProject,
  prepareImport,
  validateExport,
} from "./portability";
import type { StoredProject } from "./store";

const brief: DesignBrief = {
  id: "b",
  projectId: "p",
  version: 1,
  program: {
    familySize: 4,
    bedrooms: 3,
    bathrooms: 2,
    office: false,
    gym: false,
    theater: false,
    outdoorKitchen: false,
    garageBays: 2,
  },
  style: "craftsman",
  interiors: {},
  lifestyleNotes: "",
};

function realProject(): StoredProject {
  return {
    project: {
      id: "p-real",
      ownerId: "local",
      name: "Craftsman Dream",
      addressText: null,
      lotWidthFt: 60,
      lotDepthFt: 120,
      budgetCents: 45000000,
      status: "designing",
    },
    brief,
    packages: runDesignLoop(brief, { lotWidthFt: 60, budgetCents: 45000000 }),
    regionCode: "US_SOUTH",
    savedAt: 12345,
  };
}

describe("export → validate round trip", () => {
  it("a real project survives serialization intact", () => {
    const entry = realProject();
    const serialized = JSON.stringify(exportProject(entry));
    const result = validateExport(serialized);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.project).toEqual(entry);
  });

  it("filenames are slugged and safe", () => {
    expect(exportFilename(realProject())).toBe("buildsphere-craftsman-dream.json");
    const weird = realProject();
    weird.project.name = "  ///  ";
    expect(exportFilename(weird)).toBe("buildsphere-project.json");
  });
});

describe("validateExport rejects bad input with clear messages", () => {
  it("garbage, wrong format, and future versions", () => {
    expect(validateExport("not json{{").ok).toBe(false);
    expect(validateExport(JSON.stringify({ hello: 1 })).ok).toBe(false);
    expect(validateExport(null).ok).toBe(false);

    const future = exportProject(realProject());
    future.formatVersion = EXPORT_FORMAT_VERSION + 1;
    const result = validateExport(JSON.stringify(future));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("newer");
  });

  it("mangled project records and unreadable plan models", () => {
    const noId = exportProject(realProject());
    (noId.project.project as { id?: string }).id = undefined;
    expect(validateExport(JSON.stringify(noId)).ok).toBe(false);

    const badModel = exportProject(realProject());
    (badModel.project.packages[0].concept.model as { schemaVersion: number }).schemaVersion = 99;
    const result = validateExport(JSON.stringify(badModel));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("plan model");
  });
});

describe("prepareImport", () => {
  it("keeps the id when free; renames and re-ids on collision — never overwrites", () => {
    const entry = realProject();
    const free = prepareImport(entry, new Set(), () => "p-new");
    expect(free.project.id).toBe("p-real");
    expect(free.savedAt).toBeGreaterThan(12345);

    const collided = prepareImport(entry, new Set(["p-real"]), () => "p-new");
    expect(collided.project.id).toBe("p-new");
    expect(collided.project.name).toBe("Craftsman Dream (imported)");
    // the original object is untouched
    expect(entry.project.id).toBe("p-real");
    expect(entry.project.name).toBe("Craftsman Dream");
  });
});
