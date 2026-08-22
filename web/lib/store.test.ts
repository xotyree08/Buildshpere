import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteProject, loadProjects, readProjects, saveProject, shedPhotos, type StoredProject } from "./store";

function project(id: string, photo: string | null): StoredProject {
  return {
    project: {
      id,
      ownerId: "local",
      name: "P",
      addressText: null,
      lotWidthFt: 60,
      lotDepthFt: 120,
      budgetCents: 1000,
      status: "designing",
    },
    brief: null,
    packages: [],
    regionCode: "US_NATIONAL",
    inspiration: photo === null ? undefined : { photoDataUrl: photo, analysis: null },
  };
}

describe("shedPhotos (quota-degradation path, LESSONS L2)", () => {
  it("strips photo payloads but keeps projects and analyses", () => {
    const shed = shedPhotos([project("a", "data:image/jpeg;base64,xxxx"), project("b", null)]);
    expect(shed).toHaveLength(2);
    expect(shed[0].inspiration?.photoDataUrl).toBe("");
    expect(shed[0].inspiration).toBeDefined(); // analysis container survives
    expect(shed[1].inspiration).toBeUndefined();
  });

  it("does not mutate the input", () => {
    const original = project("a", "data:image/jpeg;base64,xxxx");
    shedPhotos([original]);
    expect(original.inspiration?.photoDataUrl).toBe("data:image/jpeg;base64,xxxx");
  });
});


/**
 * A localStorage stand-in, so the destructive paths can actually be run.
 *
 * These tests exist because the read path used to swallow every failure into
 * an empty array, and both writes are read-modify-write on top of it — so a
 * store that could not be read turned the next save into "replace everything
 * with this one project" and the next delete into "erase them all". Neither
 * said anything. Both returned success.
 */
const KEY = "buildsphere.projects.v1";

function useStorage(initial: string | null, opts: { throwOnRead?: boolean } = {}) {
  let value = initial;
  const store = {
    getItem: (k: string) => {
      if (opts.throwOnRead) throw new Error("blocked");
      return k === KEY ? value : null;
    },
    setItem: (k: string, v: string) => {
      if (k === KEY) value = v;
    },
    removeItem: () => {},
  };
  vi.stubGlobal("window", { localStorage: store });
  return {
    raw: () => value,
    parsed: () => (value ? (JSON.parse(value) as unknown[]) : []),
  };
}

describe("reading a store that cannot be read", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("says so, instead of reporting an empty store", () => {
    useStorage("{ not json");
    const read = readProjects();
    expect(read.error).toBeTruthy();
    expect(read.projects).toEqual([]);
  });

  it("says so when the browser refuses access at all", () => {
    useStorage("[]", { throwOnRead: true });
    expect(readProjects().error).toBeTruthy();
  });

  it("an empty store is not an error — a new customer is not a broken one", () => {
    useStorage(null);
    expect(readProjects()).toEqual({ projects: [], unreadable: [], error: null });
  });

  it("one unreadable entry costs one entry, not the store", () => {
    useStorage(JSON.stringify([project("a", null), { junk: true }, project("b", null)]));
    const read = readProjects();
    expect(read.error).toBeNull();
    expect(read.projects.map((p) => p.project.id)).toEqual(["a", "b"]);
    expect(read.unreadable).toEqual([{ junk: true }]);
  });
});

describe("writing on top of a store that could not be read", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("saving refuses rather than replacing every project with this one", () => {
    const storage = useStorage("{ not json");
    const before = storage.raw();
    const result = saveProject(project("new", null));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/nothing was overwritten/i);
    expect(storage.raw(), "the damaged data was left exactly as found").toBe(before);
  });

  it("deleting refuses rather than erasing every project", () => {
    const storage = useStorage("{ not json");
    const before = storage.raw();
    const result = deleteProject("a");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/nothing was deleted/i);
    expect(storage.raw()).toBe(before);
  });

  it("an entry nobody can read is carried through a save, not thrown away", () => {
    // Bytes we cannot understand today may still be someone's work.
    const storage = useStorage(JSON.stringify([project("a", null), { junk: true }]));
    expect(saveProject(project("b", null)).ok).toBe(true);
    expect(storage.parsed()).toContainEqual({ junk: true });
    expect(loadProjects().map((p) => p.project.id).sort()).toEqual(["a", "b"]);
  });

  it("and through a delete", () => {
    const storage = useStorage(JSON.stringify([project("a", null), { junk: true }]));
    expect(deleteProject("a").ok).toBe(true);
    expect(storage.parsed()).toEqual([{ junk: true }]);
  });
});

describe("the ordinary paths still work", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("saves, reads back, and deletes", () => {
    useStorage("[]");
    expect(saveProject(project("a", null)).ok).toBe(true);
    expect(saveProject(project("b", null)).ok).toBe(true);
    expect(loadProjects().map((p) => p.project.id)).toEqual(["b", "a"]);
    expect(deleteProject("a").ok).toBe(true);
    expect(loadProjects().map((p) => p.project.id)).toEqual(["b"]);
  });

  it("saving the same project twice replaces it rather than duplicating it", () => {
    useStorage("[]");
    saveProject(project("a", null));
    saveProject(project("a", null));
    expect(loadProjects()).toHaveLength(1);
  });
});
