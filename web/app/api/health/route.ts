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
    // The one integration people actually ask about, and the only one that was
    // missing: without it "Photoreal still" answers 503 and the app has no way
    // to produce a photograph at all.
    photoreal: check(
      Boolean(process.env.REPLICATE_API_TOKEN),
      "Set REPLICATE_API_TOKEN (replicate.com → Account → API tokens) in the deployment env, then redeploy. Until then, photoreal stills, 360° scenes and rendered walkthroughs all return 503 and the real-time 3D viewer is the only visualization.",
    ),
    storage: check(
      Boolean(process.env.S3_BUCKET),
      "Set S3_BUCKET when render-asset storage lands. Until then, no server-side assets are stored.",
    ),
    payments_apple: check(
      Boolean(process.env.APPLE_SHARED_SECRET),
      "Set APPLE_SHARED_SECRET (App Store Connect → App Information → Shared Secret) to enable App Store receipt validation. Until then, Apple purchases are refused with this exact message and nothing is unlocked.",
    ),
    payments_google: check(
      Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.ANDROID_PACKAGE_NAME),
      "Set GOOGLE_SERVICE_ACCOUNT_JSON and ANDROID_PACKAGE_NAME to enable Play Billing validation. Until then, Google purchases are refused with this exact message and nothing is unlocked.",
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
