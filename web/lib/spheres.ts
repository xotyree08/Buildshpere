export interface SphereInfo {
  key: string;
  name: string;
  tagline: string;
  phase: number;
  docPath: string;
}

export const SPHERES: SphereInfo[] = [
  {
    key: "landsphere",
    name: "LandSphere",
    tagline: "Know what the land allows before design begins.",
    phase: 3,
    docPath: "docs/systems/01-LANDSPHERE.md",
  },
  {
    key: "designsphere",
    name: "DesignSphere",
    tagline: "AI architectural design with a health score on every concept.",
    phase: 1,
    docPath: "docs/systems/02-DESIGNSPHERE.md",
  },
  {
    key: "modelsphere",
    name: "ModelSphere",
    tagline: "See it before it's built — renders, walkthroughs, AR.",
    phase: 1,
    docPath: "docs/systems/03-MODELSPHERE.md",
  },
  {
    key: "costsphere",
    name: "CostSphere",
    tagline: "A live, honest number on every design decision.",
    phase: 1,
    docPath: "docs/systems/04-COSTSPHERE.md",
  },
  {
    key: "engineersphere",
    name: "EngineerSphere",
    tagline: "Licensed professionals review, revise, and sign.",
    phase: 2,
    docPath: "docs/systems/05-ENGINEERSPHERE.md",
  },
  {
    key: "permitsphere",
    name: "PermitSphere",
    tagline: "From approved drawings to permitted project.",
    phase: 3,
    docPath: "docs/systems/06-PERMITSPHERE.md",
  },
  {
    key: "buildsphere-pro",
    name: "BuildSphere Pro",
    tagline: "Run the build: schedule, money, people, paperwork.",
    phase: 4,
    docPath: "docs/systems/07-BUILDSPHERE-PRO.md",
  },
  {
    key: "hometwin",
    name: "HomeTwin",
    tagline: "The home's permanent, inheritable memory.",
    phase: 5,
    docPath: "docs/systems/08-HOMETWIN.md",
  },
];
