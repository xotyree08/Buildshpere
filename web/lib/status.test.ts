import { describe, expect, it } from "vitest";

import { deriveDesignStatus, FUTURE_STATUSES, STATUS_INFO } from "./status";

describe("deriveDesignStatus — the Appendix A ladder, never overstated", () => {
  it("no review → preliminary, never approved", () => {
    const s = deriveDesignStatus({ reviewStatus: null, revisedSinceReview: false });
    expect(s.key).toBe("preliminary");
  });

  it("requested and claimed → under review", () => {
    expect(deriveDesignStatus({ reviewStatus: "requested", revisedSinceReview: false }).key).toBe("under_review");
    expect(deriveDesignStatus({ reviewStatus: "claimed", revisedSinceReview: false }).key).toBe("under_review");
  });

  it("approval holds only while nothing changed — edits demote it", () => {
    expect(deriveDesignStatus({ reviewStatus: "approved", revisedSinceReview: false }).key).toBe(
      "approved_for_coordination",
    );
    // The overstating bug this exists to prevent: edit after approval must demote.
    expect(deriveDesignStatus({ reviewStatus: "approved", revisedSinceReview: true }).key).toBe("preliminary");
  });

  it("changes_requested → preliminary (the work goes back)", () => {
    expect(deriveDesignStatus({ reviewStatus: "changes_requested", revisedSinceReview: false }).key).toBe(
      "preliminary",
    );
  });

  it("no rung ever claims permit or construction authority (spec §2.3)", () => {
    for (const info of Object.values(STATUS_INFO)) {
      expect(info.label.toLowerCase()).not.toContain("permit");
      expect(info.label.toLowerCase()).not.toContain("construction");
    }
    // future rungs exist in the ladder but only as names, unreachable by derivation
    expect(FUTURE_STATUSES).toContain("Permit Approved");
  });
});
