import { describe, expect, it } from "vitest";

import { buildMaintenancePlan, maintenanceCalendar } from "./maintenance";

describe("buildMaintenancePlan", () => {
  it("defaults produce a full plan with universal systems", () => {
    const plan = buildMaintenancePlan();
    const systems = plan.recurring.map((t) => t.system).join(" ");
    expect(systems).toContain("HVAC");
    expect(systems).toContain("Roof");
    expect(plan.routines.some((r) => r.action.includes("air filters"))).toBe(true);
    expect(plan.replacements.some((r) => r.item.includes("Water heater"))).toBe(true);
  });

  it("the chosen materials genuinely change the calendar", () => {
    const cheap = buildMaintenancePlan({ roofing: "asphalt_3tab" });
    const slate = buildMaintenancePlan({ roofing: "slate" });
    const cheapRoof = cheap.replacements.find((r) => r.system === "Roof");
    const slateRoof = slate.replacements.find((r) => r.system === "Roof");
    expect(cheapRoof?.atYear).toBe(18);
    // Slate outlives the 30-year horizon — no replacement scheduled at all.
    expect(slateRoof).toBeUndefined();
  });

  it("cedar siding demands re-staining; brick does not", () => {
    const cedar = buildMaintenancePlan({ siding: "cedar" });
    expect(cedar.recurring.some((t) => t.action.includes("stain"))).toBe(true);
    const brick = buildMaintenancePlan({ siding: "brick_veneer" });
    expect(brick.recurring.some((t) => t.action.includes("stain"))).toBe(false);
    expect(brick.recurring.some((t) => t.action.includes("repoint"))).toBe(true);
  });

  it("an unknown material key fails loudly instead of skipping the system", () => {
    expect(() => buildMaintenancePlan({ roofing: "thatch" })).toThrow(/thatch/);
  });

  it("replacements beyond the 30-year horizon are not scheduled", () => {
    const plan = buildMaintenancePlan({ flooring: "hardwood" });
    expect(plan.replacements.every((r) => r.atYear <= plan.horizonYears)).toBe(true);
  });

  it("calendar year 12 includes the water heater; annual tasks appear every year", () => {
    const plan = buildMaintenancePlan();
    const calendar = maintenanceCalendar(plan);
    const year12 = calendar.find((y) => y.year === 12)!;
    expect(year12.due.some((d) => d.what.includes("Water heater: Water heater"))).toBe(true);
    for (const y of calendar.filter((c) => c.year <= 10)) {
      expect(y.due.some((d) => d.what.includes("Professional HVAC service"))).toBe(true);
    }
  });

  it("is deterministic", () => {
    const a = JSON.stringify(buildMaintenancePlan({ roofing: "cedar_shake", siding: "stucco" }));
    const b = JSON.stringify(buildMaintenancePlan({ roofing: "cedar_shake", siding: "stucco" }));
    expect(a).toBe(b);
  });

  it("honesty note: bands not quotes", () => {
    expect(buildMaintenancePlan().notes.join(" ")).toMatch(/not quotes/);
  });
});
