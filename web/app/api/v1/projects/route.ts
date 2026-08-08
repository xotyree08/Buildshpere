import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { canSyncNewProject, deleteProject, listProjects, LICENSE_SYNC_MESSAGE, upsertProject } from "@/lib/server/projects";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import type { StoredProject } from "@/lib/store";

/** Project sync, mirroring the client's StoredProject shape (ADR-009/012). */

export async function GET() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  return NextResponse.json({ projects: await listProjects(db, user.id) });
}

export async function PUT(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  let body: { project?: StoredProject };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const entry = body.project;
  if (!entry?.project?.id || typeof entry.project.name !== "string") {
    return NextResponse.json({ error: "project payload is required." }, { status: 422 });
  }

  if (!(await canSyncNewProject(db, user.id, entry.project.id))) {
    return NextResponse.json({ error: LICENSE_SYNC_MESSAGE }, { status: 402 });
  }

  try {
    await upsertProject(db, user.id, entry);
  } catch {
    // L2: a failed write must never look like a success.
    return NextResponse.json({ error: "Saving to the server failed — your local copy is intact." }, { status: 500 });
  }
  await recordAudit(db, user.id, "project.upsert", entry.project.id, entry.project.name);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query parameter is required." }, { status: 422 });
  await deleteProject(db, user.id, id);
  await recordAudit(db, user.id, "project.delete", id);
  return NextResponse.json({ ok: true });
}
