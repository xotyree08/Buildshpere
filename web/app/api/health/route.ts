import { NextResponse } from "next/server";

/**
 * Liveness + config health (LESSONS_LEARNED.md L4). Every integration
 * reports either "ok" or the exact env var and remediation — a bare
 * boolean turns configuration failures into blind store rejections.
 * Never echoes secret values.
 */

function check(configured: boolean, fix: string): { status: "ok" | "unconfigured"; fix?: string } {
  return configured ? { status: "ok" } : { status: "unconfigured", fix };
}

export async function GET() {
  const integrations = {
    ai: check(
      Boolean(process.env.AI_API_KEY ?? process.env.ANTHROPIC_API_KEY),
      "Set AI_API_KEY (or ANTHROPIC_API_KEY) in the deployment env, then redeploy. Until then, inspiration-photo analysis returns 503 and the interview falls back to manual style choice.",
    ),
    database: check(
      Boolean(process.env.DATABASE_URL),
      "Set DATABASE_URL when the server store lands (ADR-009). Until then, projects persist in each browser's localStorage only.",
    ),
    redis: check(
      Boolean(process.env.REDIS_URL),
      "Set REDIS_URL when the job queue lands (ADR-008). Until then, generation runs synchronously in-request.",
    ),
    storage: check(
      Boolean(process.env.S3_BUCKET),
      "Set S3_BUCKET when render-asset storage lands. Until then, no server-side assets are stored.",
    ),
  };

  const degraded = Object.entries(integrations)
    .filter(([, v]) => v.status !== "ok")
    .map(([k]) => k);

  return NextResponse.json({
    ok: true,
    service: "buildsphere-web",
    integrations,
    degraded,
    note: "NEXT_PUBLIC_* env vars are inlined at build time — changing one requires a redeploy to take effect.",
  });
}
