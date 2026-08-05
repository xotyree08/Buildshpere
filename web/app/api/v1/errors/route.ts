import { NextResponse } from "next/server";

/**
 * Client crash reports (LESSONS_LEARNED.md L3). Logged server-side so the
 * deployment's log stream has runtime visibility from day one; graduates
 * to a real error tracker before payments launch. Accepts a tiny payload,
 * never stores PII, never fails loudly back to the crashing client.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { message?: string; digest?: string | null; url?: string | null };
    console.error("[client-error]", {
      message: String(body.message ?? "unknown").slice(0, 500),
      digest: body.digest ?? null,
      url: body.url ?? null,
      at: new Date().toISOString(),
    });
  } catch {
    // Malformed report — still acknowledge; the client is already in trouble.
  }
  return NextResponse.json({ ok: true });
}
