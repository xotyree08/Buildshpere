import { NextResponse } from "next/server";

import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { exportAccountData } from "@/lib/server/privacy";

/** The §11.2 access/export right: everything the account owns, no secrets. */
export async function GET() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  const data = await exportAccountData(db, user);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="buildsphere-account.json"',
    },
  });
}
