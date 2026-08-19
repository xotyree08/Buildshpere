import { it } from "vitest";
import { generateConcepts } from "../generate";
import type { DesignBrief } from "../../types";
it("plan", () => {
  const c = generateConcepts({ id:"b", projectId:"p", version:1,
    program:{familySize:4,bedrooms:4,bathrooms:3.5,office:true,gym:false,theater:false,outdoorKitchen:true,garageBays:2},
    style:"craftsman", interiors:{}, lifestyleNotes:"" }, 90, 110)[0];
  for (const r of c.model.rooms.filter(r=>r.level===0).sort((a,b)=>a.rect[1]-b.rect[1]||a.rect[0]-b.rect[0]))
    console.log(`z=${r.rect[1].toFixed(1).padStart(5)} x=${r.rect[0].toFixed(1).padStart(5)}  ${r.rect[2].toFixed(1)}x${r.rect[3].toFixed(1)}  ${r.label}`);
});
