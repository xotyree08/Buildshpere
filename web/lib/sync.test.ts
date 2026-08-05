import { describe, expect, it } from "vitest";

import type { StoredProject } from "./store";
import { mergeProjects } from "./sync";

function project(id: string, name: string, savedAt?: number): StoredProject {
  return {
    project: {
      id,
      ownerId: "local",
      name,
      addressText: null,
      lotWidthFt: 60,
      lotDepthFt: 120,
      budgetCents: 1000,
      status: "designing",
    },
    brief: null,
    packages: [],
    regionCode: "US_NATIONAL",
    savedAt,
  };
}

describe("mergeProjects (newest wins)", () => {
  it("unions distinct projects from both sides", () => {
    const merged = mergeProjects([project("a", "Local", 10)], [project("b", "Remote", 20)]);
    expect(merged.map((p) => p.project.id).sort()).toEqual(["a", "b"]);
  });

  it("newer side wins a conflict, regardless of direction", () => {
    const localWins = mergeProjects([project("a", "Local-new", 30)], [project("a", "Remote-old", 10)]);
    expect(localWins[0].project.name).toBe("Local-new");

    const remoteWins = mergeProjects([project("a", "Local-old", 10)], [project("a", "Remote-new", 30)]);
    expect(remoteWins[0].project.name).toBe("Remote-new");
  });

  it("ties and missing timestamps favor local (the copy in front of the user)", () => {
    const tie = mergeProjects([project("a", "Local", 20)], [project("a", "Remote", 20)]);
    expect(tie[0].project.name).toBe("Local");

    const missing = mergeProjects([project("a", "Local")], [project("a", "Remote")]);
    expect(missing[0].project.name).toBe("Local");
  });

  it("sorts newest first and handles empty sides", () => {
    const merged = mergeProjects([], [project("old", "Old", 1), project("new", "New", 99)]);
    expect(merged.map((p) => p.project.id)).toEqual(["new", "old"]);
    expect(mergeProjects([], [])).toEqual([]);
  });
});
