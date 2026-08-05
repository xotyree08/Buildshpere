import { describe, expect, it } from "vitest";

import { EMPTY_RECORDS, summarizeRecords, warrantyState, type OwnershipRecords } from "./records";

const DAY = 24 * 60 * 60 * 1000;
const now = 1_800_000_000_000;

describe("ownership records", () => {
  it("warranty states: active, expiring inside 90 days, expired", () => {
    expect(warrantyState({ id: "w1", item: "Roof", provider: "GAF", expiresAt: now + 200 * DAY }, now)).toBe("active");
    expect(warrantyState({ id: "w2", item: "HVAC", provider: "Trane", expiresAt: now + 30 * DAY }, now)).toBe("expiring");
    expect(warrantyState({ id: "w3", item: "Paint", provider: "SW", expiresAt: now - DAY }, now)).toBe("expired");
  });

  it("summary counts punch status and sorts expiring warranties soonest-first", () => {
    const records: OwnershipRecords = {
      warranties: [
        { id: "w1", item: "Windows", provider: "Andersen", expiresAt: now + 80 * DAY },
        { id: "w2", item: "HVAC", provider: "Trane", expiresAt: now + 10 * DAY },
        { id: "w3", item: "Old", provider: "X", expiresAt: now - 5 * DAY },
      ],
      equipment: [],
      punch: [
        { id: "p1", roomLabel: "Kitchen", note: "Chipped tile", status: "open", at: now },
        { id: "p2", roomLabel: "Primary Bath", note: "Door rubs", status: "done", at: now },
        { id: "p3", roomLabel: "Office", note: "Paint touch-up", status: "open", at: now },
      ],
    };
    const s = summarizeRecords(records, now);
    expect(s.openPunch).toBe(2);
    expect(s.donePunch).toBe(1);
    expect(s.expiringSoon.map((w) => w.item)).toEqual(["HVAC", "Windows"]);
    expect(s.expired.map((w) => w.item)).toEqual(["Old"]);
  });

  it("empty records summarize to zeros", () => {
    const s = summarizeRecords(EMPTY_RECORDS, now);
    expect(s.openPunch).toBe(0);
    expect(s.expiringSoon).toHaveLength(0);
    expect(s.expired).toHaveLength(0);
  });
});
