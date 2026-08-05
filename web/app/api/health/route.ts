import { NextResponse } from "next/server";

/**
 * Liveness + config presence. Reports which integrations are configured
 * without ever echoing secret values.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "buildsphere-web",
    config: {
      database: Boolean(process.env.DATABASE_URL),
      redis: Boolean(process.env.REDIS_URL),
      ai: Boolean(process.env.AI_API_KEY),
      storage: Boolean(process.env.S3_BUCKET),
    },
  });
}
