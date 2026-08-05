/**
 * Client ↔ server project sync (ADR-012). Newest-wins merge on savedAt;
 * every failure is surfaced, never swallowed (LESSONS_LEARNED.md L2). All
 * calls degrade cleanly when the deployment has no database (503) or the
 * user is signed out (401).
 */

import { loadProjects, replaceAllProjects, setAccountEmail, type StoredProject } from "./store";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  /** 'homeowner' | 'professional' */
  role: string;
}

export type AuthResult = { ok: true; user: AuthUser } | { ok: false; error: string };

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

export async function signup(email: string, password: string): Promise<AuthResult> {
  const res = await postJson("/api/v1/auth/signup", { email, password }).catch(() => null);
  if (!res) return { ok: false, error: "Network error — try again." };
  if (!res.ok) return { ok: false, error: await readError(res, "Sign-up failed.") };
  const { user } = (await res.json()) as { user: AuthUser };
  setAccountEmail(user.email);
  return { ok: true, user };
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await postJson("/api/v1/auth/login", { email, password }).catch(() => null);
  if (!res) return { ok: false, error: "Network error — try again." };
  if (!res.ok) return { ok: false, error: await readError(res, "Sign-in failed.") };
  const { user } = (await res.json()) as { user: AuthUser };
  setAccountEmail(user.email);
  return { ok: true, user };
}

export async function logout(): Promise<void> {
  await postJson("/api/v1/auth/logout", {}).catch(() => null);
  setAccountEmail(null);
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/v1/auth/me").catch(() => null);
  if (!res?.ok) return null;
  const { user } = (await res.json()) as { user: AuthUser };
  return user;
}

/** Newest-wins union by project id; ties and unknown ages favor local. */
export function mergeProjects(local: StoredProject[], remote: StoredProject[]): StoredProject[] {
  const byId = new Map<string, StoredProject>();
  for (const p of remote) byId.set(p.project.id, p);
  for (const p of local) {
    const existing = byId.get(p.project.id);
    if (!existing || (p.savedAt ?? 0) >= (existing.savedAt ?? 0)) byId.set(p.project.id, p);
  }
  return [...byId.values()].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}

export type PushResult = { ok: true } | { ok: false; error: string };

export async function pushProject(entry: StoredProject): Promise<PushResult> {
  const res = await fetch("/api/v1/projects", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project: entry }),
  }).catch(() => null);
  if (!res) return { ok: false, error: "Saved locally; server sync failed (network)." };
  if (!res.ok) return { ok: false, error: `Saved locally; ${await readError(res, "server sync failed.")}` };
  return { ok: true };
}

export interface SyncSummary {
  merged: number;
  pushed: number;
  failures: number;
  warning?: string;
}

export type SyncOutcome = { ok: true; summary: SyncSummary } | { ok: false; error: string };

/** Pull remote, merge with local (newest wins), write back both ways. */
export async function syncNow(): Promise<SyncOutcome> {
  const res = await fetch("/api/v1/projects").catch(() => null);
  if (!res) return { ok: false, error: "Network error — try again." };
  if (!res.ok) return { ok: false, error: await readError(res, "Sync failed.") };
  const { projects: remote } = (await res.json()) as { projects: StoredProject[] };

  const merged = mergeProjects(loadProjects(), remote);
  const written = replaceAllProjects(merged);
  if (!written.ok) return { ok: false, error: written.error };

  let pushed = 0;
  let failures = 0;
  for (const entry of merged) {
    const result = await pushProject(entry);
    if (result.ok) pushed++;
    else failures++;
  }
  return { ok: true, summary: { merged: merged.length, pushed, failures, warning: written.warning } };
}
