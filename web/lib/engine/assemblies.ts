/**
 * Wall assemblies: what a wall is made of, layer by layer.
 *
 * Geometry says where a wall is. An assembly says what it is, and the two are
 * deliberately separate — the same six inches of plan can be a party wall, a
 * plumbing wall or an insulated exterior wall, and they do not cost the same.
 * Quantities come from the wall's measured area times these layers, rather
 * than from a rate per foot of "wall" that averages all of them together.
 *
 * Layer thicknesses are real. The modelled partition gap is uniform at half a
 * foot today, which is thinner than a finished exterior wall really is;
 * letting the packer allocate a different gap per wall class is the next step
 * and is recorded in the tests. It does not affect these quantities, because
 * every layer here is priced by the square foot of wall face.
 */

export type LayerMaterial =
  | "GYPSUM_BOARD"
  | "WOOD_STUD_CAVITY"
  | "BATT_INSULATION"
  | "SHEATHING"
  | "AIR_BARRIER"
  | "SIDING"
  | "BRICK_VENEER"
  | "RAILING";

export interface AssemblyLayer {
  material: LayerMaterial;
  thicknessFt: number;
  /** Installed cost per square foot of wall face, material plus labour. */
  costPerSqft: number;
}

export interface WallAssembly {
  id: string;
  label: string;
  layers: AssemblyLayer[];
}

export const ASSEMBLIES: Record<string, WallAssembly> = {
  EXT_WALL_2X6: {
    id: "EXT_WALL_2X6",
    label: "2x6 exterior wall, sheathed and clad",
    layers: [
      { material: "GYPSUM_BOARD", thicknessFt: 0.042, costPerSqft: 2.35 },
      { material: "WOOD_STUD_CAVITY", thicknessFt: 0.458, costPerSqft: 4.9 },
      { material: "BATT_INSULATION", thicknessFt: 0, costPerSqft: 1.55 },
      { material: "SHEATHING", thicknessFt: 0.042, costPerSqft: 2.1 },
      { material: "AIR_BARRIER", thicknessFt: 0.003, costPerSqft: 0.55 },
      { material: "SIDING", thicknessFt: 0.052, costPerSqft: 6.4 },
    ],
  },
  INT_WALL_2X4: {
    id: "INT_WALL_2X4",
    label: "2x4 interior partition, boarded both faces",
    layers: [
      { material: "GYPSUM_BOARD", thicknessFt: 0.042, costPerSqft: 2.35 },
      { material: "WOOD_STUD_CAVITY", thicknessFt: 0.292, costPerSqft: 3.4 },
      { material: "GYPSUM_BOARD", thicknessFt: 0.042, costPerSqft: 2.35 },
    ],
  },
  PORCH_RAIL: {
    id: "PORCH_RAIL",
    label: "Porch railing",
    layers: [{ material: "RAILING", thicknessFt: 0.29, costPerSqft: 18.0 }],
  },
};

/** Installed cost of one square foot of this assembly's face. */
export function assemblyCostPerSqft(id: string): number {
  const assembly = ASSEMBLIES[id];
  if (!assembly) return 0;
  return assembly.layers.reduce((sum, layer) => sum + layer.costPerSqft, 0);
}
