/**
 * Ownership records: the home's paper trail — warranties with expiry
 * tracking, the equipment registry (model/serial for every service
 * call), and the closeout punch list. Pure data + helpers; local-first
 * on the project record and synced like everything else.
 */

export interface WarrantyRecord {
  id: string;
  item: string;
  provider: string;
  /** ms epoch of expiration. */
  expiresAt: number;
}

export interface EquipmentRecord {
  id: string;
  name: string;
  brand: string;
  modelNo: string;
  serial: string;
}

export interface PunchItem {
  id: string;
  roomLabel: string;
  note: string;
  status: "open" | "done";
  at: number;
}

export interface OwnershipRecords {
  warranties: WarrantyRecord[];
  equipment: EquipmentRecord[];
  punch: PunchItem[];
}

export const EMPTY_RECORDS: OwnershipRecords = { warranties: [], equipment: [], punch: [] };

export type WarrantyState = "active" | "expiring" | "expired";

const EXPIRING_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export function warrantyState(w: WarrantyRecord, now: number): WarrantyState {
  if (w.expiresAt < now) return "expired";
  if (w.expiresAt < now + EXPIRING_WINDOW_MS) return "expiring";
  return "active";
}

export interface RecordsSummary {
  openPunch: number;
  donePunch: number;
  expiringSoon: WarrantyRecord[];
  expired: WarrantyRecord[];
}

export function summarizeRecords(records: OwnershipRecords, now: number): RecordsSummary {
  const expiringSoon = records.warranties
    .filter((w) => warrantyState(w, now) === "expiring")
    .sort((a, b) => a.expiresAt - b.expiresAt);
  const expired = records.warranties
    .filter((w) => warrantyState(w, now) === "expired")
    .sort((a, b) => b.expiresAt - a.expiresAt);
  return {
    openPunch: records.punch.filter((p) => p.status === "open").length,
    donePunch: records.punch.filter((p) => p.status === "done").length,
    expiringSoon,
    expired,
  };
}
